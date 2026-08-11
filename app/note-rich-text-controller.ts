export type ActiveRichTextEditor = { id: string; editor: HTMLElement };

function rangeBelongsToEditor(range: Range, editor: HTMLElement) {
  const container = range.commonAncestorContainer;
  return container === editor || editor.contains(container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode);
}

function dispatchInput(editor: HTMLElement, inputType = "insertText", data: string | null = null) {
  try {
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
  } catch {
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export class NoteRichTextController {
  readonly activeEditorRef: { current: ActiveRichTextEditor | null } = { current: null };
  readonly savedRangeRef: { current: Range | null } = { current: null };

  activate(editorId: string, editor: HTMLElement, range: Range | null) {
    this.activeEditorRef.current = { id: editorId, editor };
    this.savedRangeRef.current = range && rangeBelongsToEditor(range, editor) ? range.cloneRange() : null;
  }

  clear() {
    this.activeEditorRef.current = null;
    this.savedRangeRef.current = null;
  }

  restoreSelection() {
    const target = this.activeEditorRef.current;
    if (!target?.editor.isConnected) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    let range = this.savedRangeRef.current;
    if (!range || !rangeBelongsToEditor(range, target.editor)) {
      range = document.createRange();
      range.selectNodeContents(target.editor);
      range.collapse(false);
    }
    target.editor.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);
    this.savedRangeRef.current = range.cloneRange();
    return { ...target, range };
  }

  captureCurrentSelection() {
    const target = this.activeEditorRef.current;
    const selection = window.getSelection();
    if (!target?.editor.isConnected || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!rangeBelongsToEditor(range, target.editor)) return null;
    this.savedRangeRef.current = range.cloneRange();
    return this.savedRangeRef.current;
  }

  execCommand(command: string, showUi = false, value?: string) {
    const restored = this.restoreSelection();
    if (!restored) return false;
    const result = document.execCommand(command, showUi, value);
    this.captureCurrentSelection();
    dispatchInput(restored.editor, command === "insertText" ? "insertText" : "formatBackColor", value ?? null);
    return result;
  }

  insertText(value: string) {
    const restored = this.restoreSelection();
    if (!restored) return false;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : restored.range;
    range.deleteContents();
    const text = document.createTextNode(value);
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.savedRangeRef.current = range.cloneRange();
    dispatchInput(restored.editor, "insertText", value);
    return true;
  }

  insertHtml(html: string) {
    const restored = this.restoreSelection();
    if (!restored) return false;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : restored.range;
    const template = document.createElement("template");
    template.innerHTML = html;
    const fragment = template.content;
    const last = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (last) range.setStartAfter(last);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.savedRangeRef.current = range.cloneRange();
    dispatchInput(restored.editor, "insertText", null);
    return true;
  }

  insertPlainTextInto(editor: HTMLElement, value: string) {
    this.activate(editor.dataset.richEditorId ?? "editor", editor, this.captureRangeFor(editor));
    return this.insertText(value);
  }

  captureRangeFor(editor: HTMLElement) {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    return range && rangeBelongsToEditor(range, editor) ? range.cloneRange() : null;
  }
}

export function richTextRangeBelongsToEditor(range: Range, editor: HTMLElement) {
  return rangeBelongsToEditor(range, editor);
}
