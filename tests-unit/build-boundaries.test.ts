import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

async function missing(path: string) {
  try { await access(new URL(path, root)); return false; } catch { return true; }
}

test("web and desktop share PDF canvas budgeting without build-time source transforms", async () => {
  const web = await source("vite.github.config.ts");
  const desktop = await source("vite.desktop.config.ts");
  const reader = await source("app/pdf-reader.tsx");
  const visibility = await source("app/pdf-page-visibility.ts");
  for (const config of [web, desktop]) {
    assert.doesNotMatch(config, /workspaceSuspensionPlugin/);
    assert.doesNotMatch(config, /thumbnailVirtualizationPlugin/);
    assert.doesNotMatch(config, /desktopPdfCanvasBudgetPlugin/);
  }
  assert.match(reader, /pdfCanvasBudget/);
  assert.doesNotMatch(reader, /new IntersectionObserver/);
  assert.equal((visibility.match(/new IntersectionObserver/g) || []).length, 2);
  assert.equal(await missing("vite.desktop-pdf-canvas-budget.ts"), true);
  assert.equal(await missing("vite.workspace-suspension.ts"), true);
  assert.equal(await missing("vite.thumbnail-virtualization.ts"), true);
});

test("heavy PDF export libraries stay outside the initial application chunk", async () => {
  const page = await source("app/page.tsx");
  const core = await source("app/pdf-export-core.ts");
  assert.match(page, /await import\("\.\/pdf-document-export"\)/);
  assert.doesNotMatch(page, /from "\.\/pdf-document-export"/);
  assert.match(core, /await import\("html2canvas-pro"\)/);
  assert.match(core, /await import\("pdf-lib"\)/);
  assert.doesNotMatch(core, /import html2canvas(?:Pro)? from/);
  assert.doesNotMatch(core, /import \{ PDFDocument \} from "pdf-lib"/);
});

test("legacy v5 is a lazy one-shot reader with no production write or cache module", async () => {
  const bootstrap = await source("app/app-bootstrap.ts");
  const migration = await source("app/note-migration.ts");
  const v5Reader = await source("app/v5-storage-import.ts");
  assert.equal(await missing("app/incremental-library-store.ts"), true);
  assert.doesNotMatch(bootstrap, /incremental-library-store|library:v5|loadIncrementalLibrary/);
  assert.match(migration, /await import\("\.\/v5-storage-import"\)/);
  assert.doesNotMatch(migration, /from "\.\/v5-storage-import"/);
  assert.doesNotMatch(migration, /migrateV5ToV6|V5MigrationSource/);
  assert.match(v5Reader, /export function migrateV5ToV6/);
  assert.match(migration, /migrationState\?\.v5Purged/);
  assert.doesNotMatch(migration, /export async function discardStoredV5Library/);
  assert.doesNotMatch(v5Reader, /\.put\(|\.delete\(|saveQueue|canonicalCache|persistedSignatures/);
});

test("Drive UI consumes a stateful controller instead of page scope props", async () => {
  const [page, controller, googleDrive, topBar, panel] = await Promise.all([
    source("app/page.tsx"),
    source("app/drive-controller.tsx"),
    source("app/google-drive.ts"),
    source("app/ui/app-top-bar.tsx"),
    source("app/ui/drive-panel.tsx"),
  ]);
  assert.match(page, /useDriveController/);
  assert.match(page, /const contextDrive = useLiveController\(drive\)/);
  assert.match(page, /DriveControllerProvider controller=\{contextDrive\}/);
  assert.doesNotMatch(page, /driveStatus|driveToken|setDrivePanelOpen/);
  assert.match(controller, /useState<DriveStatus>/);
  assert.match(controller, /driveSyncService\.resume/);
  assert.match(controller, /prepareDriveAuthorization/);
  assert.match(googleDrive, /error_callback/);
  assert.match(googleDrive, /DRIVE_AUTH_TIMEOUT_MS/);
  assert.match(googleDrive, /DRIVE_FETCH_TIMEOUT_MS/);
  assert.match(topBar, /useActiveDriveController/);
  assert.match(panel, /useActiveDriveController/);
  assert.doesNotMatch(panel, /DrivePanelScope|\{ scope \}/);
});

test("PDF navigation owns rail and search behavior instead of receiving a page scope", async () => {
  const [page, controller, rail, toolbar, stage] = await Promise.all([
    source("app/page.tsx"),
    source("app/pdf-navigation-controller.tsx"),
    source("app/ui/pdf-navigation-rail.tsx"),
    source("app/ui/pdf-toolbar.tsx"),
    source("app/ui/pdf-reader-stage.tsx"),
  ]);
  assert.match(page, /usePdfNavigationController/);
  assert.match(page, /const contextPdfNavigation = useLiveController\(pdfNavigation\)/);
  assert.match(page, /PdfNavigationControllerProvider controller=\{contextPdfNavigation\}/);
  assert.doesNotMatch(page, /pdfSearchAbortRef|setSearchResults|setPdfRailTab|setShowPdfRail/);
  assert.match(controller, /const \[railTab, setRailTab\] = useState/);
  assert.match(controller, /const \[searchResults, setSearchResults\] = useState/);
  assert.match(controller, /current\.reader\.search/);
  assert.match(rail, /useActivePdfNavigationController/);
  assert.doesNotMatch(rail, /PdfNavigationRailScope|\{ scope \}/);
  assert.match(toolbar, /useActivePdfNavigationController/);
  assert.match(stage, /useActivePdfNavigationController/);
});

test("page uses noteStore as the sole owner of active Notebook and Sheet content", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /const activeNotebook = noteState\.structure/);
  assert.match(page, /notebookFromStructure\(noteState\.structure/);
  assert.match(page, /noteStore\.updateActiveSheetContent\(notePageToSheetContent\(\{ \.\.\.activeNote, \.\.\.changes \}\)\)/);
  assert.doesNotMatch(page, /legacyActiveNotebook|storeActiveNotebook|updateActiveNotebook/);
  assert.doesNotMatch(page, /\b(?:activeWorkspace|workspace)\.notebooks\b/);
  assert.doesNotMatch(page, /createDemoWorkspace/);
});
