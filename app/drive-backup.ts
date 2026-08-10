import { assertDocumentGraph } from "./document-domain";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "./indexeddb-note-repository";
import { assertNoteStructure, assertSheetContents } from "./note-domain";
import { contentHash } from "./note-migration";
import { NOTE_SCHEMA_VERSION, type LibraryV6 } from "./note-repository";

export type DriveLibrary = LibraryV6;

export const DRIVE_BACKUP_FORMAT = "mednote-library-v2" as const;

export type DriveBackupV2 = {
  format: typeof DRIVE_BACKUP_FORMAT;
  schemaVersion: typeof NOTE_SCHEMA_VERSION;
  exportedAt: number;
  sheetContentHashes: Record<string, string>;
  library: LibraryV6;
};

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

function hashesFor(library: LibraryV6) {
  return Object.fromEntries(library.notes.sheets.map((sheet) => [sheet.id, contentHash(library.sheetContents[sheet.id])]));
}

function assertLibrary(library: LibraryV6) {
  if (!library || library.version !== NOTE_SCHEMA_VERSION) throw new Error(`Bản lưu không dùng schema v${NOTE_SCHEMA_VERSION}`);
  if (!Number.isFinite(library.savedAt)
    || !Number.isFinite(library.preferences?.readerShare)
    || (library.preferences.noteZoom !== undefined && !Number.isFinite(library.preferences.noteZoom))
    || (library.preferences.workspaceMode && !["split", "reader", "note"].includes(library.preferences.workspaceMode))) {
    throw new Error("Metadata điều hướng trong bản lưu Drive không hợp lệ");
  }
  assertNoteStructure(library.notes);
  assertSheetContents(library.notes, library.sheetContents);
  assertDocumentGraph(library.documents, library.notes);
}

function recordSignature(library: LibraryV6) {
  const sort = <T extends { id: string }>(records: T[]) => [...records].sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({
    workspace: library.notes.workspace,
    notebooks: sort(library.notes.notebooks),
    sections: sort(library.notes.sections),
    pages: sort(library.notes.pages),
    sheets: sort(library.notes.sheets),
    active: library.notes.active,
    documents: sort(library.documents.documents),
    contexts: sort(library.documents.contexts),
    groups: sort(library.documents.groups),
    links: sort(library.documents.links),
    linkRelations: sort(library.documents.linkRelations),
    hashes: hashesFor(library),
  });
}

export function createDriveBackup(library: LibraryV6): DriveBackupV2 {
  const snapshot = clone(library);
  assertLibrary(snapshot);
  return {
    format: DRIVE_BACKUP_FORMAT,
    schemaVersion: NOTE_SCHEMA_VERSION,
    exportedAt: Date.now(),
    sheetContentHashes: hashesFor(snapshot),
    library: snapshot,
  };
}

export function parseDriveBackup(payload: unknown): LibraryV6 {
  if (!payload || typeof payload !== "object") throw new Error("Bản lưu Drive không hợp lệ");
  const backup = payload as Partial<DriveBackupV2>;
  if (backup.format !== DRIVE_BACKUP_FORMAT || backup.schemaVersion !== NOTE_SCHEMA_VERSION || !backup.library) {
    throw new Error("Bản lưu Drive không phải manifest v2");
  }
  const library = clone(backup.library);
  assertLibrary(library);
  const actualHashes = hashesFor(library);
  const expectedHashes = backup.sheetContentHashes || {};
  if (Object.keys(actualHashes).length !== Object.keys(expectedHashes).length
    || Object.entries(actualHashes).some(([id, hash]) => expectedHashes[id] !== hash)) {
    throw new Error("Hash nội dung Sheet trong bản lưu Drive không khớp");
  }
  return library;
}

export function verifyLibraryRoundTrip(expected: LibraryV6, actual: LibraryV6) {
  assertLibrary(expected);
  assertLibrary(actual);
  if (recordSignature(expected) !== recordSignature(actual)) {
    throw new Error("Drive round-trip không giữ nguyên ID, hierarchy, link hoặc hash nội dung");
  }
}

/**
 * Imports into an isolated IndexedDB database first. Only a fully reloaded and
 * verified LibraryV6 is returned to the caller for the final local cutover.
 */
export async function stageDriveBackup(payload: unknown, stagingDbName = `mednote-import-staging-${Date.now()}-${Math.random()}`) {
  const expected = parseDriveBackup(payload);
  const staging = new IndexedDbNoteRepository({ dbName: stagingDbName });
  try {
    await staging.replaceLibrary(expected);
    await staging.flush();
    const reloaded = await staging.loadLibrary();
    if (!reloaded) throw new Error("Không đọc lại được dữ liệu Drive trong staging");
    verifyLibraryRoundTrip(expected, reloaded);
    return reloaded;
  } finally {
    await deleteNoteRepositoryDatabase(stagingDbName);
  }
}
