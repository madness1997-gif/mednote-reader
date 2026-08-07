import type { Plugin } from "vite";

const IMPORT_ANCHOR = 'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";';
const IMPORT_LINE = 'import { VirtualNoteThumbnailList, VirtualPdfThumbnailList } from "./virtualized-thumbnails";';
const PDF_PAGES_START = '          {pdfRailTab === "pages" && (';
const PDF_PAGES_END = '          {pdfRailTab === "outline" && (';
const NOTE_LIST_START = '          {notePages.map((page, index) => {';
const NOTE_LIST_END = '          <button className="new-page"';

function replaceRange(code: string, startAnchor: string, endAnchor: string, replacement: string, label: string) {
  const start = code.indexOf(startAnchor);
  if (start < 0) throw new Error(`Không tìm thấy phần bắt đầu ${label} để bật virtualization.`);
  const end = code.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error(`Không tìm thấy phần kết thúc ${label} để bật virtualization.`);
  return `${code.slice(0, start)}${replacement}${code.slice(end)}`;
}

export function thumbnailVirtualizationPlugin(): Plugin {
  return {
    name: "mednote-thumbnail-virtualization",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      if (!next.includes(IMPORT_LINE)) {
        if (!next.includes(IMPORT_ANCHOR)) throw new Error("Không tìm thấy vị trí import để gắn thumbnail virtualization.");
        next = next.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`);
      }

      next = replaceRange(
        next,
        PDF_PAGES_START,
        PDF_PAGES_END,
        `          {pdfRailTab === "pages" && (\n            <VirtualPdfThumbnailList\n              pages={sourcePages}\n              document={currentPdfDocument}\n              activeDocumentId={activeDocument?.id ?? null}\n              activePage={sourcePage}\n              onPageClick={goToPageFromRail}\n            />\n          )}\n\n`,
        "danh sách thumbnail PDF",
      );

      next = replaceRange(
        next,
        NOTE_LIST_START,
        NOTE_LIST_END,
        `          <VirtualNoteThumbnailList\n            pages={notePages}\n            activePageId={activeNote.id}\n            onSelect={setActiveNoteId}\n            onDeleteActive={() => { void deleteNotePage(); }}\n          />\n`,
        "danh sách trang note",
      );

      return { code: next, map: null };
    },
  };
}
