const DB_NAME = "mednote-local";
const DB_VERSION = 1;
const DB_STORE = "documents";
const META_KEY = "library:v3:meta";
const WORKSPACE_PREFIX = "library:v3:workspace:";
const NOTEBOOK_PREFIX = "library:v3:notebook:";
const PAGE_PREFIX = "library:v3:page:";

type PageLike = { id: string };
type NotebookLike<P extends PageLike> = { id: string; title: string; activePageId: string; createdAt: number; pages: P[] };
type WorkspaceLike<N> = { id: string; kind: string; name: string; documents: unknown[]; activeDocumentId: string | null; notebooks: N[]; activeNotebookId: string; sourcePage: number };
type SnapshotLike<W> = { workspaces: W[]; activeWorkspaceId: string; readerShare: number; workspaceMode?: string; noteZoom?: number; savedAt?: number };
type MetaRecord = { version: 3; workspaceIds: string[]; activeWorkspaceId: string; readerShare: number; workspaceMode?: string; noteZoom?: number; savedAt: number };
type WorkspaceRecord = { id: string; kind: string; name: string; documents: unknown[]; activeDocumentId: string | null; activeNotebookId: string; sourcePage: number; notebookIds: string[] };
type NotebookRecord = { id: string; title: string; activePageId: string; createdAt: number; pageIds: string[] };
type WorkspaceCache = { documents: unknown[]; kind: string; name: string; activeDocumentId: string | null; activeNotebookId: string; sourcePage: number; notebookIds: string[] };
type NotebookCache = { title: string; activePageId: string; createdAt: number; pageIds: string[] };

const workspaceCache = new Map<string, WorkspaceCache>();
const notebookCache = new Map<string, NotebookCache>();
const pageCache = new Map<string, object>();
let knownWorkspaceIds = new Set<string>();
let knownNotebookIds = new Set<string>();
let knownPageIds = new Set<string>();
let saveQueue: Promise<unknown> = Promise.resolve();

