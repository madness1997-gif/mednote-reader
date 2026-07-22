const PDF_ASSET_ROOT = "pdfjs/";

function pdfAssetRoot() {
  if (typeof window !== "undefined" && window.mednoteDesktop?.isDesktop) {
    return "mednote-assets://app/pdfjs/";
  }
  return new URL(PDF_ASSET_ROOT, window.document.baseURI).href;
}

export function pdfDocumentOptions(data: Uint8Array) {
  const assetRoot = pdfAssetRoot();
  return {
    data,
    cMapUrl: `${assetRoot}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetRoot}standard_fonts/`,
    wasmUrl: `${assetRoot}wasm/`,
    useSystemFonts: true,
  };
}
