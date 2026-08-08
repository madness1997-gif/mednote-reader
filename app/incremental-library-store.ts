const DB_NAME = "mednote-local";
const DB_VERSION = 1;
const DB_STORE = "documents";
const META_KEY = "library:v3:meta";
const WORKSPACE_PREFIX = "library:v3:workspace:";
const NOTEBOOK_PREFIX = "library:v3:notebook:";
const PAGE_PREFIX = "library:v3:page:";

export const LAZY_PAGE_FLAG = "__mednoteLazyPage" as const;

type PageLike = { id: string; __mednoteLazyPage?: boolean; [key: string]: unknown };
type NotebookLike<P extends PageLike> = { id: string; title: string; activePageId: string; createdAt: number; pages: P[] };
type WorkspaceLike<N> = { id: string; kind: string; name: string; documents: unknown[]; activeDocumentId: string | null; notebooks: N[]; activeNotebookId: string; sourcePage: number };
type SnapshotLike<W> = { workspaces: W[]; activeWorkspaceId: string; readerShare: number; workspaceMode?: string; noteZoom?: number; savedAt?: number };
type PageSummary = { id: string; [key: string]: unknown };
type MetaRecord = { version: 3 | 4; workspaceIds: string[]; activeWorkspaceId: string; readerShare: number; workspaceMode?: string; noteZoom?: number; savedAt: number };
type WorkspaceRecord = { id: string; kind: string; name: string; documents: unknown[]; activeDocumentId: string | null; activeNotebookId: string; sourcePage: number; notebookIds: string[] };
type NotebookRecordV3 = { id: string; title: string; activePageId: string; createdAt: number; pageIds: string[] };
type NotebookRecordV4 = NotebookRecordV3 & { pages: PageSummary[] };
type WorkspaceCache = { documents: unknown[]; kind: string; name: string; activeDocumentId: string | null; activeNotebookId: string; sourcePage: number; notebookIds: string[] };
type NotebookCache = { title: string; activePageId: string; createdAt: number; pageIds: string[]; pageSummarySignature: string };

const HEAVY_PAGE_FIELDS = new Set(["body", "bodyHtml", "strokes", "excerpts"]);
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

function isLazyPage(page: PageLike) {
  return page.__mednoteLazyPage === true;
}

function summarizePage(page: PageLike): PageSummary {
  const summary: Record<string, unknown> = {};
  Object.entries(page).forEach(([key, value]) => {
    if (key === LAZY_PAGE_FLAG || HEAVY_PAGE_FIELDS.has(key)) return;
    summary[key] = value;
  });
  summary.id = page.id;
  return summary as PageSummary;
}

function summarySignature(summaries: PageSummary[]) {
  return JSON.stringify(summaries);
}

function lazyPageFromSummary<P extends PageLike>(summary: PageSummary): P {
  return {
    ...summary,
    body: "",
    bodyHtml: "",
    strokes: [],
    excerpts: [],
    [LAZY_PAGE_FLAG]: true,
  } as unknown as P;
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

async function writeRecords(puts: Array<[string, unknown]>, deletes: string[] = []) {
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
  } finally {
    db.close();
  }
}

async function readWorkspaceAndNotebookRecords(meta: MetaRecord) {
  const workspaceKeys = meta.workspaceIds.map((id) => `${WORKSPACE_PREFIX}${id}`);
  const workspaceRecords = await readMany<WorkspaceRecord>(workspaceKeys);
  if (workspaceRecords.size !== workspaceKeys.length) return null;
  const orderedWorkspaces = meta.workspaceIds.map((id) => workspaceRecords.get(`${WORKSPACE_PREFIX}${id}`)!);

  const notebookIds = Array.from(new Set(orderedWorkspaces.flatMap((workspace) => workspace.notebookIds)));
  const notebookKeys = notebookIds.map((id) => `${NOTEBOOK_PREFIX}${id}`);
  const notebookRecords = await readMany<NotebookRecordV3 | NotebookRecordV4>(notebookKeys);
  if (notebookRecords.size !== notebookKeys.length) return null;
  return { orderedWorkspaces, notebookIds, notebookRecords };
}