function resetCaches() {
  workspaceCache.clear();
  notebookCache.clear();
  pageCache.clear();
  knownWorkspaceIds = new Set();
  knownNotebookIds = new Set();
  knownPageIds = new Set();
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idOrderEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function readOne<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function readMany<T>(keys: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  if (!keys.length) return result;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      keys.forEach((key) => {
        const request = store.get(key);
        request.onsuccess = () => { if (request.result !== undefined) result.set(key, request.result as T); };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  return result;
}

export async function loadIncrementalLibrary() {
  const meta = await readOne<MetaRecord>(META_KEY);
  if (!meta || meta.version !== 3 || !meta.workspaceIds.length) return null;

  const workspaceKeys = meta.workspaceIds.map((id) => `${WORKSPACE_PREFIX}${id}`);
  const workspaceRecords = await readMany<WorkspaceRecord>(workspaceKeys);
  if (workspaceRecords.size !== workspaceKeys.length) return null;
  const orderedWorkspaces = meta.workspaceIds.map((id) => workspaceRecords.get(`${WORKSPACE_PREFIX}${id}`)!);

  const notebookIds = Array.from(new Set(orderedWorkspaces.flatMap((workspace) => workspace.notebookIds)));
  const notebookKeys = notebookIds.map((id) => `${NOTEBOOK_PREFIX}${id}`);
  const notebookRecords = await readMany<NotebookRecord>(notebookKeys);
  if (notebookRecords.size !== notebookKeys.length) return null;

  const pageIds = Array.from(new Set(notebookIds.flatMap((id) => notebookRecords.get(`${NOTEBOOK_PREFIX}${id}`)?.pageIds ?? [])));
  const pageKeys = pageIds.map((id) => `${PAGE_PREFIX}${id}`);
  const pageRecords = await readMany<unknown>(pageKeys);
  if (pageRecords.size !== pageKeys.length) return null;

  const workspaces = orderedWorkspaces.map((workspace) => ({
    id: workspace.id,
    kind: workspace.kind,
    name: workspace.name,
    documents: workspace.documents,
    activeDocumentId: workspace.activeDocumentId,
    activeNotebookId: workspace.activeNotebookId,
    sourcePage: workspace.sourcePage,
    notebooks: workspace.notebookIds.map((notebookId) => {
      const notebook = notebookRecords.get(`${NOTEBOOK_PREFIX}${notebookId}`)!;
      return {
        id: notebook.id,
        title: notebook.title,
        activePageId: notebook.activePageId,
        createdAt: notebook.createdAt,
        pages: notebook.pageIds.map((pageId) => pageRecords.get(`${PAGE_PREFIX}${pageId}`)!),
      };
    }),
  }));

  return { workspaces, activeWorkspaceId: meta.activeWorkspaceId, readerShare: meta.readerShare, workspaceMode: meta.workspaceMode, noteZoom: meta.noteZoom, savedAt: meta.savedAt };
}

export function primeIncrementalLibraryCache<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  resetCaches();
  snapshot.workspaces.forEach((workspace) => {
    const notebookIds = workspace.notebooks.map((notebook) => notebook.id);
    knownWorkspaceIds.add(workspace.id);
    workspaceCache.set(workspace.id, { documents: workspace.documents, kind: workspace.kind, name: workspace.name, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds });
    workspace.notebooks.forEach((notebook) => {
      const pageIds = notebook.pages.map((page) => page.id);
      knownNotebookIds.add(notebook.id);
      notebookCache.set(notebook.id, { title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds });
      notebook.pages.forEach((page) => { knownPageIds.add(page.id); pageCache.set(page.id, page); });
    });
  });
}

async function performSave<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  const savedAt = snapshot.savedAt ?? Date.now();
  const workspaceIds = snapshot.workspaces.map((workspace) => workspace.id);
  const nextWorkspaceIds = new Set(workspaceIds);
  const nextNotebookIds = new Set<string>();
  const nextPageIds = new Set<string>();
  const nextWorkspaceCache = new Map(workspaceCache);
  const nextNotebookCache = new Map(notebookCache);
  const nextPageCache = new Map(pageCache);
  const puts: Array<[string, unknown]> = [[META_KEY, { version: 3, workspaceIds, activeWorkspaceId: snapshot.activeWorkspaceId, readerShare: snapshot.readerShare, workspaceMode: snapshot.workspaceMode, noteZoom: snapshot.noteZoom, savedAt } satisfies MetaRecord]];
  const deletes: string[] = [];

  snapshot.workspaces.forEach((workspace) => {
    const notebookIds = workspace.notebooks.map((notebook) => notebook.id);
    const cachedWorkspace = workspaceCache.get(workspace.id);
    const workspaceChanged = !cachedWorkspace || cachedWorkspace.documents !== workspace.documents || cachedWorkspace.kind !== workspace.kind || cachedWorkspace.name !== workspace.name || cachedWorkspace.activeDocumentId !== workspace.activeDocumentId || cachedWorkspace.activeNotebookId !== workspace.activeNotebookId || cachedWorkspace.sourcePage !== workspace.sourcePage || !idOrderEqual(cachedWorkspace.notebookIds, notebookIds);
    if (workspaceChanged) puts.push([`${WORKSPACE_PREFIX}${workspace.id}`, { id: workspace.id, kind: workspace.kind, name: workspace.name, documents: workspace.documents, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds } satisfies WorkspaceRecord]);
    nextWorkspaceCache.set(workspace.id, { documents: workspace.documents, kind: workspace.kind, name: workspace.name, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds });

    workspace.notebooks.forEach((notebook) => {
      nextNotebookIds.add(notebook.id);
      const pageIds = notebook.pages.map((page) => page.id);
      const cachedNotebook = notebookCache.get(notebook.id);
      const notebookChanged = !cachedNotebook || cachedNotebook.title !== notebook.title || cachedNotebook.activePageId !== notebook.activePageId || cachedNotebook.createdAt !== notebook.createdAt || !idOrderEqual(cachedNotebook.pageIds, pageIds);
      if (notebookChanged) puts.push([`${NOTEBOOK_PREFIX}${notebook.id}`, { id: notebook.id, title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds } satisfies NotebookRecord]);
      nextNotebookCache.set(notebook.id, { title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds });

      notebook.pages.forEach((page) => {
        nextPageIds.add(page.id);
        if (pageCache.get(page.id) !== page) puts.push([`${PAGE_PREFIX}${page.id}`, page]);
        nextPageCache.set(page.id, page);
      });
    });
  });

  knownWorkspaceIds.forEach((id) => { if (!nextWorkspaceIds.has(id)) deletes.push(`${WORKSPACE_PREFIX}${id}`); });
  knownNotebookIds.forEach((id) => { if (!nextNotebookIds.has(id)) deletes.push(`${NOTEBOOK_PREFIX}${id}`); });
  knownPageIds.forEach((id) => { if (!nextPageIds.has(id)) deletes.push(`${PAGE_PREFIX}${id}`); });

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      const store = transaction.objectStore(DB_STORE);
      puts.forEach(([key, value]) => store.put(value, key));
      deletes.forEach((key) => store.delete(key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    resetCaches();
    throw error;
  } finally {
    db.close();
  }

  workspaceCache.clear();
  notebookCache.clear();
  pageCache.clear();
  nextWorkspaceCache.forEach((value, id) => { if (nextWorkspaceIds.has(id)) workspaceCache.set(id, value); });
  nextNotebookCache.forEach((value, id) => { if (nextNotebookIds.has(id)) notebookCache.set(id, value); });
  nextPageCache.forEach((value, id) => { if (nextPageIds.has(id)) pageCache.set(id, value); });
  knownWorkspaceIds = nextWorkspaceIds;
  knownNotebookIds = nextNotebookIds;
  knownPageIds = nextPageIds;
  return savedAt;
}

export function saveIncrementalLibrary<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  const run = saveQueue.then(() => performSave(snapshot));
  saveQueue = run.catch(() => undefined);
  return run;
}
