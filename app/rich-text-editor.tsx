import { useEffect, useRef } from "react";
import { sanitizeRichTextHtml } from "./note-runtime-adapter";
import { noteRichTextController, richTextRangeBelongsToEditor } from "./note-rich-text-controller";

export type RichTextEditorProps = {
  editorId: string;
  className: string;
  html: string;
  editable: boolean;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  singleLine?: boolean;
  onChange: (html: string, text: string) => void;
  onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeInput: (editorId: string, editor: HTMLElement) => void;
};

function insertPlainText(editor: HTMLElement, value: string) {
  const controller = noteRichTextController;
  const selection = window.getSelection();
  const current = selection?.rangeCount ? selection.getRangeAt(0) : null;
  controller.activate(editor.dataset.richEditorId ?? "editor", editor, current && richTextRangeBelongsToEditor(current, editor) ? current : null);
  controller.insertText(value);
}

function editorText(editor: HTMLElement) {
  return editor.innerText.replace(/\u00a0/g, " ").replace(/\u200b/g, "");
}

function editorIsTrulyEmpty(editor: HTMLElement) {
  // textContent stays empty for browser caret sentinels such as <div><br></div>,
  // but still preserves an actual user-entered space. Do not use trim() here:
  // Space is a real editing input and clearing the DOM on Space loses the caret.
  return (editor.textContent ?? "").replace(/\u200b/g, "").length === 0;
}

export function RichTextEditor({ editorId, className, html, editable, placeholder, ariaLabel, autoFocus = false, singleLine = false, onChange, onActivate, onNormalizeInput }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const compositionCommitFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.innerHTML === html || document.activeElement === editor || composingRef.current) return;
    editor.innerHTML = html;
  }, [html]);

  useEffect(() => () => {
    if (compositionCommitFrameRef.current !== null) window.cancelAnimationFrame(compositionCommitFrameRef.current);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editable || !autoFocus || !editor) return;
    const frame = window.requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (!selection) return;
      const currentRange = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (currentRange && richTextRangeBelongsToEditor(currentRange, editor)) {
        onActivate(editorId, editor, currentRange.cloneRange());
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      onActivate(editorId, editor, range);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, editable, editorId, onActivate]);

  const captureSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    onActivate(editorId, editor, range && richTextRangeBelongsToEditor(range, editor) ? range.cloneRange() : null);
  };

  const emitChange = (clearEmptyDom = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    onNormalizeInput(editorId, editor);
    if (editorIsTrulyEmpty(editor)) {
      // Persist an empty value, but never rewrite the focused contenteditable.
      // Browsers and Vietnamese IMEs need their invisible caret sentinel to stay
      // in place while editing. It is safe to clean that sentinel after blur.
      if (clearEmptyDom && document.activeElement !== editor && editor.innerHTML) editor.innerHTML = "";
      onChange("", "");
      captureSelection();
      return;
    }
    onChange(sanitizeRichTextHtml(editor.innerHTML), editorText(editor));
    captureSelection();
  };

  const finishComposition = (clearEmptyDom = false) => {
    composingRef.current = false;
    if (compositionCommitFrameRef.current !== null) window.cancelAnimationFrame(compositionCommitFrameRef.current);
    compositionCommitFrameRef.current = window.requestAnimationFrame(() => {
      compositionCommitFrameRef.current = null;
      emitChange(clearEmptyDom);
    });
  };

  return (
    <div
      ref={editorRef}
      className={`${className} rich-text-editor`}
      data-rich-editor-id={editorId}
      data-placeholder={placeholder}
      contentEditable={editable}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!singleLine}
      aria-label={ariaLabel}
      spellCheck={false}
      onFocus={captureSelection}
      onBlur={() => {
        if (composingRef.current) {
          finishComposition(true);
          return;
        }
        emitChange(true);
      }}
      onMouseUp={captureSelection}
      onKeyUp={() => {
        if (!composingRef.current && compositionCommitFrameRef.current === null) captureSelection();
      }}
      onKeyDown={(event) => {
        if (singleLine && event.key === "Enter") event.preventDefault();
      }}
      onCompositionStart={() => {
        if (compositionCommitFrameRef.current !== null) {
          window.cancelAnimationFrame(compositionCommitFrameRef.current);
          compositionCommitFrameRef.current = null;
        }
        composingRef.current = true;
      }}
      onCompositionEnd={() => finishComposition()}
      onInput={(event) => {
        if (composingRef.current || event.nativeEvent.isComposing || compositionCommitFrameRef.current !== null) return;
        emitChange();
      }}
      onPaste={(event) => {
        if (!editable) return;
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        insertPlainText(event.currentTarget, singleLine ? text.replace(/\s*\r?\n\s*/g, " ") : text);
      }}
      onDrop={(event) => {
        if (!editable) return;
        const text = event.dataTransfer.getData("text/plain");
        if (!text) return;
        event.preventDefault();
        insertPlainText(event.currentTarget, singleLine ? text.replace(/\s*\r?\n\s*/g, " ") : text);
      }}
    />
  );
}