async function loadV4Library(meta: MetaRecord) {
  const base = await readWorkspaceAndNotebookRecords(meta);
  if (!base) return null;
  const { orderedWorkspaces, notebookRecords } = base;
  const activeWorkspace = orderedWorkspaces.find((workspace) => workspace.id === meta.activeWorkspaceId) ?? orderedWorkspaces[0];
  const activeNotebookId = activeWorkspace?.activeNotebookId;
  const activeNotebook = activeNotebookId ? notebookRecords.get(`${NOTEBOOK_PREFIX}${activeNotebookId}`) as NotebookRecordV4 | undefined : undefined;
  const activePageId = activeNotebook?.activePageId;
  const activePage = activePageId ? await readOne<PageLike>(`${PAGE_PREFIX}${activePageId}`) : undefined;

  const workspaces = orderedWorkspaces.map((workspace) => ({
    id: workspace.id,
    kind: workspace.kind,
    name: workspace.name,
    documents: workspace.documents,
    activeDocumentId: workspace.activeDocumentId,
    activeNotebookId: workspace.activeNotebookId,
    sourcePage: workspace.sourcePage,
    notebooks: workspace.notebookIds.map((notebookId) => {
      const notebook = notebookRecords.get(`${NOTEBOOK_PREFIX}${notebookId}`) as NotebookRecordV4;
      const summaries = Array.isArray(notebook.pages) && notebook.pages.length
        ? notebook.pages
        : notebook.pageIds.map((id) => ({ id }));
      return {
        id: notebook.id,
        title: notebook.title,
        activePageId: notebook.activePageId,
        createdAt: notebook.createdAt,
        pages: summaries.map((summary) => {
          if (workspace.id === activeWorkspace?.id && notebook.id === activeNotebookId && summary.id === activePageId && activePage) {
            return { ...activePage, ...summary, id: summary.id };
          }
          return lazyPageFromSummary(summary);
        }),
      };
    }),
  }));

  return { workspaces, activeWorkspaceId: meta.activeWorkspaceId, readerShare: meta.readerShare, workspaceMode: meta.workspaceMode, noteZoom: meta.noteZoom, savedAt: meta.savedAt };
}

async function loadV3Library(meta: MetaRecord) {
  const base = await readWorkspaceAndNotebookRecords(meta);
  if (!base) return null;
  const { orderedWorkspaces, notebookIds, notebookRecords } = base;
  const pageIds = Array.from(new Set(notebookIds.flatMap((id) => (notebookRecords.get(`${NOTEBOOK_PREFIX}${id}`) as NotebookRecordV3 | undefined)?.pageIds ?? [])));
  const pageKeys = pageIds.map((id) => `${PAGE_PREFIX}${id}`);
  const pageRecords = await readMany<PageLike>(pageKeys);
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
      const notebook = notebookRecords.get(`${NOTEBOOK_PREFIX}${notebookId}`) as NotebookRecordV3;
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

async function upgradeV3Snapshot(snapshot: SnapshotLike<WorkspaceLike<NotebookLike<PageLike>>>) {
  const workspaceIds = snapshot.workspaces.map((workspace) => workspace.id);
  const puts: Array<[string, unknown]> = [[META_KEY, {
    version: 4,
    workspaceIds,
    activeWorkspaceId: snapshot.activeWorkspaceId,
    readerShare: snapshot.readerShare,
    workspaceMode: snapshot.workspaceMode,
    noteZoom: snapshot.noteZoom,
    savedAt: snapshot.savedAt ?? Date.now(),
  } satisfies MetaRecord]];

  snapshot.workspaces.forEach((workspace) => {
    const notebookIds = workspace.notebooks.map((notebook) => notebook.id);
    puts.push([`${WORKSPACE_PREFIX}${workspace.id}`, {
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      documents: workspace.documents,
      activeDocumentId: workspace.activeDocumentId,
      activeNotebookId: workspace.activeNotebookId,
      sourcePage: workspace.sourcePage,
      notebookIds,
    } satisfies WorkspaceRecord]);
    workspace.notebooks.forEach((notebook) => {
      const pages = notebook.pages.map(summarizePage);
      puts.push([`${NOTEBOOK_PREFIX}${notebook.id}`, {
        id: notebook.id,
        title: notebook.title,
        activePageId: notebook.activePageId,
        createdAt: notebook.createdAt,
        pageIds: pages.map((page) => page.id),
        pages,
      } satisfies NotebookRecordV4]);
      notebook.pages.forEach((page) => puts.push([`${PAGE_PREFIX}${page.id}`, page]));
    });
  });
  await writeRecords(puts);
}

export async function loadIncrementalLibrary() {
  const meta = await readOne<MetaRecord>(META_KEY);
  if (!meta || !meta.workspaceIds.length) return null;
  if (meta.version === 4) return loadV4Library(meta);
  if (meta.version !== 3) return null;

  // One-time migration: v3 had no per-page metadata, so it must read each page
  // once to build the lightweight summaries used by future lazy startups.
  const legacy = await loadV3Library(meta) as SnapshotLike<WorkspaceLike<NotebookLike<PageLike>>> | null;
  if (!legacy) return null;
  await upgradeV3Snapshot(legacy);
  return loadV4Library({ ...meta, version: 4 });
}

export async function loadIncrementalPage<P extends PageLike>(pageId: string, summary?: P): Promise<P | null> {
  const stored = await readOne<PageLike>(`${PAGE_PREFIX}${pageId}`);
  if (!stored) return null;
  const navigation = summary ? summarizePage(summary) : { id: pageId };
  const hydrated = { ...stored, ...navigation, id: pageId } as PageLike;
  delete hydrated.__mednoteLazyPage;
  return hydrated as P;
}

export async function materializeIncrementalPages<P extends PageLike>(pages: P[]): Promise<P[]> {
  return Promise.all(pages.map(async (page) => {
    if (!isLazyPage(page)) return page;
    const hydrated = await loadIncrementalPage(page.id, page);
    if (!hydrated) throw new Error(`Không thể đọc nội dung trang note ${page.id} từ bộ nhớ cục bộ`);
    return hydrated;
  }));
}

export async function materializeIncrementalLibrary<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>): Promise<SnapshotLike<W>> {
  const workspaces = await Promise.all(snapshot.workspaces.map(async (workspace) => ({
    ...workspace,
    notebooks: await Promise.all(workspace.notebooks.map(async (notebook) => ({
      ...notebook,
      pages: await materializeIncrementalPages(notebook.pages),
    } as N))),
  } as W)));
  return { ...snapshot, workspaces };
}

