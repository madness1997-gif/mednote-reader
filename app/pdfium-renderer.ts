import type { PDFiumPageRender } from "@hyzyla/pdfium";
import pdfiumWasmUrl from "@hyzyla/pdfium/pdfium.wasm?url";
import { resolvePdfiumWasmLocation } from "./pdfium-wasm-location";
import { pdfiumWorkerOptions } from "./pdfium-worker-options";

export type PDFiumPage = {
  render: (options?: { width?: number; height?: number }) => Promise<PDFiumPageRender>;
};

export type PDFiumDocument = {
  getPage: (pageIndex: number) => PDFiumPage | Promise<PDFiumPage>;
  destroy: () => void | Promise<void>;
};

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
  const browser = typeof window !== "undefined" ? window : undefined;
  return resolvePdfiumWasmLocation(
    String(pdfiumWasmUrl),
    browser?.location.href,
    Boolean(browser?.mednoteDesktop?.isDesktop),
  );
}

export async function loadPdfiumDocument(data: Uint8Array): Promise<PDFiumDocument> {
  const { PDFiumWorkerClient } = await import("@hyzyla/pdfium/worker");
  const options = await pdfiumWorkerOptions(
    pdfiumWasmLocation(),
    typeof window !== "undefined" && Boolean(window.mednoteDesktop?.isDesktop),
  );
  // Desktop transfers the WASM buffer; web keeps streaming from its asset URL.
  // Both initialize and render inside a worker, only when fallback is requested.
  const spawnPromise = PDFiumWorkerClient.spawn(options);
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
    let destruction: Promise<void> | null = null;
    return {
      getPage: (pageIndex) => document.getPage(pageIndex),
      // The client disposes all documents and its WASM library before ending
      // the worker. Share cleanup when close/error paths race.
      destroy: () => destruction ??= client.destroy(),
    };
  } catch (error) {
    // Do not let a stalled worker make this rejection stall as well. destroy()
    // is best-effort here; the caller immediately continues with PDF.js.
    void client.destroy().catch(() => undefined);
    throw error;
  }
}
