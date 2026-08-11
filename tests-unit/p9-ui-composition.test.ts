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

test("Library keeps documents on the left and notes on the right", async () => {
  const library = await source("app/ui/library-panel.tsx");
  const layout = await source("app/library-two-column.css");
  const documents = library.indexOf('aria-label="Tài liệu"');
  const notes = library.indexOf('aria-label="Ghi chú"');
  assert.ok(documents >= 0 && notes > documents);
  assert.match(library, /className="library-list library-two-column"/);
  assert.match(layout, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});

test("P9 note UI is split into toolbar, stage, preview and toolbar view model", async () => {
  const page = await source("app/page.tsx");
  const pane = await source("app/ui/note-pane.tsx");
  const stage = await source("app/ui/note-stage.tsx");
  const preview = await source("app/ui/note-sheet-preview.tsx");
  const toolbarHook = await source("app/use-note-toolbar.ts");
  assert.match(pane, /NoteToolbar/);
  assert.match(pane, /NoteStage/);
  assert.match(page, /useNoteToolbar/);
  assert.match(pane, /toolbar=|toolbar:/);
  assert.match(pane, /stage=|stage:/);
  assert.match(stage, /NoteSheetPreview/);
  assert.match(preview, /NoteObjectLayer/);
  assert.match(preview, /NoteInkCanvas/);
  assert.match(toolbarHook, /useNoteToolbar/);
  assert.match(toolbarHook, /canUndo:/);
  assert.match(toolbarHook, /canRedo:/);
  assert.match(toolbarHook, /TOOLBAR_KEYS/);
});

test("P9 UI contracts keep extracted components inside strict TypeScript", async () => {
  const paths = [
    "app/ui/app-top-bar.tsx",
    "app/ui/drive-panel.tsx",
    "app/ui/library-panel.tsx",
    "app/ui/pdf-navigation-rail.tsx",
    "app/ui/pdf-toolbar.tsx",
    "app/ui/pdf-reader-stage.tsx",
    "app/ui/note-navigation-host.tsx",
    "app/ui/note-toolbar.tsx",
    "app/ui/note-stage.tsx",
    "app/ui/note-pane.tsx",
    "app/ui/pdf-reader-pane.tsx",
  ];
  const files = await Promise.all(paths.map(source));
  for (const file of files) {
    assert.doesNotMatch(file, /@ts-nocheck/);
    assert.doesNotMatch(file, /Record<string,\s*any>|\bany\b/);
  }
  assert.match(await source("app/ui/ui-contracts.ts"), /export type Tool/);
});

test("heavy PDF export libraries stay outside the initial application chunk", async () => {
  const page = await source("app/page.tsx");
  const core = await source("app/pdf-export-core.ts");
  assert.match(page, /await import\("\.\/pdf-document-export"\)/);
  assert.doesNotMatch(page, /from "\.\/pdf-document-export"/);
  assert.match(core, /await import\("html2canvas"\)/);
  assert.match(core, /await import\("pdf-lib"\)/);
  assert.doesNotMatch(core, /import html2canvas from/);
  assert.doesNotMatch(core, /import \{ PDFDocument \} from "pdf-lib"/);
});

test("P9 workspace shell only composes layout slots", async () => {
  const shell = await source("app/ui/workspace-shell.tsx");
  assert.match(shell, /pdfRail/);
  assert.match(shell, /reader/);
  assert.match(shell, /divider/);
  assert.match(shell, /noteNavigation/);
  assert.doesNotMatch(shell, /noteStore|PdfReaderController|DriveSyncService|localBinaryStorage/);
});
