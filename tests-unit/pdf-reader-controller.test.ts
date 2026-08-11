import assert from "node:assert/strict";
import test from "node:test";
import { PdfReaderController, clampPdfPage, clampPdfZoom, nextContinuousPage, zoomAroundAnchor } from "../app/pdf-reader-controller";

function proxy(id: string, pages = 2): any {
  return {
    id,
    numPages: pages,
    destroyed: 0,
    destroy() { this.destroyed += 1; return Promise.resolve(); },
    getOutline: async () => [],
    getDestination: async () => null,
    getPageIndex: async () => 0,
    getPage: async (page: number) => ({ getTextContent: async () => ({ items: [{ str: page === 1 ? "hello diabetes" : "world" }] }) }),
  };
}

test("PDF.js becomes ready when PDFium fails", async () => {
  const pdf = proxy("a");
  const controller = new PdfReaderController({ loadPdf: async () => pdf, loadPdfium: async () => { throw new Error("pdfium fail"); } });
  const session = await controller.open({ documentId: "a", lastModified: 1, blob: new Blob(["x"]) });
  assert.equal(session?.pdf, pdf);
  assert.equal(controller.getState().status, "ready");
});

test("fast switch drops stale result and destroys stale proxy", async () => {
  let release!: (value: any) => void;
  const first = new Promise<any>((resolve) => { release = resolve; });
  const stale = proxy("stale");
  const current = proxy("current");
  let calls = 0;
  const controller = new PdfReaderController({ loadPdf: async () => ++calls === 1 ? first : current, loadPdfium: async () => { throw new Error("skip"); } });
  const opening = controller.open({ documentId: "one", lastModified: 1, blob: new Blob(["1"]) });
  const second = await controller.open({ documentId: "two", lastModified: 2, blob: new Blob(["2"]) });
  release(stale);
  assert.equal(await opening, null);
  assert.equal(second?.documentId, "two");
  assert.equal(stale.destroyed, 1);
});

test("opening another ready PDF disposes previous PDF.js proxy", async () => {
  const one = proxy("one");
  const two = proxy("two");
  let calls = 0;
  const controller = new PdfReaderController({ loadPdf: async () => ++calls === 1 ? one : two, loadPdfium: async () => { throw new Error("skip"); } });
  await controller.open({ documentId: "one", lastModified: 1, blob: new Blob(["1"]) });
  await controller.open({ documentId: "two", lastModified: 2, blob: new Blob(["2"]) });
  assert.equal(one.destroyed, 1);
});

test("page, zoom, continuous navigation and Ctrl+wheel anchor are clamped", () => {
  assert.equal(clampPdfPage(99, 3), 3);
  assert.equal(clampPdfPage(-2, 3), 1);
  assert.equal(clampPdfZoom(99), 2.5);
  assert.equal(nextContinuousPage(2, 1, 3), 3);
  assert.equal(nextContinuousPage(3, 1, 3), 3);
  assert.deepEqual(zoomAroundAnchor(1, 2, { contentX: 100, contentY: 80, localX: 20, localY: 10 }), { left: 180, top: 150 });
});

test("outline resolves named destination", async () => {
  const pdf = proxy("outline");
  pdf.getOutline = async () => [{ title: "Chapter", dest: "chapter", items: [] }];
  pdf.getDestination = async () => [{ num: 9, gen: 0 }];
  pdf.getPageIndex = async () => 4;
  const controller = new PdfReaderController({ loadPdf: async () => pdf, loadPdfium: async () => { throw new Error("skip"); } });
  await controller.open({ documentId: "a", lastModified: 1, blob: new Blob(["x"]) });
  assert.deepEqual(await controller.resolveOutline(), [{ title: "Chapter", page: 5, depth: 0 }]);
});

test("search works across targets, cancellation stops it, temporary proxy is destroyed", async () => {
  const temp = proxy("temp");
  const controller = new PdfReaderController({ loadPdf: async () => temp, loadPdfium: async () => { throw new Error("skip"); } });
  const results = await controller.search("diabetes", [{ id: "temp", name: "Temp", lastModified: 1, blob: new Blob(["x"]) }]);
  assert.equal(results.length, 1);
  assert.equal(temp.destroyed, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(() => controller.search("x", [{ id: "x", name: "X", lastModified: 1, blob: new Blob(["x"]) }], { signal: aborted.signal }), /aborted/i);
});
