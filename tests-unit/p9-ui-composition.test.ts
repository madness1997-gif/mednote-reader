import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

async function missing(path: string) {
  try { await access(new URL(path, root)); return false; } catch { return true; }
}

test("P9 removes page.tsx build transforms and keeps desktop canvas budget", async () => {
  const web = await source("vite.github.config.ts");
  const desktop = await source("vite.desktop.config.ts");
  for (const config of [web, desktop]) {
    assert.doesNotMatch(config, /workspaceSuspensionPlugin/);
    assert.doesNotMatch(config, /thumbnailVirtualizationPlugin/);
  }
  assert.match(desktop, /desktopPdfCanvasBudgetPlugin/);
  assert.equal(await missing("vite.workspace-suspension.ts"), true);
  assert.equal(await missing("vite.thumbnail-virtualization.ts"), true);
});

test("P9 page is the composition root and no longer owns major JSX clusters", async () => {
  const page = await source("app/page.tsx");
  for (const component of ["AppTopBar", "DrivePanel", "LibraryPanel", "WorkspaceShell", "PdfNavigationRail", "ReaderPane", "NotePane", "NoteNavigationHost", "SplitDivider"]) {
    assert.match(page, new RegExp(component));
  }
  assert.match(page, /const showReader = workspaceMode !== "note"/);
  assert.match(page, /const showNote = workspaceMode !== "reader"/);
  assert.doesNotMatch(page, /<header className="topbar">/);
  assert.doesNotMatch(page, /<aside className="drive-panel">/);
  assert.doesNotMatch(page, /<div className="library-backdrop">/);
  assert.doesNotMatch(page, /function PdfThumbnail/);
  assert.doesNotMatch(page, /function NoteSheetPreview/);
});

test("P9 preserves P7/P8 runtime ownership at composition root", async () => {
  const page = await source("app/page.tsx");
  const reader = await source("app/ui/pdf-reader-pane.tsx");
  const note = await source("app/ui/note-pane.tsx");
  assert.match(page, /PdfReaderController/);
  assert.match(page, /NoteInkSession/);
  assert.match(page, /noteStore/);
  assert.doesNotMatch(reader, /PdfReaderController/);
  assert.doesNotMatch(note, /NoteStore|noteStore|NoteInkSession/);
});

test("P9 PDF rail owns virtualization UI, not reader lifecycle", async () => {
  const rail = await source("app/ui/pdf-navigation-rail.tsx");
  assert.match(rail, /VirtualPdfThumbnailList/);
  assert.match(rail, /pdfRailTab === "pages"/);
  assert.match(rail, /pdfRailTab === "outline"/);
  assert.match(rail, /pdfRailTab === "search"/);
  assert.doesNotMatch(rail, /PdfReaderController|loadPdfDocument|loadPdfiumDocument/);
});

test("P9 Library and Drive panels are render consumers only", async () => {
  const library = await source("app/ui/library-panel.tsx");
  const drive = await source("app/ui/drive-panel.tsx");
  assert.doesNotMatch(library, /noteStore|NoteStore|DriveSyncService|driveSyncService/);
  assert.doesNotMatch(drive, /DriveSyncService|driveSyncService|noteStore|NoteStore/);
  assert.match(library, /libraryProjection/);
});

test("P9 note UI is split into toolbar, stage, preview and toolbar view model", async () => {
  const pane = await source("app/ui/note-pane.tsx");
  const stage = await source("app/ui/note-stage.tsx");
  const preview = await source("app/ui/note-sheet-preview.tsx");
  const toolbarHook = await source("app/use-note-toolbar.ts");
  assert.match(pane, /NoteToolbar/);
  assert.match(pane, /NoteStage/);
  assert.match(pane, /useNoteToolbar/);
  assert.match(stage, /NoteSheetPreview/);
  assert.match(preview, /NoteObjectLayer/);
  assert.match(preview, /NoteInkCanvas/);
  assert.match(toolbarHook, /useNoteToolbar/);
});

test("P9 workspace shell only composes layout slots", async () => {
  const shell = await source("app/ui/workspace-shell.tsx");
  assert.match(shell, /pdfRail/);
  assert.match(shell, /reader/);
  assert.match(shell, /divider/);
  assert.match(shell, /noteNavigation/);
  assert.doesNotMatch(shell, /noteStore|PdfReaderController|DriveSyncService|localBinaryStorage/);
});
