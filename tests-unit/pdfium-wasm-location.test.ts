import assert from "node:assert/strict";
import test from "node:test";
import { resolvePdfiumWasmLocation } from "../app/pdfium-wasm-location";

test("web PDFium workers receive an absolute WASM URL", () => {
  assert.equal(
    resolvePdfiumWasmLocation(
      "/mednote-reader/assets/pdfium-build.wasm",
      "https://example.test/mednote-reader/",
      false,
    ),
    "https://example.test/mednote-reader/assets/pdfium-build.wasm",
  );
});

test("desktop PDFium keeps using the packaged asset protocol", () => {
  assert.equal(
    resolvePdfiumWasmLocation(
      "/mednote-reader/assets/pdfium-build.wasm",
      "file:///C:/MedNote/dist-electron/index.html",
      true,
    ),
    "mednote-assets://app/assets/pdfium-build.wasm",
  );
});
