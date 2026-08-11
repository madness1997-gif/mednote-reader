import assert from "node:assert/strict";
import test from "node:test";

import { createDriveBackup, parseDriveBackup, DRIVE_BACKUP_FORMAT } from "../app/drive-backup";
import { NOTE_SCHEMA_VERSION, type LibraryV6 } from "../app/note-repository";
import { contentHash } from "../app/note-migration";

function library(): LibraryV6 {
  return {
    version: NOTE_SCHEMA_VERSION,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Section", order: 0 }],
      pages: [{ id: "page", sectionId: "sec", title: "Page", order: 0 }],
      sheets: [{ id: "sheet", pageId: "page", order: 0 }],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet" },
    },
    sheetContents: {
      sheet: {
        body: "hello",
        excerpts: [{ id: "excerpt", kind: "text", text: "hello", documentId: undefined } as never],
      },
    },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "note", noteZoom: 1 },
    savedAt: 1,
  };
}

test("Drive v2 hashes the exact JSON representation that will be uploaded", () => {
  const backup = createDriveBackup(library());
  const uploaded = JSON.parse(JSON.stringify(backup));
  const restored = parseDriveBackup(uploaded);
  assert.equal(restored.sheetContents.sheet.body, "hello");
  assert.equal(backup.sheetContentHashes.sheet, contentHash(uploaded.library.sheetContents.sheet));
});

test("pre-fix v2 manifest with the same Sheet ID set can be imported once", () => {
  const source = library();
  const jsonLibrary = JSON.parse(JSON.stringify(source)) as LibraryV6;
  const legacyHash = contentHash(source.sheetContents.sheet);
  const canonicalHash = contentHash(jsonLibrary.sheetContents.sheet);
  assert.notEqual(legacyHash, canonicalHash, "fixture must reproduce undefined-field JSON hash drift");
  const payload = {
    format: DRIVE_BACKUP_FORMAT,
    schemaVersion: NOTE_SCHEMA_VERSION,
    exportedAt: 1786422500000,
    sheetContentHashes: { sheet: legacyHash },
    library: jsonLibrary,
  };
  assert.equal(parseDriveBackup(payload).sheetContents.sheet.body, "hello");
});

test("new v2 manifests still reject a real Sheet hash mismatch", () => {
  const backup = createDriveBackup(library());
  const payload = JSON.parse(JSON.stringify(backup));
  payload.exportedAt = 1786422700000;
  payload.library.sheetContents.sheet.body = "tampered";
  assert.throws(() => parseDriveBackup(payload), /Hash nội dung Sheet/);
});
