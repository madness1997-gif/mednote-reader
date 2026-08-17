import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfDocumentOptions } from "./pdf-config";

export async function loadPdfDocument(source: Blob | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  if (!(source instanceof Blob)) return pdfjs.getDocument(pdfDocumentOptions(source)).promise;

  // A Blob URL lets PDF.js stream the local file directly into its worker. The
  // previous arrayBuffer() path copied the whole textbook on the UI thread
  // before page 1 could even be requested.
  const url = URL.createObjectURL(source);
  try {
    const document = await pdfjs.getDocument(pdfDocumentOptions({ url })).promise;
    const destroy = document.destroy.bind(document);
    let revoked = false;
    document.destroy = async () => {
      try {
        await destroy();
      } finally {
        if (!revoked) {
          revoked = true;
          URL.revokeObjectURL(url);
        }
      }
    };
    return document;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
