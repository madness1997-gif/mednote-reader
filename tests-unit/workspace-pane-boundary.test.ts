import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ReaderPane and NotePane consume controllers through context and accept only view models", async () => {
  const [page, context, readerPane, notePane, readerStage, readerToolbar, noteStage, noteToolbar] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-controllers-context.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-reader-pane.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-pane.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-reader-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-toolbar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ReaderPaneControllersProvider controllers=\{readerPaneControllers\}>/);
  assert.match(page, /<NotePaneControllersProvider controllers=\{notePaneControllers\}>/);
  assert.match(page, /<ReaderPane viewModel=\{readerPaneViewModel\}/);
  assert.match(page, /<NotePane viewModel=\{notePaneViewModel\}/);
  assert.doesNotMatch(page, /<ReaderPane scope=|<NotePane toolbar=/);
  assert.doesNotMatch(page, /useNoteToolbar|const NOTE_ZOOM_PRESETS/);

  assert.match(context, /type ReaderPaneControllers/);
  assert.match(context, /type NotePaneControllers/);
  assert.doesNotMatch(context, /type WorkspaceControllers =/);
  for (const controller of ["documents", "layout", "noteCanvas", "noteEditor", "readerInteraction"]) assert.match(context, new RegExp(`${controller}:`));
  assert.match(readerPane, /ReaderPaneViewModel/);
  assert.match(notePane, /NotePaneViewModel/);

  for (const consumer of [readerStage, readerToolbar]) assert.match(consumer, /useReaderPaneControllers/);
  for (const consumer of [noteStage, noteToolbar]) assert.match(consumer, /useNotePaneControllers/);
  assert.doesNotMatch(noteStage, /useNoteStoreSnapshot/);
  for (const obsoleteScope of ["ReaderPaneScope", "PdfReaderStageScope", "PdfToolbarScope", "NoteStageScope", "NoteToolbarScope"]) {
    assert.equal([readerPane, notePane, readerStage, readerToolbar, noteStage, noteToolbar].some((source) => source.includes(obsoleteScope)), false);
  }
});
