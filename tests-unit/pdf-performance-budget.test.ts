import assert from "node:assert/strict";
import test from "node:test";
import { PdfCanvasBudgetManager } from "../app/pdf-canvas-budget";
import { PdfReaderController } from "../app/pdf-reader-controller";
import { PdfWorkScheduler } from "../app/pdf-work-scheduler";
import { nearestPdfVirtualPageIndex, pdfPageVirtualAnchorIndex, pdfPageVirtualAnchorTargetOffset, pdfPageVirtualMetrics, pdfPageVirtualRange } from "../app/pdf-page-virtualizer";
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

test("2,000–3,000-page continuous PDFs mount only a bounded page window", () => {
  for (const pageCount of [2_000, 2_500, 3_000]) {
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
    const metrics = pdfPageVirtualMetrics(pages, new Map(), 780);
    for (const viewportTop of [0, metrics.totalHeight / 2, Math.max(0, metrics.totalHeight - 900)]) {
      const range = pdfPageVirtualRange(metrics, viewportTop, 900);
      assert.ok(range.end - range.start <= 7, `${pageCount} pages must not create an unbounded continuous DOM`);
      assert.ok(range.start >= 0);
      assert.ok(range.end <= pageCount);
    }
  }
});

test("continuous PDF metrics retain exact offsets after measured page heights change", () => {
  const pages = [1, 2, 3, 4];
  const metrics = pdfPageVirtualMetrics(pages, new Map([[2, 1_000]]), 780, 22);
  assert.deepEqual(metrics.offsets, [0, 802, 1_824, 2_626]);
  assert.equal(metrics.totalHeight, 3_406);
  assert.equal(nearestPdfVirtualPageIndex(metrics, 1_810), 2);
});

test("continuous PDF anchors select the containing page and the next page inside a page gap", () => {
  const metrics = pdfPageVirtualMetrics([1, 2, 3], new Map([[1, 1_000], [2, 600], [3, 900]]), 780, 22);
  assert.equal(pdfPageVirtualAnchorIndex(metrics, 780), 0, "deep content remains anchored to its containing page");
  assert.equal(pdfPageVirtualAnchorIndex(metrics, 1_010), 1, "the fixed page gap anchors to the following page boundary");
  assert.equal(pdfPageVirtualAnchorIndex(metrics, 1_400), 1);
});

test("continuous PDF anchors scale deep page content while retaining fixed page gaps", () => {
  const deepContent = { offset: -756, pageOffsetRatio: .78, viewportOffset: 24 };
  assert.equal(pdfPageVirtualAnchorTargetOffset(deepContent, 1_000), -756);
  assert.equal(pdfPageVirtualAnchorTargetOffset(deepContent, 600), -444);
  assert.equal(pdfPageVirtualAnchorTargetOffset({ offset: 12, pageOffsetRatio: null, viewportOffset: 24 }, 600), 12);
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
