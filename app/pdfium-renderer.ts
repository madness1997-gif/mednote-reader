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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

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
  const spawnPromise = PDFiumWorkerClient.spawn({ wasmUrl: pdfiumWasmLocation() });
  let client: Awaited<typeof spawnPromise>;
  try {
    client = await withTimeout(spawnPromise, 6_000, "PDFium worker did not start in time");
  } catch (error) {
    // If a delayed worker eventually starts after the timeout, terminate it
    // instead of leaving an unused worker alive in the page.
    void spawnPromise.then((lateClient) => lateClient.destroy()).catch(() => undefined);
    throw error;
  }
  try {
    const document = await withTimeout(
      client.loadDocument(data),
      10_000,
      "PDFium worker did not open the document in time",
    );
    return {
      getPage: (pageIndex) => document.getPage(pageIndex),
      destroy: async () => {
        await document.destroy();
        await client.destroy();
      },
    };
  } catch (error) {
    // Do not let a stalled worker make this rejection stall as well. destroy()
    // is best-effort here; the caller immediately continues with PDF.js.
    void client.destroy().catch(() => undefined);
    throw error;
  }
}
