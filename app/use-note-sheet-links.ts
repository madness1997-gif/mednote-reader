import { useEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent, type RefObject } from "react";
import { noteRichTextController, richTextRangeBelongsToEditor } from "./note-rich-text-controller";
import { noteStore, type NoteStoreSnapshot } from "./note-store";
import { escapeHtml } from "./rich-text-html";
import { NOTE_SHEET_LINK_HINT, noteSheetHref, noteSheetLinkTargets, parseNoteSheetHref } from "./note-sheet-link";

type LinkSession = {
  sourceSheetId: string;
  editorId: string;
  editor: HTMLElement;
  range: Range;
  sheetId: string;
  label: string;
  existingLink: HTMLAnchorElement | null;
};

type Options = {
  state: NoteStoreSnapshot;
  activeSheetId: string;
  hydrating: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  openSheet: (sheetId: string) => Promise<void>;
  notify: (message: string) => void;
};

export function useNoteSheetLinks({ state, activeSheetId, hydrating, stageRef, openSheet, notify }: Options) {
  const [session, setSession] = useState<LinkSession | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const navigating = useRef(false);
  const focusFrame = useRef<number | null>(null);
  const targets = useMemo(() => state.structure ? noteSheetLinkTargets(state.structure) : [], [state.structure]);

  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);

  useEffect(() => {
    if (session && (session.sourceSheetId !== activeSheetId || hydrating)) setSession(null);
  }, [activeSheetId, hydrating, session]);

  useEffect(() => {
    if (!scrollTarget || activeSheetId !== scrollTarget || hydrating || state.hydratingPageId) return;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const snapshot = noteStore.getSnapshot();
        if (snapshot.hydratingSheetId || snapshot.hydratingPageId) return;
        if (snapshot.structure?.active.activeSheetId !== scrollTarget) {
          setScrollTarget(null);
          return;
        }
        const stage = stageRef.current;
        const paper = stage?.querySelector<HTMLElement>(".note-paper.interactive");
        if (stage && paper?.dataset.notePageId === scrollTarget) {
          stage.scrollTop += paper.getBoundingClientRect().top - stage.getBoundingClientRect().top - 12;
          setScrollTarget(null);
        }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [activeSheetId, hydrating, scrollTarget, stageRef, state.hydratingPageId, state.pageSheetContents]);

  const createLink = () => {
    const target = noteRichTextController.activeEditorRef.current;
    const range = noteRichTextController.captureCurrentSelection() ?? noteRichTextController.savedRangeRef.current;
    if (hydrating || !target?.editor.isConnected || !target.editor.isContentEditable || !range || !richTextRangeBelongsToEditor(range, target.editor)) {
      notify("Đặt con trỏ hoặc bôi chọn chữ trong nội dung ghi chú trước khi tạo liên kết");
      return;
    }
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const anchor = element?.closest<HTMLAnchorElement>("a[href]") ?? null;
    const existingLink = anchor && target.editor.contains(anchor) && parseNoteSheetHref(anchor.getAttribute("href")) ? anchor : null;
    const savedRange = range.cloneRange();
    if (existingLink) savedRange.selectNode(existingLink);
    setSession({ sourceSheetId: activeSheetId, editorId: target.id, editor: target.editor, range: savedRange, sheetId: existingLink ? parseNoteSheetHref(existingLink.getAttribute("href"))! : "", label: existingLink?.textContent ?? range.toString(), existingLink });
  };

  const restoreSession = () => {
    if (!session || session.sourceSheetId !== noteStore.getSnapshot().structure?.active.activeSheetId || !session.editor.isConnected || !richTextRangeBelongsToEditor(session.range, session.editor)) return false;
    noteRichTextController.activate(session.editorId, session.editor, session.range);
    return true;
  };

  const cancel = () => {
    setSession(null);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (restoreSession()) noteRichTextController.restoreSelection();
    });
  };

  const save = (sheetId: string, label: string) => {
    const structure = noteStore.getSnapshot().structure;
    const destination = structure && noteSheetLinkTargets(structure).find((target) => target.sheetId === sheetId);
    if (!destination) { notify("Sheet đích không còn tồn tại. Hãy chọn sheet khác."); return false; }
    if (!restoreSession()) { setSession(null); notify("Vị trí chèn đã thay đổi. Hãy chọn lại nội dung cần tạo liên kết."); return true; }
    const html = `<a href="${escapeHtml(noteSheetHref(sheetId))}" title="${escapeHtml(NOTE_SHEET_LINK_HINT)}">${escapeHtml(label.trim() || destination.label)}</a>`;
    // Use the browser editing command so inserting/replacing the link is undoable.
    if (!noteRichTextController.execCommand("insertHTML", false, html)) {
      notify("Không thể chèn liên kết tại vị trí này");
      return false;
    }
    setSession(null);
    notify("Đã lưu liên kết đến sheet. Ctrl+bấm để mở khi đang sửa chữ.");
    return true;
  };

  const remove = () => {
    if (!session?.existingLink || !restoreSession()) return false;
    if (noteRichTextController.execCommand("insertHTML", false, session.existingLink.innerHTML)) {
      setSession(null);
      notify("Đã gỡ liên kết, giữ lại nội dung chữ");
      return true;
    }
    return false;
  };

  const navigate = async (sheetId: string) => {
    if (navigating.current) return;
    const structure = noteStore.getSnapshot().structure;
    if (!structure?.sheets.some((sheet) => sheet.id === sheetId)) {
      notify("Sheet được liên kết đã bị xóa hoặc không có trong thư viện này");
      return;
    }
    navigating.current = true;
    try {
      // Commit the focused editor before the store flushes the source sheet.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.isContentEditable) focused.blur();
      await openSheet(sheetId);
      setScrollTarget(sheetId);
      notify("Đã mở sheet được liên kết");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể mở sheet được liên kết");
    } finally {
      navigating.current = false;
    }
  };

  const followLink = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if ("key" in event && event.key !== "Enter") return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    const sheetId = parseNoteSheetHref(anchor?.getAttribute("href") ?? null);
    if (!anchor || !sheetId) return;
    event.preventDefault();
    if (anchor.isContentEditable && !event.ctrlKey && !event.metaKey) return;
    event.stopPropagation();
    void navigate(sheetId);
  };

  return { session, targets, createLink, cancel, save, remove, followLink };
}
