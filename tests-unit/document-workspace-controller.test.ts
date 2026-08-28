import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("page composes one document workspace controller and document UI consumes that boundary", async () => {
  const [page, controller, topBar, library, stage, toolbar] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-document-workspace-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/app-top-bar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/library-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-reader-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-toolbar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const documentWorkspace = useDocumentWorkspaceController/);
  assert.match(page, /documents: documentWorkspace/);
  assert.match(page, /openExcerptSource: documentWorkspace\.openExcerptSource/);
  for (const forbidden of [
    "const handlePdfFiles",
    "const saveTemporaryWorkspace",
    "const addNotebook",
    "const openLibraryDocument",
    "const applyDocumentMutation",
    "const renameLibraryDocument",
    "const deleteWorkspace",
    "const deleteActiveDocument",
    "documentLibrary.importPdfFiles",
    "documentLibrary.linkWorkspaceToNote",
    "requestNoteDestination",
  ]) assert.equal(page.includes(forbidden), false, `page.tsx still owns ${forbidden}`);

  for (const operation of [
    "importPdfFiles",
    "saveTemporaryWorkspace",
    "linkWorkspaceToNote",
    "renameWorkspace",
    "deleteWorkspace",
    "deleteDocument",
  ]) assert.match(controller, new RegExp(`documentLibrary\\.${operation}`));
  assert.match(controller, /const openExcerptSource/);
  assert.match(controller, /dropDocumentHistories/);

  for (const consumer of [topBar, library, stage, toolbar]) {
    assert.match(consumer, /DocumentWorkspaceController/);
  }
});
