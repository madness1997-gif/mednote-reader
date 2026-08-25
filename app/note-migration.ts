import { assertDocumentGraph } from "./document-domain";
import { assertNoteStructure, assertSheetContents, type NoteStructure, type Page, type Section, type Sheet, type SheetContentMap } from "./note-domain";
import { IndexedDbNoteRepository, V6_KEYS } from "./indexeddb-note-repository";
import {
  LEGACY_META_WORKSPACE,
  contentHash,
  dedupeNotebookTitles,
  defaultMigrationActive as defaultActive,
  finishMigratedLibrary as finishLibrary,
  migrationReport,
  normalizedMigrationOrder as normalizedOrder,
  stableMigrationStringify as stableStringify,
  stripMigrationNavigation as stripNavigation,
  type AnyRecord,
  type MigrationReport,
  type MigrationResult,
} from "./note-migration-core";
import { NOTE_SCHEMA_VERSION, type LibraryV6 } from "./note-repository";
import type { LegacyRelationV2 } from "./relation-v2-migration";
import { stableId } from "./stable-id";

export type { LegacyRelationV2 } from "./relation-v2-migration";
export { contentHash } from "./note-migration-core";
export type { MigrationReport, MigrationResult } from "./note-migration-core";

export type LegacySnapshot = {
  workspaces: AnyRecord[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
  savedAt?: number;
};

const V5_STORAGE_PREFIX = "library:v5:";

export function migrateLegacySnapshotToV6(snapshot: LegacySnapshot, sourceVersion: 3 | 4, relation?: LegacyRelationV2): MigrationResult {
  const warnings: string[] = [];
  const relationNotebooks = new Map((relation?.notebooks || []).map((record) => [String(record.id), record]));
  const contexts = snapshot.workspaces.filter((workspace) => String(workspace.id) !== LEGACY_META_WORKSPACE);
  const notebookSources = new Map<string, AnyRecord>();
  contexts.forEach((workspace) => (workspace.notebooks || []).forEach((notebook: AnyRecord) => {
    if (String(notebook.id || "").startsWith("__mednote_reader_placeholder__:")) return;
    if (!notebookSources.has(String(notebook.id)) || workspace.id === snapshot.activeWorkspaceId) notebookSources.set(String(notebook.id), notebook);
  }));
  const notebooks: NoteStructure["notebooks"] = [];
  const sections: Section[] = [];
  const pages: Page[] = [];
  const sheets: Sheet[] = [];
  const sheetContents: SheetContentMap = {};
  const sheetToPage = new Map<string, string>();

  [...notebookSources.values()].forEach((notebook, notebookOrder) => {
    const notebookId = String(notebook.id);
    notebooks.push({ id: notebookId, title: String(notebook.title || "Sổ ghi chú"), order: notebookOrder });
    const physicalSheets = Array.isArray(notebook.pages) ? notebook.pages : [];
    const physicalIds = new Set<string>(physicalSheets.map((sheet: AnyRecord) => String(sheet.id)));
    const relationRecord = relationNotebooks.get(notebookId);
    const legacySections = Array.isArray(relationRecord?.sections) && relationRecord.sections.length
      ? relationRecord.sections
      : [{ id: stableId("section", notebookId), title: "Phần 1", pageIds: [...physicalIds] }];
    const sectionForSheet = new Map<string, string>();
    legacySections.forEach((record: AnyRecord, order: number) => {
      const sectionId = String(record.id || stableId("section", `${notebookId}:${order}`));
      sections.push({ id: sectionId, notebookId, title: String(record.title || `Phần ${order + 1}`), order });
      (record.pageIds || []).forEach((sheetId: unknown) => {
        const id = String(sheetId);
        if (physicalIds.has(id) && !sectionForSheet.has(id)) sectionForSheet.set(id, sectionId);
      });
    });
    const fallbackSection = sections.find((record) => record.notebookId === notebookId)!;
    const groups = new Map<string, AnyRecord[]>();
    physicalSheets.forEach((sheet: AnyRecord) => {
      const logicalId = String(sheet.pageId || sheet.logicalPageId || sheet.id);
      const group = groups.get(logicalId) || [];
      group.push(sheet);
      groups.set(logicalId, group);
    });
    const pageOrder = new Map<string, number>();
    groups.forEach((groupSheets, logicalId) => {
      groupSheets.sort((left, right) => normalizedOrder(left.order ?? left.sheetOrder, physicalSheets.indexOf(left)) - normalizedOrder(right.order ?? right.sheetOrder, physicalSheets.indexOf(right)));
      const sectionId = sectionForSheet.get(String(groupSheets[0].id)) || fallbackSection.id;
      const order = pageOrder.get(sectionId) || 0;
      pageOrder.set(sectionId, order + 1);
      const preferred = groupSheets.find((sheet) => String(sheet.id) === String(notebook.activePageId)) || groupSheets[0];
      pages.push({ id: logicalId, sectionId, title: String(preferred.logicalPageTitle || preferred.title || "Page mới").trim() || "Page mới", order });
      groupSheets.forEach((sheet, sheetOrder) => {
        const id = String(sheet.id);
        sheets.push({ id, pageId: logicalId, order: sheetOrder });
        sheetContents[id] = stripNavigation(sheet);
        sheetToPage.set(id, logicalId);
      });
    });
  });
  const activeWorkspace = contexts.find((workspace) => String(workspace.id) === snapshot.activeWorkspaceId) || contexts[0];
  const activeNotebook = notebookSources.get(String(activeWorkspace?.activeNotebookId || "")) || notebookSources.values().next().value;
  const activeSheetId = String(activeNotebook?.activePageId || "");
  const activePageId = sheetToPage.get(activeSheetId) || "";
  const activePage = pages.find((record) => record.id === activePageId);
  const activeSection = activePage && sections.find((record) => record.id === activePage.sectionId);
  const notesBase = { workspace: { id: "workspace", title: "MedNote" }, notebooks, sections, pages, sheets };
  const active = defaultActive(notesBase, {
    activeNotebookId: String(activeNotebook?.id || ""),
    activeSectionId: String(activeSection?.id || ""),
    activePageId,
    activeSheetId,
  });
  const library = finishLibrary(
    { ...notesBase, active },
    sheetContents,
    contexts,
    relation,
    [],
    {
      activeDocumentContextId: snapshot.activeWorkspaceId,
      readerShare: Number(snapshot.readerShare) || 50,
      workspaceMode: snapshot.workspaceMode,
      noteZoom: Number(snapshot.noteZoom) || 1,
    },
    Number(snapshot.savedAt) || Date.now(),
    warnings,
  );
  return { library, report: migrationReport(sourceVersion, library, warnings) };
}

export function verifyMigration(result: MigrationResult, expectedSheetHashes?: Record<string, string>) {
  assertNoteStructure(result.library.notes);
  assertSheetContents(result.library.notes, result.library.sheetContents);
  assertDocumentGraph(result.library.documents, result.library.notes);
  if (expectedSheetHashes) {
    const actual = Object.fromEntries(result.library.notes.sheets.map((sheet) => [sheet.id, contentHash(result.library.sheetContents[sheet.id])]));
    const mismatches = Object.entries(expectedSheetHashes).filter(([id, hash]) => actual[id] !== hash);
    if (mismatches.length) throw new Error(`Migration làm thay đổi Sheet.content: ${mismatches.map(([id]) => id).join(", ")}`);
  }
  return result.report;
}

const requestValue = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function openLegacyDb(dbName: string, storeName: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove the import-only v5 namespace after v6 has been loaded and verified.
 * The object store is shared with PDFs/assets, so cleanup is intentionally
 * prefix-bound and never clears the store wholesale. A marker in canonical
 * v6 metadata makes this scan a one-shot operation across later bootstraps.
 */
async function discardStoredV5Library(options: { dbName?: string; storeName?: string } = {}) {
  const dbName = options.dbName || "mednote-local";
  const storeName = options.storeName || "documents";
  const db = await openLegacyDb(dbName, storeName);
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      let removed = 0;
      const metaRequest = store.get(V6_KEYS.meta);
      metaRequest.onsuccess = () => {
        const meta = metaRequest.result as AnyRecord | undefined;
        if (!meta || meta.version !== NOTE_SCHEMA_VERSION) {
          transaction.abort();
          return;
        }
        if (meta.migrationState?.v5Purged === true) return;
        const range = IDBKeyRange.bound(V5_STORAGE_PREFIX, `${V5_STORAGE_PREFIX}\uffff`);
        const cursorRequest = store.openKeyCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            removed += 1;
            cursor.continue();
            return;
          }
          store.put({
            ...meta,
            migrationState: { ...meta.migrationState, v5Purged: true },
          }, V6_KEYS.meta);
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      };
      metaRequest.onerror = () => reject(metaRequest.error);
      transaction.oncomplete = () => resolve(removed);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Không thể xác nhận cleanup v5 trên kho v6"));
    });
  } finally {
    db.close();
  }
}

