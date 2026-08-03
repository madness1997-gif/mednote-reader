import type { PDFiumPageRender } from "@hyzyla/pdfium";
import pdfiumWasmUrl from "@hyzyla/pdfium/pdfium.wasm?url";

export type PDFiumPage = {
  render: (options?: { width?: number; height?: number }) => Promise<PDFiumPageRender>;
};

export type PDFiumDocument = {
  getPage: (pageIndex: number) => PDFiumPage | Promise<PDFiumPage>;
  destroy: () => void | Promise<void>;
};

let desktopLibraryPromise: Promise<import("@hyzyla/pdfium").PDFiumLibrary> | null = null;

function pdfiumWasmLocation() {
  if (typeof window !== "undefined" && window.mednoteDesktop?.isDesktop) {
    const resolvedUrl = String(pdfiumWasmUrl);
    const filename = resolvedUrl.substring(resolvedUrl.lastIndexOf("/") + 1) || "pdfium.wasm";
    return `mednote-assets://app/assets/${filename}`;
  }
  return pdfiumWasmUrl;
}

async function loadDesktopDocument(data: Uint8Array): Promise<PDFiumDocument> {
  const { PDFiumLibrary } = await import("@hyzyla/pdfium");
  desktopLibraryPromise ??= PDFiumLibrary.init({ wasmUrl: pdfiumWasmLocation() });
  const library = await desktopLibraryPromise;
  return library.loadDocument(data);
}

export async function loadPdfiumDocument(data: Uint8Array): Promise<PDFiumDocument> {
  // The web build renders PDFium in a dedicated worker. Large bitmap passes no
  // longer block React, scrolling, or pointer input. The desktop protocol uses
  // a custom asset URL that is not fetchable from a blob worker, so Electron
  // keeps the proven main-context loader for now.
  if (typeof window !== "undefined" && window.mednoteDesktop?.isDesktop) {
    return loadDesktopDocument(data);
  }

  const { PDFiumWorkerClient } = await import("@hyzyla/pdfium/worker");
  const client = await PDFiumWorkerClient.spawn({ wasmUrl: pdfiumWasmLocation() });
  try {
    const document = await client.loadDocument(data);
    return {
      getPage: (pageIndex) => document.getPage(pageIndex),
      destroy: async () => {
        await document.destroy();
        await client.destroy();
      },
    };
  } catch (error) {
    await client.destroy();
    throw error;
  }
}
