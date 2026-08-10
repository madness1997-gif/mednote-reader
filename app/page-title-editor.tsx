"use client";

import { useCallback, useEffect, useRef } from "react";
import { noteStore } from "./note-store";

export const PAGE_TITLE_DEBOUNCE_MS = 280;

type PageTitleEditorProps = {
  pageId: string;
  title: string;
  className?: string;
  editable?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onActivate?: () => void;
  onError?: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể đổi tên Page";
}

export default function PageTitleEditor({
  pageId,
  title,
  className = "",
  editable = true,
  placeholder = "Nhập tiêu đề",
  ariaLabel = "Tiêu đề Page",
  onActivate,
  onError,
}: PageTitleEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const pageIdRef = useRef(pageId);
  const draftRef = useRef(title);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const commit = useCallback((targetPageId: string, nextTitle: string, revision: number) => {
    if (!targetPageId) return;
    if (pageIdRef.current === targetPageId && revisionRef.current === revision) dirtyRef.current = false;
    void noteStore.renamePage(targetPageId, nextTitle).then((result) => {
      if (pageIdRef.current !== targetPageId || revisionRef.current !== revision) return;
      const committedTitle = result.structure.pages.find((page) => page.id === targetPageId)?.title;
      if (committedTitle === undefined) return;
      draftRef.current = committedTitle;
      const editor = editorRef.current;
      if (editor && (document.activeElement !== editor || committedTitle !== nextTitle) && editor.textContent !== committedTitle) {
        editor.textContent = committedTitle;
      }
    }).catch((error) => {
      if (pageIdRef.current === targetPageId && revisionRef.current === revision) dirtyRef.current = true;
      onError?.(errorMessage(error));
    });
  }, [onError]);

  const flush = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current || !pageIdRef.current) return;
    commit(pageIdRef.current, draftRef.current, revisionRef.current);
  }, [clearTimer, commit]);

  const schedule = useCallback(() => {
    clearTimer();
    const targetPageId = pageIdRef.current;
    const nextTitle = draftRef.current;
    const revision = revisionRef.current;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!dirtyRef.current) return;
      commit(targetPageId, nextTitle, revision);
    }, PAGE_TITLE_DEBOUNCE_MS);
  }, [clearTimer, commit]);

  useEffect(() => {
    pageIdRef.current = pageId;
    revisionRef.current += 1;
    clearTimer();
    dirtyRef.current = false;
    draftRef.current = title;
    if (editorRef.current && editorRef.current.textContent !== title) editorRef.current.textContent = title;
  }, [clearTimer, pageId]);

  useEffect(() => {
    if (pageIdRef.current !== pageId) return;
    if (dirtyRef.current && document.activeElement === editorRef.current) return;
    draftRef.current = title;
    if (editorRef.current && editorRef.current.textContent !== title) editorRef.current.textContent = title;
  }, [pageId, title]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!dirtyRef.current || !pageIdRef.current) return;
    const targetPageId = pageIdRef.current;
    const nextTitle = draftRef.current;
    dirtyRef.current = false;
    void noteStore.renamePage(targetPageId, nextTitle).catch((error) => onError?.(errorMessage(error)));
  }, [onError]);

  return <div
    ref={editorRef}
    className={className}
    data-page-title-editor={pageId || undefined}
    data-placeholder={placeholder}
    role="textbox"
    aria-label={ariaLabel}
    aria-multiline="false"
    contentEditable={editable}
    suppressContentEditableWarning
    spellCheck={false}
    onFocus={onActivate}
    onInput={(event) => {
      draftRef.current = (event.currentTarget.textContent || "").replace(/[\r\n]+/g, " ");
      dirtyRef.current = true;
      revisionRef.current += 1;
      schedule();
    }}
    onBlur={flush}
    onKeyDown={(event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      flush();
      event.currentTarget.blur();
    }}
    onPaste={(event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
      document.execCommand("insertText", false, text);
    }}
  />;
}
