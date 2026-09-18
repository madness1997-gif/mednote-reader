import type { PDFiumWorkerClientOptions } from "@hyzyla/pdfium/worker";

// Electron's file:// renderer can fetch mednote-assets://, but its blob worker
// cannot. Transfer WASM bytes to that worker instead of initializing on the UI.
export async function pdfiumWorkerOptions(
  wasmUrl: string,
  desktop: boolean,
  fetchWasm: typeof fetch = fetch,
): Promise<PDFiumWorkerClientOptions> {
  if (!desktop) return { wasmUrl };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetchWasm(wasmUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`PDFium WASM fetch failed (${response.status})`);
    const wasmBinary = await response.arrayBuffer();
    return { wasmBinary };
  } finally {
    clearTimeout(timer);
  }
}
