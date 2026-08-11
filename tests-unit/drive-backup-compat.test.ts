import assert from "node:assert/strict";
import test from "node:test";

import { createDriveBackup, parseDriveBackup } from "../app/drive-backup";
import type { LibraryV6 } from "../app/note-repository";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Notebook", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Section", order: 0 }],
      pages: [{ id: "page", sectionId: "sec", title: "Page", order: 0 }],
      sheets: [{ id: "sheet", pageId: "page", order: 0 }],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet" },
    },
    sheetContents: { sheet: { body: "legacy json hash", excerpts: [] } },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "note", noteZoom: 1 },
    savedAt: 1,
  };
}

test("unmarked legacy v2 hash remains restorable regardless of exportedAt", () => {
  const backup = createDriveBackup(library());
  delete backup.sheetHashAlgorithm;
  backup.exportedAt = Date.now();
  backup.sheetContentHashes.sheet = "legacy-pre-json-hash";
  const restored = parseDriveBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.sheetContents.sheet.body, "legacy json hash");
});

test("unmarked legacy v2 still rejects an incomplete Sheet hash set", () => {
  const backup = createDriveBackup(library());
  delete backup.sheetHashAlgorithm;
  delete backup.sheetContentHashes.sheet;
  assert.throws(() => parseDriveBackup(JSON.parse(JSON.stringify(backup))), /Hash nội dung Sheet/);
});

test("marked json-safe v2 remains strict when a Sheet hash is altered", () => {
  const backup = createDriveBackup(library());
  backup.sheetContentHashes.sheet = "tampered";
  assert.throws(() => parseDriveBackup(JSON.parse(JSON.stringify(backup))), /Hash nội dung Sheet/);
});