async function discardV5AfterVerifiedCutover(dbName: string, storeName: string, report: MigrationReport) {
  try {
    await discardStoredV5Library({ dbName, storeName });
  } catch {
    // v6 is already authoritative and verified. A cleanup failure must not
    // send the app back through legacy fallback; the next bootstrap still
    // skips v5 whenever the v6 repository loads successfully.
    report.warnings.push("Kho v6 đã hợp lệ nhưng chưa xóa được dữ liệu v5 cũ");
  }
}

async function readV34Snapshot(dbName: string, storeName: string): Promise<{ version: 3 | 4; snapshot: LegacySnapshot } | null> {
  const db = await openLegacyDb(dbName, storeName);
  try {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const meta = await requestValue(store.get("library:v3:meta")) as AnyRecord | undefined;
    if (![3, 4].includes(Number(meta?.version)) || !meta?.workspaceIds?.length) return null;
    const legacyMeta = meta;
    const workspaces = await Promise.all(legacyMeta.workspaceIds.map((id: string) => requestValue(store.get(`library:v3:workspace:${id}`)))) as AnyRecord[];
    if (workspaces.some((record) => !record)) throw new Error("Kho v3/v4 thiếu Workspace record");
    const notebookIds = [...new Set<string>(workspaces.flatMap((workspace) => (workspace.notebookIds || []).map(String)))];
    const notebookRecords = await Promise.all(notebookIds.map((id) => requestValue(store.get(`library:v3:notebook:${id}`)))) as AnyRecord[];
    if (notebookRecords.some((record) => !record)) throw new Error("Kho v3/v4 thiếu Notebook record");
    const notebookMap = new Map(notebookRecords.map((record) => [String(record.id), record]));
    const pageIds = [...new Set<string>(notebookRecords.flatMap((notebook) => (notebook.pageIds || []).map(String)))];
    const pageRecords = await Promise.all(pageIds.map((id) => requestValue(store.get(`library:v3:page:${id}`)))) as AnyRecord[];
    if (pageRecords.some((record) => !record)) throw new Error("Kho v3/v4 thiếu Page/Sheet record");
    const pageMap = new Map(pageRecords.map((record) => [String(record.id), record]));
    const runtimeWorkspaces: AnyRecord[] = workspaces.map((workspace) => ({
      ...workspace,
      notebooks: (workspace.notebookIds || []).map((id: string) => {
        const notebook = notebookMap.get(String(id))!;
        return { ...notebook, pages: (notebook.pageIds || []).map((pageId: string) => pageMap.get(String(pageId))) };
      }),
    }));
    return {
      version: Number(legacyMeta.version) as 3 | 4,
      snapshot: {
        workspaces: runtimeWorkspaces,
        activeWorkspaceId: String(legacyMeta.activeWorkspaceId || runtimeWorkspaces[0]?.id || ""),
        readerShare: Number(legacyMeta.readerShare) || 50,
        workspaceMode: legacyMeta.workspaceMode,
        noteZoom: Number(legacyMeta.noteZoom) || 1,
        savedAt: Number(legacyMeta.savedAt) || Date.now(),
      },
    };
  } finally {
    db.close();
  }
}

