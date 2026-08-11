import type { Plugin } from "vite";

const IMPORT_ANCHORS = [
  'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";',
  'import type { PDFiumDocument } from "./pdfium-renderer";',
];
const IMPORT_LINE = 'import { VirtualPdfThumbnailList } from "./virtualized-thumbnails";';
const PDF_PAGES_START = '          {pdfRailTab === "pages" && (';
const PDF_PAGES_END = '          {pdfRailTab === "outline" && (';

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
        const importAnchor = IMPORT_ANCHORS.find((anchor) => next.includes(anchor));
        if (!importAnchor) throw new Error("Không tìm thấy vị trí import để gắn PDF thumbnail virtualization.");
        next = next.replace(importAnchor, `${importAnchor}\n${IMPORT_LINE}`);
      }

      next = replaceRange(
        next,
        PDF_PAGES_START,
        PDF_PAGES_END,
        `          {pdfRailTab === "pages" && (\n            <VirtualPdfThumbnailList\n              pages={sourcePages}\n              document={currentPdfDocument}\n              activeDocumentId={activeDocument?.id ?? null}\n              activePage={sourcePage}\n              onPageClick={goToPageFromRail}\n            />\n          )}\n\n`,
        "danh sách thumbnail PDF",
      );

      return { code: next, map: null };
    },
  };
}