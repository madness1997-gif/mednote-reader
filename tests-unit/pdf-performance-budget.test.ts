import assert from "node:assert/strict";
import test from "node:test";
import { PdfCanvasBudgetManager } from "../app/pdf-canvas-budget";
import { PdfWorkScheduler } from "../app/pdf-work-scheduler";

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
