import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nearestPdfPage } from "../app/use-reader-interaction-controller";

test("reader scroll restoration selects the page nearest its viewport anchor", () => {
  assert.equal(nearestPdfPage([
    { page: 4, top: -320 },
    { page: 5, top: 36 },
    { page: 6, top: 714 },
  ], 24), 5);
  assert.equal(nearestPdfPage([
    { page: 9, top: 180 },
    { page: 10, top: 80 },
  ], 120), 10);
  assert.equal(nearestPdfPage([], 0), null);
});

test("page composes one reader interaction controller and reader UI consumes that boundary", async () => {
  const [page, controller, context, stage, toolbar, selectionMenu, noteCanvas] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-reader-interaction-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-controllers-context.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-reader-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-selection-menu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-note-canvas-controller.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const readerInteraction = useReaderInteractionController/);
  assert.match(page, /const contextReaderInteraction = useLiveController\(readerInteraction\)/);
  assert.match(page, /readerInteraction: contextReaderInteraction/);
  assert.match(page, /<PdfSelectionMenu controller=\{readerInteraction\}/);
  for (const forbidden of [
    "const handlePdfSelection", "const addPdfMarkup", "lookupEnglishVietnamese",
    "const handlePdfWheelZoom", "pendingReaderScrollRestoreRef", "readerScrollPositionRef",
    "useState<PdfSelection", "setPdfHistory(", "className={`pdf-selection-menu",
  ]) assert.equal(page.includes(forbidden), false, `page.tsx still owns ${forbidden}`);

  assert.match(controller, /lookupEnglishVietnamese/);
  assert.match(controller, /replacePdfPageAnnotationCommand/);
  assert.match(controller, /zoomAroundAnchor/);
  assert.match(controller, /new ResizeObserver/);
  assert.match(controller, /handleCrop: onCrop/);
  assert.match(context, /readerInteraction: ReaderInteractionController/);
  assert.match(stage, /useReaderPaneControllers/);
  assert.match(stage, /onCrop=\{handleCrop\}/);
  assert.match(toolbar, /useReaderPaneControllers/);
  assert.match(selectionMenu, /controller: ReaderInteractionController/);
  assert.match(noteCanvas, /getPdfSelection/);
  assert.match(noteCanvas, /setPdfTool\("crop"\)/);
});
