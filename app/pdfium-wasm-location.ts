export function resolvePdfiumWasmLocation(
  wasmUrl: string,
  pageUrl: string | undefined,
  desktop: boolean,
) {
  if (desktop) {
    const filename = wasmUrl.substring(wasmUrl.lastIndexOf("/") + 1) || "pdfium.wasm";
    return `mednote-assets://app/assets/${filename}`;
  }
  return pageUrl ? new URL(wasmUrl, pageUrl).href : wasmUrl;
}
