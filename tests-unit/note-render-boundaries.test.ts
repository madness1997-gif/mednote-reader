import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PDF export owns a dedicated render surface and cannot navigate the live editor", async () => {
  const exportSource = await source("app/note-pdf-export.tsx");
  assert.match(exportSource, /note-pdf-export-surface/);
  assert.match(exportSource, /loadSheetContents\(plan\.sheetIds\)/);
  assert.doesNotMatch(exportSource, /noteStore\.openSheet\(/);
});

test("continuous Sheet previews are windowed behind measured virtual slots", async () => {
  const [stageSource, virtualSource] = await Promise.all([
    source("app/ui/note-stage.tsx"),
    source("app/ui/virtualized-note-sheet-preview.tsx"),
  ]);
  assert.match(stageSource, /VirtualizedNoteSheetPreview/);
  assert.match(stageSource, /data-note-virtual-total/);
  assert.match(virtualSource, /IntersectionObserver/);
  assert.match(virtualSource, /ResizeObserver/);
  assert.match(virtualSource, /note-sheet-virtual-placeholder/);
});
