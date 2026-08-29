import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { NoteExcerpt } from "../app/note-runtime-adapter";
import { boundingPdfRect, calloutPlacement, moveExcerptLayer, notePaperGeometry } from "../app/use-note-canvas-controller";

function excerpt(id: string): NoteExcerpt {
  return {
    id,
    kind: "text",
    sourceKind: "manual",
    text: id,
    richText: id,
    createdAt: 1,
    layout: { x: 0, y: 0, width: .2, height: .1, contentScale: 1, rotation: 0, opacity: 1 },
  };
}

test("canvas controller normalizes multi-rect PDF selections", () => {
  assert.deepEqual(boundingPdfRect([
    { x1: 80, y1: 40, x2: 20, y2: 60 },
    { x1: 10, y1: 70, x2: 90, y2: 30 },
  ]), { x1: 10, y1: 30, x2: 90, y2: 70 });
  assert.equal(boundingPdfRect([]), undefined);
});

test("callout placement keeps the box on paper and away from its anchor", () => {
  const leftAnchor = calloutPlacement(.1, .5);
  assert.ok(leftAnchor.x > .1);
  assert.ok(leftAnchor.y < .5);

  const rightAnchor = calloutPlacement(.95, .05);
  assert.ok(rightAnchor.x < .95);
  assert.ok(rightAnchor.y > .05);
  assert.ok(rightAnchor.x >= .02 && rightAnchor.x + rightAnchor.width <= 1);
  assert.ok(rightAnchor.y >= .02 && rightAnchor.y + rightAnchor.height <= 1);
});

test("excerpt layer moves are immutable and clamp at both ends", () => {
  const original = [excerpt("a"), excerpt("b"), excerpt("c")];
  assert.deepEqual(moveExcerptLayer(original, "b", "front").map((item) => item.id), ["a", "c", "b"]);
  assert.deepEqual(moveExcerptLayer(original, "b", "back").map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(moveExcerptLayer(original, "b", "forward").map((item) => item.id), ["a", "c", "b"]);
  assert.deepEqual(moveExcerptLayer(original, "b", "backward").map((item) => item.id), ["b", "a", "c"]);
  assert.equal(moveExcerptLayer(original, "a", "back"), original);
  assert.deepEqual(original.map((item) => item.id), ["a", "b", "c"]);
});

test("paper geometry swaps dimensions without leaking layout math into page", () => {
  const portrait = notePaperGeometry({ size: "a4", orientation: "portrait", template: "first-aid", color: "white" });
  assert.equal(portrait.paperWidth, 210);
  assert.equal(portrait.paperHeight, 297);
  assert.equal(portrait.basePaperMaxWidth, 720);

  const landscape = notePaperGeometry({ size: "a4", orientation: "landscape", template: "blank", color: "ivory" });
  assert.equal(landscape.paperWidth, 297);
  assert.equal(landscape.paperHeight, 210);
  assert.equal(landscape.basePaperMaxWidth, 920);
});

test("page composes one canvas controller and UI consumes that boundary", async () => {
  const [page, controller, context, stage, toolbar] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-note-canvas-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-controllers-context.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-toolbar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const noteCanvas = useNoteCanvasController/);
  assert.match(page, /noteCanvas,/);
  for (const forbidden of [
    "const addImageExcerpt", "const addFirstAidImage", "const addSticker", "const addCalloutAt",
    "const commitStrokes", "const updatePaperTemplate", "new NoteInkSession", "firstAidTemplateTransition",
  ]) assert.equal(page.includes(forbidden), false, `page.tsx still owns ${forbidden}`);

  assert.match(controller, /fitFirstAidImageLayout/);
  assert.match(controller, /new NoteInkSession/);
  assert.match(controller, /firstAidTemplateTransition/);
  assert.match(controller, /annotationKind: "callout"/);
  assert.match(context, /noteCanvas: NoteCanvasController/);
  assert.match(stage, /noteCanvas: canvas/);
  assert.match(toolbar, /noteCanvas: canvas/);
});