export async function migrateStoredLibraryToV6(options: {
  dbName?: string;
  storeName?: string;
  relation?: LegacyRelationV2;
  localSnapshot?: LegacySnapshot;
  localSnapshotVersion?: 3 | 4;
} = {}): Promise<MigrationResult | null> {
  const dbName = options.dbName || "mednote-local";
  const storeName = options.storeName || "documents";
  const repository = new IndexedDbNoteRepository({ dbName, storeName });
  const current = await repository.loadLibrary();
  if (current) {
    const repairedNotebooks = dedupeNotebookTitles(current.notes.notebooks);
    const changed = repairedNotebooks.some((notebook, index) => notebook.title !== current.notes.notebooks[index]?.title);
    if (changed) {
      const repaired: LibraryV6 = { ...current, notes: { ...current.notes, notebooks: repairedNotebooks }, savedAt: Math.max(Date.now(), current.savedAt + 1) };
      await repository.replaceLibrary(repaired);
      const reloaded = await repository.loadLibrary();
      if (!reloaded) throw new Error("Đã sửa tên Notebook trùng nhưng không load lại được");
      const report = migrationReport(6, reloaded, ["Đã tự đổi tên các Notebook trùng trong kho v6 hiện hữu"]);
      await discardV5AfterVerifiedCutover(dbName, storeName, report);
      return { library: reloaded, report };
    }
    const report = migrationReport(6, current, ["Kho v6 đã tồn tại; migration không ghi lại"]);
    await discardV5AfterVerifiedCutover(dbName, storeName, report);
    return { library: current, report };
  }
  let result: MigrationResult | null = null;
  const { importStoredV5Library } = await import("./v5-storage-import");
  result = await importStoredV5Library(dbName, storeName, options.relation);
  if (!result) {
    const legacy = await readV34Snapshot(dbName, storeName);
    if (legacy) result = migrateLegacySnapshotToV6(legacy.snapshot, legacy.version, options.relation);
  }
  if (!result && options.localSnapshot) result = migrateLegacySnapshotToV6(options.localSnapshot, options.localSnapshotVersion || 4, options.relation);
  if (!result) return null;
  verifyMigration(result, result.report.sheetContentHashes);
  if (result.report.warnings.length) {
    throw new Error(`Dừng migration v6 vì có relation/link chưa bảo toàn: ${result.report.warnings.join("; ")}`);
  }
  await repository.replaceLibrary(result.library);
  const reloaded = await repository.loadLibrary();
  if (!reloaded) throw new Error("Đã ghi v6 nhưng không load lại được");
  const reloadedHashes = Object.fromEntries(reloaded.notes.sheets.map((sheet) => [sheet.id, contentHash(reloaded.sheetContents[sheet.id])]));
  verifyMigration({ library: reloaded, report: result.report }, result.report.sheetContentHashes);
  if (stableStringify(reloadedHashes) !== stableStringify(result.report.sheetContentHashes)) throw new Error("Hash Sheet.content thay đổi sau transaction v6");
  await discardV5AfterVerifiedCutover(dbName, storeName, result.report);
  return { library: reloaded, report: result.report };
}
