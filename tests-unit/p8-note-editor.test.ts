import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NoteInkSession } from "../app/note-ink-session";
import { NoteObjectSession } from "../app/note-object-session";
import type { ExcerptLayout, NoteExcerpt, Stroke } from "../app/note-runtime-adapter";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

function stroke(id: string, x = 0): Stroke {
  return { id, tool: "pen", color: "#000", width: 2, points: [{ x, y: .2, pressure: .5 }] };
}

test("P8 canonical NoteExcerpt owns stickerStyle without schema changes", async () => {
  const runtime = await source("app/note-runtime-adapter.ts");
  assert.match(runtime, /from "\.\/pdf-domain"/);
  assert.match(runtime, /export type StickerPresetId/);
  assert.match(runtime, /stickerStyle\?: StickerPresetId/);
  assert.doesNotMatch(runtime, /from "\.\/pdf-reader"/);

  const sticker: NoteExcerpt = {
    id: "sticker-1", kind: "text", sourceKind: "manual", text: "High yield", richText: "High yield",
    stickerStyle: "high-yield", createdAt: 1,
    layout: { x: .1, y: .1, width: .3, height: .2, contentScale: 1, rotation: 0, opacity: 1, autoFit: false },
  };
  assert.equal((JSON.parse(JSON.stringify(sticker)) as NoteExcerpt).stickerStyle, "high-yield");
});

test("P8 ink history is capped at 60 and isolated by Sheet", () => {
  const session = new NoteInkSession(60);
  let current: Stroke[] = [];
  for (let index = 0; index < 65; index += 1) {
    const next = [...current, stroke(`s-${index}`, index / 100)];
    session.commit("sheet-a", next, current);
    current = next;
  }
  assert.equal(session.snapshot("sheet-a").undo.length, 60);
  assert.equal(session.canUndo("sheet-b"), false);
  const previous = session.undo("sheet-a", current);
  assert.ok(previous);
  assert.equal(previous.length, 64);
  assert.equal(session.canRedo("sheet-a"), true);
  assert.equal(session.canRedo("sheet-b"), false);
});

test("P8 object operations preserve PDF provenance", () => {
  const session = new NoteObjectSession();
  const layout: ExcerptLayout = { x: .1, y: .2, width: .3, height: .2, contentScale: 1, rotation: 0, opacity: 1, autoFit: false };
  const pdf: NoteExcerpt = { id: "pdf-x", kind: "image", sourceKind: "pdf", documentId: "doc-1", documentName: "a.pdf", page: 9, rect: { x1: .1, y1: .2, x2: .4, y2: .5 }, createdAt: 1, layout };
  const other: NoteExcerpt = { id: "manual", kind: "text", sourceKind: "manual", text: "x", createdAt: 2, layout };
  const front = session.bringToFront([pdf, other], pdf.id);
  assert.equal(front.at(-1)?.id, pdf.id);
  assert.deepEqual(front.at(-1)?.rect, pdf.rect);
  assert.equal(front.at(-1)?.documentId, "doc-1");
  assert.equal(front.at(-1)?.page, 9);
  assert.equal(session.rotate(layout, 90).rotation, 90);
});

test("P8 source boundary keeps Note editor engines outside page.tsx", async () => {
  const page = await source("app/page.tsx");
  assert.doesNotMatch(page, /function RichTextEditor/);
  assert.doesNotMatch(page, /function InkCanvas/);
  assert.doesNotMatch(page, /function DraggableExcerpt/);
  assert.doesNotMatch(page, /document\.execCommand\s*\(/);
  assert.match(page, /<NotePane/);

  const stage = await source("app/ui/note-stage.tsx");
  assert.match(stage, /NoteObjectLayer/);
  assert.match(stage, /NoteInkCanvas/);
  assert.match(stage, /FirstAidBlockEditor/);
  assert.match(stage, /RichTextEditor/);
});

test("P8 Vite no longer patches sticker or First Aid editor models", async () => {
  const web = await source("vite.github.config.ts");
  const desktop = await source("vite.desktop.config.ts");
  for (const config of [web, desktop]) {
    assert.doesNotMatch(config, /noteStickersPlugin/);
    assert.doesNotMatch(config, /firstAidBlocksPlugin/);
  }
});

test("P8 First Aid keeps v4 serialization behind domain/codec/renderer boundaries", async () => {
  const [model, domain, codec, renderer, adapter, imageService, view] = await Promise.all([
    source("app/first-aid-block-model.ts"),
    source("app/first-aid-block-domain.ts"),
    source("app/first-aid-block-codec.ts"),
    source("app/first-aid-block-renderer.ts"),
    source("app/first-aid-template-adapter.ts"),
    source("app/first-aid-image-service.ts"),
    source("app/first-aid-block-editor-view.tsx"),
  ]);
  assert.match(codec, /FIRST_AID_SERIALIZATION_VERSION = 4/);
  assert.match(codec, /migrateFirstAidPayload/);
  assert.match(domain, /export type FirstAidBlock/);
  assert.match(renderer, /sanitizeRichTextHtml/);
  assert.match(adapter, /firstAidTemplateTransition/);
  assert.match(model, /compatibility facade|first-aid-block-domain|first-aid-block-codec|first-aid-block-renderer|first-aid-template-adapter/);
  assert.match(imageService, /localBinaryStorage\.readAsset/);
  assert.match(imageService, /readLegacyAsset/);
  assert.match(imageService, /localBinaryStorage\.saveAsset/);
  assert.match(view, /if \(next === current\) return/);
  assert.doesNotMatch(`${domain}\n${codec}\n${renderer}\n${adapter}\n${imageService}\n${view}`, /mednote:first-aid-image-resize/);
});

test("P8 symbol and zoom shims no longer own global DOM state", async () => {
  const main = await source("src/main.tsx");
  assert.doesNotMatch(main, /note-zoom-runtime/);
  assert.doesNotMatch(main, /note-symbol-library"/);
  const symbols = await source("app/note-symbol-library.ts");
  assert.doesNotMatch(symbols, /selectionchange/);
  assert.doesNotMatch(symbols, /document\.execCommand/);
  const equation = await source("app/equation-composer.tsx");
  assert.match(equation, /noteRichTextController/);
  assert.doesNotMatch(equation, /document\.execCommand/);
});

test("P8 invariants remain on v6 NoteStructure and canonical SheetContent adapter", async () => {
  const domain = await source("app/note-domain.ts");
  assert.match(domain, /Notebook/);
  assert.match(domain, /Section/);
  assert.match(domain, /Page/);
  assert.match(domain, /Sheet/);
  assert.match(domain, /SheetContent = Record<string, unknown>/);
  const runtime = await source("app/note-runtime-adapter.ts");
  for (const field of ["body", "bodyHtml", "strokes", "paper", "text", "excerpts"]) assert.match(runtime, new RegExp(field));
  const drive = await source("app/drive-sync-service.ts");
  assert.match(drive, /manifest/i);
});
