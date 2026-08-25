import type { V5MigrationSource } from "./note-migration";

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

type AnyRecord = Record<string, any>;

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
export async function readStoredV5Library(dbName: string, storeName: string): Promise<V5MigrationSource | null> {
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
