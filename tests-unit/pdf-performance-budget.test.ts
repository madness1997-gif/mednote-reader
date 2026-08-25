import assert from "node:assert/strict";
import test from "node:test";
import { PdfCanvasBudgetManager } from "../app/pdf-canvas-budget";
import { PdfReaderController } from "../app/pdf-reader-controller";
import { PdfWorkScheduler } from "../app/pdf-work-scheduler";
import { pdfThumbnailVirtualRange } from "../app/virtualized-thumbnails";

test("canvas budget evicts the least recently used unpinned page", () => {
  const manager = new PdfCanvasBudgetManager(100);
  const evicted: string[] = [];
  manager.report("old", 60, () => evicted.push("old"));
  manager.report("visible", 60, () => evicted.push("visible"), () => true);
  assert.deepEqual(evicted, ["old"]);
  assert.equal(manager.snapshot().totalBytes, 60);
  assert.deepEqual(manager.snapshot().entries.map((entry) => entry.key), ["visible"]);
});

test("visible render preempts and then resumes active thumbnail work", async () => {
  const scheduler = new PdfWorkScheduler();
  const order: string[] = [];
  let thumbnailAttempts = 0;
  const thumbnail = scheduler.schedule("thumbnail", (signal) => {
    thumbnailAttempts += 1;
    if (thumbnailAttempts > 1) {
      order.push("thumbnail");
      return Promise.resolve();
    }
    return new Promise<void>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    });
  });
  const visible = scheduler.schedule("visible", async () => { order.push("visible"); });
  await Promise.all([thumbnail.promise, visible.promise]);
  assert.equal(thumbnailAttempts, 2);
  assert.deepEqual(order, ["visible", "thumbnail"]);
});

test("2,000–3,000-page PDFs keep thumbnail and canvas work bounded", () => {
  for (const pageCount of [2_000, 2_500, 3_000]) {
    const middle = pdfThumbnailVirtualRange(pageCount, Math.floor(pageCount / 2), 8);
    const end = pdfThumbnailVirtualRange(pageCount, pageCount - 2, 8);
    assert.ok(middle.end - middle.start <= 13, `${pageCount} pages must still mount a bounded thumbnail window`);
    assert.ok(end.end <= pageCount);
    assert.ok(end.end - end.start <= 13);
  }

  const budgetBytes = 96 * 1024 * 1024;
  const pageBytes = 4 * 1024 * 1024;
  const manager = new PdfCanvasBudgetManager(budgetBytes);
  let evictions = 0;
  for (let page = 1; page <= 3_000; page += 1) {
    manager.report(`book:${page}`, pageBytes, () => { evictions += 1; }, () => page === 1_500);
  }
  const snapshot = manager.snapshot();
  assert.ok(snapshot.totalBytes <= budgetBytes);
  assert.ok(snapshot.entries.length <= budgetBytes / pageBytes);
  assert.ok(snapshot.entries.some((entry) => entry.key === "book:1500" && entry.pinned));
  assert.ok(evictions >= 2_975, "Thousands of off-screen canvases must be released instead of retained");
});

test("opening a 2,500-page PDF does not eagerly request pages or initialize PDFium", async () => {
  let requestedPages = 0;
  let pdfiumLoads = 0;
  let destroyed = 0;
  const pdf = {
    numPages: 2_500,
    getOutline: async () => [],
    getDestination: async () => null,
    getPageIndex: async () => 0,
    getPage: async () => {
      requestedPages += 1;
      return { getTextContent: async () => ({ items: [] }) };
    },
    destroy: async () => { destroyed += 1; },
  };
  const controller = new PdfReaderController({
    loadPdf: async (source) => {
      assert.ok(source instanceof Blob, "Large PDF open must preserve Blob-backed worker loading");
      return pdf as any;
    },
    loadPdfium: async () => {
      pdfiumLoads += 1;
      return { destroy: async () => undefined } as any;
    },
    waitForSecondaryWork: async () => undefined,
  });

  const session = await controller.open({ documentId: "harrison-2500", lastModified: 1, blob: new Blob(["fake-pdf"]) });
  assert.equal(session?.pdf.numPages, 2_500);
  assert.equal(requestedPages, 0);
  assert.equal(pdfiumLoads, 0);
  assert.equal(controller.clampPage(9_999), 2_500);
  await controller.close();
  assert.equal(destroyed, 1);
});
