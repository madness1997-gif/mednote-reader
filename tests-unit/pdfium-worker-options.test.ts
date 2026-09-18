import assert from "node:assert/strict";
import test from "node:test";
import { pdfiumWorkerOptions } from "../app/pdfium-worker-options";

test("web passes its WASM URL to the worker without fetching on the UI", async () => {
  const options = await pdfiumWorkerOptions("https://example.test/pdfium.wasm", false, async () => {
    throw new Error("Unexpected UI fetch");
  });
  assert.deepEqual(options, { wasmUrl: "https://example.test/pdfium.wasm" });
});

test("desktop supplies transferable WASM bytes without a custom-scheme worker fetch", async () => {
  const bytes = new Uint8Array([0, 97, 115, 109]);
  let requested = "";
  let signal: AbortSignal | null | undefined;
  const options = await pdfiumWorkerOptions("mednote-assets://app/assets/pdfium.wasm", true, async (url, init) => {
    requested = String(url);
    signal = init?.signal;
    return new Response(bytes);
  });
  assert.equal(requested, "mednote-assets://app/assets/pdfium.wasm");
  assert.ok(signal instanceof AbortSignal);
  assert.equal(options.wasmUrl, undefined);
  assert.deepEqual(new Uint8Array(options.wasmBinary!), bytes);
});

test("desktop rejects missing WASM instead of spawning with an error page", async () => {
  await assert.rejects(pdfiumWorkerOptions("mednote-assets://app/missing.wasm", true,
    async () => new Response("Not found", { status: 404 })), /WASM fetch failed \(404\)/);
});

test("desktop aborts a stalled WASM download", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = pdfiumWorkerOptions("mednote-assets://app/stalled.wasm", true, (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("Download aborted", "AbortError")), { once: true })));
  const rejected = assert.rejects(pending, /aborted/);
  t.mock.timers.tick(6_000);
  await rejected;
});
