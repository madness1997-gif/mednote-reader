import type { SheetContentMap } from "./note-domain";
import {
  cloneMigrationValue,
  defaultMigrationActive,
  finishMigratedLibrary,
  migrationReport,
  normalizedMigrationOrder,
  normalizeMigrationSiblingOrders,
  stripMigrationNavigation,
  type AnyRecord,
  type MigrationResult,
} from "./note-migration-core";
import type { LegacyRelationV2 } from "./relation-v2-migration";

const V5_KEYS = {
  meta: "library:v5:meta",
  workspace: "library:v5:workspace",
  notebook: "library:v5:notebook:",
  section: "library:v5:section:",
  page: "library:v5:page:",
  sheet: "library:v5:sheet:",
  link: "library:v5:note-document-link:",
  context: "library:v5:document-context:",
} as const;

export type V5MigrationSource = {
  meta: AnyRecord;
  workspace: AnyRecord;
  notebooks: AnyRecord[];
  sections: AnyRecord[];
  pages: AnyRecord[];
  sheets: AnyRecord[];
  links: AnyRecord[];
  contexts: AnyRecord[];
};

export function migrateV5ToV6(source: V5MigrationSource, relation?: LegacyRelationV2): MigrationResult {
  const warnings: string[] = [];
  const notesBase = {
    workspace: { id: String(source.workspace?.id || "workspace"), title: String(source.workspace?.title || "MedNote") },
    notebooks: cloneMigrationValue(source.notebooks).map((record, index) => ({ id: String(record.id), title: String(record.title || "Sổ ghi chú"), order: normalizedMigrationOrder(record.order, index) })),
    sections: cloneMigrationValue(source.sections).map((record, index) => ({ id: String(record.id), notebookId: String(record.notebookId), title: String(record.title || "Phần 1"), order: normalizedMigrationOrder(record.order, index) })),
    pages: cloneMigrationValue(source.pages).map((record, index) => ({ id: String(record.id), sectionId: String(record.sectionId), title: String(record.title || "Page mới"), order: normalizedMigrationOrder(record.order, index) })),
    sheets: cloneMigrationValue(source.sheets).map((record, index) => ({ id: String(record.id), pageId: String(record.pageId), order: normalizedMigrationOrder(record.order, index) })),
  };
  const sheetContents = Object.fromEntries(source.sheets.map((record) => [String(record.id), stripMigrationNavigation(record.content || {})])) as SheetContentMap;
  normalizeMigrationSiblingOrders(notesBase.notebooks, () => "workspace");
  normalizeMigrationSiblingOrders(notesBase.sections, (record) => record.notebookId);
  normalizeMigrationSiblingOrders(notesBase.pages, (record) => record.sectionId);
  normalizeMigrationSiblingOrders(notesBase.sheets, (record) => record.pageId);
  const active = defaultMigrationActive(notesBase, {
    activeNotebookId: String(source.meta.activeNotebookId || ""),
    activeSectionId: String(source.meta.activeSectionId || ""),
    activePageId: String(source.meta.activePageId || ""),
    activeSheetId: String(source.meta.activeSheetId || ""),
  });
  const library = finishMigratedLibrary(
    { ...notesBase, active },
    sheetContents,
    source.contexts,
    relation,
    source.links,
    {
      activeDocumentContextId: String(source.meta.activeDocumentContextId || source.contexts[0]?.id || ""),
      readerShare: Number(source.meta.readerShare) || 50,
      workspaceMode: source.meta.workspaceMode,
      noteZoom: Number(source.meta.noteZoom) || 1,
    },
    Number(source.meta.savedAt) || Date.now(),
    warnings,
  );
  return { library, report: migrationReport(5, library, warnings) };
}

const requestValue = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function openDb(dbName: string, storeName: string) {
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
 * One-shot compatibility reader for devices that have never completed the v6
 * cutover. It owns no cache or write path and is loaded dynamically only when
 * the canonical v6 repository is absent.
 */
async function readStoredV5Library(dbName: string, storeName: string): Promise<V5MigrationSource | null> {
  const db = await openDb(dbName, storeName);
  try {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const meta = await requestValue(store.get(V5_KEYS.meta)) as AnyRecord | undefined;
    if (!meta?.contextIds?.length) return null;
    const read = (prefix: string, ids: unknown[]) => Promise.all(ids.map((id) => requestValue(store.get(`${prefix}${String(id)}`))));
    const [workspace, notebooks, sections, pages, sheets, links, contexts] = await Promise.all([
      requestValue(store.get(V5_KEYS.workspace)),
      read(V5_KEYS.notebook, meta.notebookIds || []),
      read(V5_KEYS.section, meta.sectionIds || []),
      read(V5_KEYS.page, meta.pageIds || []),
      read(V5_KEYS.sheet, meta.sheetIds || []),
      read(V5_KEYS.link, meta.linkIds || []),
      read(V5_KEYS.context, meta.contextIds || []),
    ]);
    if ([workspace, ...notebooks, ...sections, ...pages, ...sheets, ...links, ...contexts].some((record) => record === undefined)) {
      throw new Error("Kho v5 thiếu record; không được cutover v6");
    }
    return {
      meta,
      workspace: workspace as AnyRecord,
      notebooks: notebooks as AnyRecord[],
      sections: sections as AnyRecord[],
      pages: pages as AnyRecord[],
      sheets: sheets as AnyRecord[],
      links: links as AnyRecord[],
      contexts: contexts as AnyRecord[],
    };
  } finally {
    db.close();
  }
}

export async function importStoredV5Library(dbName: string, storeName: string, relation?: LegacyRelationV2): Promise<MigrationResult | null> {
  const source = await readStoredV5Library(dbName, storeName);
  return source ? migrateV5ToV6(source, relation) : null;
}