export function primeIncrementalLibraryCache<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  resetCaches();
  snapshot.workspaces.forEach((workspace) => {
    const notebookIds = workspace.notebooks.map((notebook) => notebook.id);
    knownWorkspaceIds.add(workspace.id);
    workspaceCache.set(workspace.id, { documents: workspace.documents, kind: workspace.kind, name: workspace.name, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds });
    workspace.notebooks.forEach((notebook) => {
      const summaries = notebook.pages.map(summarizePage);
      const pageIds = summaries.map((page) => page.id);
      knownNotebookIds.add(notebook.id);
      notebookCache.set(notebook.id, { title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds, pageSummarySignature: summarySignature(summaries) });
      notebook.pages.forEach((page) => {
        knownPageIds.add(page.id);
        if (!isLazyPage(page)) pageCache.set(page.id, page);
      });
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
  const puts: Array<[string, unknown]> = [[META_KEY, { version: 4, workspaceIds, activeWorkspaceId: snapshot.activeWorkspaceId, readerShare: snapshot.readerShare, workspaceMode: snapshot.workspaceMode, noteZoom: snapshot.noteZoom, savedAt } satisfies MetaRecord]];
  const deletes: string[] = [];

  snapshot.workspaces.forEach((workspace) => {
    const notebookIds = workspace.notebooks.map((notebook) => notebook.id);
    const cachedWorkspace = workspaceCache.get(workspace.id);
    const workspaceChanged = !cachedWorkspace || cachedWorkspace.documents !== workspace.documents || cachedWorkspace.kind !== workspace.kind || cachedWorkspace.name !== workspace.name || cachedWorkspace.activeDocumentId !== workspace.activeDocumentId || cachedWorkspace.activeNotebookId !== workspace.activeNotebookId || cachedWorkspace.sourcePage !== workspace.sourcePage || !idOrderEqual(cachedWorkspace.notebookIds, notebookIds);
    if (workspaceChanged) puts.push([`${WORKSPACE_PREFIX}${workspace.id}`, { id: workspace.id, kind: workspace.kind, name: workspace.name, documents: workspace.documents, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds } satisfies WorkspaceRecord]);
    nextWorkspaceCache.set(workspace.id, { documents: workspace.documents, kind: workspace.kind, name: workspace.name, activeDocumentId: workspace.activeDocumentId, activeNotebookId: workspace.activeNotebookId, sourcePage: workspace.sourcePage, notebookIds });

    workspace.notebooks.forEach((notebook) => {
      nextNotebookIds.add(notebook.id);
      const summaries = notebook.pages.map(summarizePage);
      const pageIds = summaries.map((page) => page.id);
      const signature = summarySignature(summaries);
      const cachedNotebook = notebookCache.get(notebook.id);
      const notebookChanged = !cachedNotebook || cachedNotebook.title !== notebook.title || cachedNotebook.activePageId !== notebook.activePageId || cachedNotebook.createdAt !== notebook.createdAt || !idOrderEqual(cachedNotebook.pageIds, pageIds) || cachedNotebook.pageSummarySignature !== signature;
      if (notebookChanged) puts.push([`${NOTEBOOK_PREFIX}${notebook.id}`, { id: notebook.id, title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds, pages: summaries } satisfies NotebookRecordV4]);
      nextNotebookCache.set(notebook.id, { title: notebook.title, activePageId: notebook.activePageId, createdAt: notebook.createdAt, pageIds, pageSummarySignature: signature });

      notebook.pages.forEach((page) => {
        nextPageIds.add(page.id);
        // A lazy shell is navigation metadata only. Never let it replace the full
        // page record that is still safely stored in IndexedDB.
        if (isLazyPage(page)) return;
        if (pageCache.get(page.id) !== page) puts.push([`${PAGE_PREFIX}${page.id}`, page]);
        nextPageCache.set(page.id, page);
      });
    });
  });

  knownWorkspaceIds.forEach((id) => { if (!nextWorkspaceIds.has(id)) deletes.push(`${WORKSPACE_PREFIX}${id}`); });
  knownNotebookIds.forEach((id) => { if (!nextNotebookIds.has(id)) deletes.push(`${NOTEBOOK_PREFIX}${id}`); });
  knownPageIds.forEach((id) => { if (!nextPageIds.has(id)) deletes.push(`${PAGE_PREFIX}${id}`); });

  try {
    await writeRecords(puts, deletes);
  } catch (error) {
    resetCaches();
    throw error;
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
