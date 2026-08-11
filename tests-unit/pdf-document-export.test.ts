import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { exportAnnotatedPdf } from "../app/pdf-document-export";

test("export creates a valid annotated PDF without mutating the original blob", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 200]);
  const original = new Blob([await source.save()], { type: "application/pdf" });
  const before = new Uint8Array(await original.arrayBuffer());
  const output = await exportAnnotatedPdf({
    blob: original,
    annotations: [{ id: "rect", kind: "rectangle", page: 1, color: "#ff0000", width: 2, rect: { x1: 10, y1: 10, x2: 60, y2: 60 }, text: "", createdAt: 1 }],
  });
  const parsed = await PDFDocument.load(await output.arrayBuffer());
  assert.equal(parsed.getPageCount(), 1);
  assert.equal(output.type, "application/pdf");
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), before);
});
