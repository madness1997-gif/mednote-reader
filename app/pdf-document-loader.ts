import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfDocumentOptions } from "./pdf-config";

export async function loadPdfDocument(source: Blob | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
  return pdfjs.getDocument(pdfDocumentOptions(bytes)).promise;
}
