import assert from "node:assert/strict";
import test from "node:test";
import { NoteInkSession } from "../app/note-ink-session";
import { NoteObjectSession } from "../app/note-object-session";
import type { ExcerptLayout, NoteExcerpt, Stroke } from "../app/note-runtime-adapter";

function stroke(id: string, x = 0): Stroke {
  return { id, tool: "pen", color: "#000", width: 2, points: [{ x, y: .2, pressure: .5 }] };
}

test("NoteExcerpt serializes sticker style", () => {
  const sticker: NoteExcerpt = {
    id: "sticker-1", kind: "text", sourceKind: "manual", text: "High yield", richText: "High yield",
    stickerStyle: "high-yield", createdAt: 1,
    layout: { x: .1, y: .1, width: .3, height: .2, contentScale: 1, rotation: 0, opacity: 1, autoFit: false },
  };
  assert.equal((JSON.parse(JSON.stringify(sticker)) as NoteExcerpt).stickerStyle, "high-yield");
});

test("ink history is capped at 60 and isolated by Sheet", () => {
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

test("object operations preserve PDF provenance", () => {
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
  assert.equal(session.move(layout, .25, 0).x, .35);
  assert.equal(session.move(layout, 1, 0).x, .7);
  assert.equal(session.move(layout, -.4, 0).x, 0);
  assert.equal(session.move(layout, 0, .3).y, .5);
});
