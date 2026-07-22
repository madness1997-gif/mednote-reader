import { PDFiumLibrary, type PDFiumDocument } from "@hyzyla/pdfium";
import pdfiumWasmUrl from "@hyzyla/pdfium/pdfium.wasm?url";

let libraryPromise: Promise<PDFiumLibrary> | null = null;

function pdfiumWasmLocation() {
  if (typeof window !== "undefined" && window.mednoteDesktop?.isDesktop) {
    const resolvedUrl = String(pdfiumWasmUrl);
    const filename = resolvedUrl.substring(resolvedUrl.lastIndexOf("/") + 1) || "pdfium.wasm";
    return `mednote-assets://app/assets/${filename}`;
  }
  return pdfiumWasmUrl;
}

function getPdfiumLibrary() {
  libraryPromise ??= PDFiumLibrary.init({ wasmUrl: pdfiumWasmLocation() });
  return libraryPromise;
}

export async function loadPdfiumDocument(data: Uint8Array): Promise<PDFiumDocument> {
  const library = await getPdfiumLibrary();
  return library.loadDocument(data);
}

export type { PDFiumDocument };
