import type { Plugin } from "vite";

const IMPORT_ANCHOR = 'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";';
const IMPORT_LINE = 'import { FirstAidBlockEditor } from "./first-aid-block-editor";';
const EDITOR_ANCHOR = '<RichTextEditor editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />';
const EDITOR_REPLACEMENT = '{activeNote.paper.template === "first-aid" ? <FirstAidBlockEditor key={activeNote.id} html={activeNote.bodyHtml ?? ""} plainText={activeNote.body} mode={activeTool === "text" || activeTool === "pointer" ? "edit" : "view"} onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onInsertImage={addFirstAidImage} /> : <RichTextEditor editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />}';

export function firstAidBlocksPlugin(): Plugin {
  return {
    name: "mednote-first-aid-blocks",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      if (!next.includes(IMPORT_LINE)) {
        if (!next.includes(IMPORT_ANCHOR)) throw new Error("Không tìm thấy vị trí import để gắn First Aid block editor.");
        next = next.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`);
      }

      if (!next.includes("<FirstAidBlockEditor")) {
        if (!next.includes(EDITOR_ANCHOR)) throw new Error("Không tìm thấy trình soạn thảo note để gắn First Aid block editor.");
        next = next.replace(EDITOR_ANCHOR, EDITOR_REPLACEMENT);
      }

      return { code: next, map: null };
    },
  };
}
