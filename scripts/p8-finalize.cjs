const fs = require('node:fs');
function rw(path, fn) { const src = fs.readFileSync(path, 'utf8').replace(/\r\n/g,'\n'); fs.writeFileSync(path, fn(src)); }
function req(src, a, b, label) { if (src.includes(b)) return src; if (!src.includes(a)) throw new Error(`Missing ${label}`); return src.replace(a,b); }

rw('app/page.tsx', (src) => {
  src = src.replace('import { NoteRichTextController } from "./note-rich-text-controller";', 'import { noteRichTextController } from "./note-rich-text-controller";');
  src = src.replace('  const richTextController = useMemo(() => new NoteRichTextController(), []);', '  const richTextController = noteRichTextController;');
  return src;
});

rw('app/rich-text-editor.tsx', (src) => {
  src = src.replace('import { NoteRichTextController, richTextRangeBelongsToEditor } from "./note-rich-text-controller";', 'import { noteRichTextController, richTextRangeBelongsToEditor } from "./note-rich-text-controller";');
  src = src.replace('  const controller = new NoteRichTextController();\n', '  const controller = noteRichTextController;\n');
  return src;
});

rw('app/equation-composer.tsx', (src) => {
  src = src.replace('import { useCallback, useEffect, useMemo, useRef, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";\nimport { noteRichTextController } from "./note-rich-text-controller";');
  src = src.replace('type SavedTextTarget = { editor: HTMLElement; range: Range };\n', '');
  const helperStart = src.indexOf('function findEditorForRange(range: Range) {');
  const compStart = src.indexOf('export default function EquationComposer()', helperStart);
  if (helperStart >= 0 && compStart > helperStart) src = src.slice(0, helperStart) + src.slice(compStart);
  src = src.replace('  const savedTargetRef = useRef<SavedTextTarget | null>(null);\n', '');
  const captureStart = src.indexOf('  const captureEditorSelection = useCallback(() => {');
  const openEffect = src.indexOf('  useEffect(() => {\n    document.addEventListener("selectionchange"', captureStart);
  const nextEffect = src.indexOf('  useEffect(() => {\n    if (!open) return;', openEffect);
  if (captureStart >= 0 && openEffect >= 0 && nextEffect > openEffect) {
    const effect = `  useEffect(() => {\n    const interceptFormulaButton = (event: MouseEvent) => {\n      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.word-command-button[title="Chèn công thức"]') : null;\n      if (!target) return;\n      event.preventDefault();\n      event.stopPropagation();\n      event.stopImmediatePropagation();\n      setMessage(noteRichTextController.activeEditorRef.current ? "Có thể nhập trực tiếp hoặc bấm các khối để ghép biểu thức." : "Hãy bấm vào vị trí cần chèn trong note trước khi xác nhận.");\n      setOpen(true);\n    };\n    document.addEventListener("click", interceptFormulaButton, true);\n    return () => document.removeEventListener("click", interceptFormulaButton, true);\n  }, []);\n\n`;
    src = src.slice(0, captureStart) + effect + src.slice(nextEffect);
  }
  const insertStart = src.indexOf('  const insertEquation = () => {');
  const insertEnd = src.indexOf('\n\n  if (!open) return null;', insertStart);
  if (insertStart >= 0 && insertEnd > insertStart) {
    const block = `  const insertEquation = () => {\n    if (!noteRichTextController.activeEditorRef.current?.editor.isConnected) {\n      setMessage("Chưa có vị trí chèn. Đóng cửa sổ, bấm vào nội dung hoặc textbox rồi mở Công thức lại.");\n      return;\n    }\n    const markup = equationMarkup(source.trim() || "□", mode);\n    noteRichTextController.insertHtml(mode === "display" ? \`${'${markup}'}<div><br></div>\` : \`${'${markup}'}&nbsp;\`);\n    setOpen(false);\n  };`;
    src = src.slice(0, insertStart) + block + src.slice(insertEnd);
  }
  return src;
});

// package test:p8
rw('package.json', (src) => src.replace('    "test:p7": "node --import tsx --test tests-unit/pdf-reader-controller.test.ts tests-unit/pdf-annotation-session.test.ts tests-unit/pdf-document-export.test.ts",', '    "test:p7": "node --import tsx --test tests-unit/pdf-reader-controller.test.ts tests-unit/pdf-annotation-session.test.ts tests-unit/pdf-document-export.test.ts",\n    "test:p8": "node --import tsx --test tests-unit/p8-note-editor.test.ts",'));

console.log('P8 finalize patches applied');
