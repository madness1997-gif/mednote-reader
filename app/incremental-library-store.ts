import { stableId } from "./stable-id";

const DB_NAME = "mednote-local";
const DB_VERSION = 1;
const DB_STORE = "documents";

// v5 is the first canonical note schema. Earlier versions persisted the render
// tree (workspace -> notebooks[] -> pages[]) and later inferred Section/Page
// through copied metadata on every physical sheet. v5 persists real records.
const META_KEY = "library:v5:meta";
const WORKSPACE_KEY = "library:v5:workspace";
const NOTEBOOK_PREFIX = "library:v5:notebook:";
const SECTION_PREFIX = "library:v5:section:";
const PAGE_PREFIX = "library:v5:page:";
const SHEET_PREFIX = "library:v5:sheet:";
const LINK_PREFIX = "library:v5:note-document-link:";
const CONTEXT_PREFIX = "library:v5:document-context:";

// Read-only migration keys. They are removed only after a complete v5 commit.
const LEGACY_META_KEY = "library:v3:meta";
const LEGACY_WORKSPACE_PREFIX = "library:v3:workspace:";
const LEGACY_NOTEBOOK_PREFIX = "library:v3:notebook:";
const LEGACY_PAGE_PREFIX = "library:v3:page:";
const RELATION_KEY = "mednote-relations-v2";

export const LAZY_PAGE_FLAG = "__mednoteLazyPage" as const;

type AnyRecord = Record<string, any>;
type PageLike = { id: string; __mednoteLazyPage?: boolean; [key: string]: unknown };
type NotebookLike<P extends PageLike> = { id: string; title: string; activePageId: string; createdAt: number; pages: P[] };
type WorkspaceLike<N> = { id: string; kind: string; name: string; documents: AnyRecord[]; activeDocumentId: string | null; notebooks: N[]; activeNotebookId: string; sourcePage: number };
type SnapshotLike<W> = { workspaces: W[]; activeWorkspaceId: string; readerShare: number; workspaceMode?: string; noteZoom?: number; savedAt?: number };

export type WorkspaceRecord = { id: string; title: string };
export type NotebookRecord = { id: string; title: string; order: number };
export type SectionRecord = { id: string; notebookId: string; title: string; order: number };
export type PageRecord = { id: string; sectionId: string; title: string; order: number };
export type SheetRecord = { id: string; pageId: string; order: number; content: Record<string, unknown> };
export type NoteDocumentLinkRecord = { id: string; documentId: string; targetType: "page" | "sheet"; targetId: string };
export type ActiveNoteState = {
  activeNotebookId: string;
  activeSectionId: string;
  activePageId: string;
  activeSheetId: string;
};

type MetaRecord = ActiveNoteState & {
  version: 5;
  notebookIds: string[];
  sectionIds: string[];
  pageIds: string[];
  sheetIds: string[];
  linkIds: string[];
  contextIds: string[];
  activeDocumentContextId: string;
  readerShare: number;
  workspaceMode?: string;
  noteZoom?: number;
  savedAt: number;
};

type DocumentContextRecord = {
  id: string;
  kind: string;
  name: string;
  documents: AnyRecord[];
  activeDocumentId: string | null;
  notebookIds: string[];
  sourcePage: number;
};

type LegacyMetaRecord = {
  version: 3 | 4;
  workspaceIds: string[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: string;
  noteZoom?: number;
  savedAt: number;
};
type LegacyWorkspaceRecord = DocumentContextRecord & { activeNotebookId: string };
type LegacyNotebookRecord = { id: string; title: string; activePageId: string; createdAt: number; pageIds: string[]; pages?: PageLike[] };

type CanonicalData = {
  workspace: WorkspaceRecord;
  notebooks: NotebookRecord[];
  sections: SectionRecord[];
  pages: PageRecord[];
  sheets: SheetRecord[];
  links: NoteDocumentLinkRecord[];
  contexts: DocumentContextRecord[];
  active: ActiveNoteState;
};

const HEAVY_PAGE_FIELDS = new Set(["body", "bodyHtml", "strokes", "excerpts"]);
const NAVIGATION_ONLY_FIELDS = new Set([
  "id", "title", "titleHtml", "pageId", "order", "logicalPageId", "logicalPageTitle", "sheetTitle", "sheetOrder", LAZY_PAGE_FLAG,
]);

let canonicalCache: CanonicalData | null = null;
let persistedSignatures = new Map<string, string>();
let knownKeys = new Set<string>();
let saveQueue: Promise<unknown> = Promise.resolve();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isLazyPage = (page: PageLike) => page[LAZY_PAGE_FLAG] === true;
const normalizedOrder = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
  const values = new Map<string, T>();
  if (!keys.length) return values;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      keys.forEach((key) => {
        const request = store.get(key);
        request.onsuccess = () => { if (request.result !== undefined) values.set(key, request.result as T); };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  return values;
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

function summarizeContent(content: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  Object.entries(content).forEach(([key, value]) => {
    if (!HEAVY_PAGE_FIELDS.has(key)) summary[key] = value;
  });
  return summary;
}

function stripNavigation(page: PageLike) {
  const content: Record<string, unknown> = {};
  Object.entries(page).forEach(([key, value]) => {
    if (!NAVIGATION_ONLY_FIELDS.has(key)) content[key] = value;
  });
  return content;
}

function readRelationLibrary() {
  try {
    const raw = localStorage.getItem(RELATION_KEY);
    const parsed = raw ? JSON.parse(raw) as AnyRecord : null;
    return parsed?.version === 2 ? parsed : null;
  } catch {
    return null;
  }
}

function buildCanonicalFromSnapshot<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>): CanonicalData {
  const relationLibrary = readRelationLibrary();
  const relationNotebooks = new Map<string, AnyRecord>((relationLibrary?.notebooks || []).map((record: AnyRecord) => [String(record.id), record]));
  const notebookSources = new Map<string, N>();
  const contexts: DocumentContextRecord[] = [];

  snapshot.workspaces.forEach((workspace) => {
    const notebookIds: string[] = [];
    workspace.notebooks.forEach((notebook) => {
      if (String(notebook.id).startsWith("__mednote_reader_placeholder__:")) return;
      if (!notebookSources.has(notebook.id) || workspace.id === snapshot.activeWorkspaceId) notebookSources.set(notebook.id, notebook);
      if (!notebookIds.includes(notebook.id)) notebookIds.push(notebook.id);
    });
    contexts.push({
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      documents: clone(workspace.documents || []),
      activeDocumentId: workspace.activeDocumentId,
      notebookIds,
      sourcePage: workspace.sourcePage,
    });
  });

  const notebooks: NotebookRecord[] = [];
  const sections: SectionRecord[] = [];
  const pages: PageRecord[] = [];
  const sheets: SheetRecord[] = [];
  const sheetToPage = new Map<string, string>();

  [...notebookSources.values()].forEach((notebook, notebookOrder) => {
    notebooks.push({ id: notebook.id, title: String(notebook.title || "Sổ ghi chú"), order: notebookOrder });
    const physicalSheets = Array.isArray(notebook.pages) ? notebook.pages : [];
    const physicalIds = new Set(physicalSheets.map((sheet) => String(sheet.id)));
    const relationRecord = relationNotebooks.get(notebook.id);
    const legacySections = Array.isArray(relationRecord?.sections) && relationRecord.sections.length
      ? relationRecord.sections
      : [{ id: stableId("section", notebook.id), title: "Phần 1", pageIds: physicalSheets.map((sheet) => String(sheet.id)) }];
    const sectionForSheet = new Map<string, string>();

    legacySections.forEach((section: AnyRecord, sectionOrder: number) => {
      const id = String(section.id || stableId("section", `${notebook.id}:${sectionOrder}`));
      sections.push({ id, notebookId: notebook.id, title: String(section.title || `Phần ${sectionOrder + 1}`), order: sectionOrder });
      (section.pageIds || []).forEach((sheetId: unknown) => {
        const idValue = String(sheetId);
        if (physicalIds.has(idValue) && !sectionForSheet.has(idValue)) sectionForSheet.set(idValue, id);
      });
    });
    const fallbackSection = sections.find((section) => section.notebookId === notebook.id)!;

    const grouped = new Map<string, P[]>();
    physicalSheets.forEach((sheet) => {
      const legacyLogicalId = String((sheet as AnyRecord).pageId || (sheet as AnyRecord).logicalPageId || sheet.id);
      const group = grouped.get(legacyLogicalId) || [];
      group.push(sheet);
      grouped.set(legacyLogicalId, group);
    });

    const pageOrderBySection = new Map<string, number>();
    grouped.forEach((groupSheets, legacyLogicalId) => {
      groupSheets.sort((left, right) => normalizedOrder((left as AnyRecord).order ?? (left as AnyRecord).sheetOrder, physicalSheets.indexOf(left)) - normalizedOrder((right as AnyRecord).order ?? (right as AnyRecord).sheetOrder, physicalSheets.indexOf(right)));
      const ownerSectionId = sectionForSheet.get(String(groupSheets[0].id)) || fallbackSection.id;
      const pageOrder = pageOrderBySection.get(ownerSectionId) || 0;
      pageOrderBySection.set(ownerSectionId, pageOrder + 1);
      const preferred = groupSheets.find((sheet) => String(sheet.id) === String(notebook.activePageId)) || groupSheets[0];
      const title = String((preferred as AnyRecord).logicalPageTitle || preferred.title || "Page mới").trim() || "Page mới";
      const page: PageRecord = { id: legacyLogicalId, sectionId: ownerSectionId, title, order: pageOrder };
      pages.push(page);
      groupSheets.forEach((sheet, sheetOrder) => {
        const sheetId = String(sheet.id);
        const storedContent = canonicalCache?.sheets.find((item) => item.id === sheetId)?.content;
        // Lazy render shells contain deliberately empty body/strokes/excerpts.
        // They must update navigation metadata without erasing the full Sheet
        // content that remains in IndexedDB.
        const content = isLazyPage(sheet) && storedContent ? clone(storedContent) : stripNavigation(sheet);
        sheets.push({ id: sheetId, pageId: page.id, order: sheetOrder, content });
        sheetToPage.set(sheetId, page.id);
      });
    });
  });

  const activeContext = contexts.find((context) => context.id === snapshot.activeWorkspaceId) || contexts[0];
  const activeNotebookId = activeContext?.notebookIds.find((id) => notebookSources.has(id)) || notebooks[0]?.id || "";
  const activeNotebook = notebookSources.get(activeNotebookId);
  const activeSheetId = activeNotebook && sheets.some((sheet) => sheet.id === String(activeNotebook.activePageId))
    ? String(activeNotebook.activePageId)
    : sheets.find((sheet) => pages.some((page) => page.id === sheet.pageId && sections.some((section) => section.id === page.sectionId && section.notebookId === activeNotebookId)))?.id || "";
  const activePageId = sheetToPage.get(activeSheetId) || pages.find((page) => sections.some((section) => section.id === page.sectionId && section.notebookId === activeNotebookId))?.id || "";
  const activeSectionId = pages.find((page) => page.id === activePageId)?.sectionId || sections.find((section) => section.notebookId === activeNotebookId)?.id || "";

  const links: NoteDocumentLinkRecord[] = [];
  const groupDocuments = new Map<string, string[]>((relationLibrary?.groups || []).map((group: AnyRecord) => [String(group.id), (group.documentIds || []).map(String)]));
  const documentIds = new Set(contexts.flatMap((context) => context.documents.map((document) => String(document.id))));
  (relationLibrary?.relations || []).forEach((relation: AnyRecord) => {
    const sourceIds = relation.source?.type === "group"
      ? groupDocuments.get(String(relation.source.id)) || []
      : [String(relation.source?.id || "")];
    const target = relation.target || {};
    let targetType: "page" | "sheet" = target.scope === "sheet" || String(target.id || "").startsWith("sheet:") ? "sheet" : "page";
    let targetId = "";
    if (targetType === "sheet") targetId = String(target.pageId || target.id || "").replace(/^sheet:/, "");
    else if (target.logicalPageId) targetId = String(target.logicalPageId);
    else if (target.type === "page") targetId = sheetToPage.get(String(target.pageId || target.id)) || String(target.id || "");
    else {
      const targetNotebookId = String(target.notebookId || target.id || "");
      const targetSectionId = target.type === "section" ? String(target.sectionId || target.id || "") : "";
      targetId = pages.find((page) => (!targetSectionId || page.sectionId === targetSectionId)
        && sections.some((section) => section.id === page.sectionId && section.notebookId === targetNotebookId))?.id || "";
      targetType = "page";
    }
    if (!targetId || (targetType === "page" ? !pages.some((page) => page.id === targetId) : !sheets.some((sheet) => sheet.id === targetId))) return;
    sourceIds.filter((documentId) => documentIds.has(documentId)).forEach((documentId) => {
      const id = stableId("note-document-link", `${documentId}:${targetType}:${targetId}`);
      if (!links.some((link) => link.id === id)) links.push({ id, documentId, targetType, targetId });
    });
  });

  return {
    workspace: { id: "workspace", title: "MedNote" },
    notebooks,
    sections,
    pages,
    sheets,
    links,
    contexts,
    active: { activeNotebookId, activeSectionId, activePageId, activeSheetId },
  };
}

function buildMeta(snapshot: SnapshotLike<any>, data: CanonicalData): MetaRecord {
  return {
    version: 5,
    notebookIds: data.notebooks.sort((a, b) => a.order - b.order).map((item) => item.id),
    sectionIds: data.sections.sort((a, b) => a.order - b.order).map((item) => item.id),
    pageIds: data.pages.sort((a, b) => a.order - b.order).map((item) => item.id),
    sheetIds: data.sheets.sort((a, b) => a.order - b.order).map((item) => item.id),
    linkIds: data.links.map((item) => item.id),
    contextIds: data.contexts.map((item) => item.id),
    activeDocumentContextId: snapshot.activeWorkspaceId,
    ...data.active,
    readerShare: snapshot.readerShare,
    workspaceMode: snapshot.workspaceMode,
    noteZoom: snapshot.noteZoom,
    savedAt: snapshot.savedAt ?? Date.now(),
  };
}

function recordEntries(meta: MetaRecord, data: CanonicalData): Array<[string, unknown]> {
  return [
    [META_KEY, meta],
    [WORKSPACE_KEY, data.workspace],
    ...data.notebooks.map((item) => [`${NOTEBOOK_PREFIX}${item.id}`, item] as [string, unknown]),
    ...data.sections.map((item) => [`${SECTION_PREFIX}${item.id}`, item] as [string, unknown]),
    ...data.pages.map((item) => [`${PAGE_PREFIX}${item.id}`, item] as [string, unknown]),
    ...data.sheets.map((item) => [`${SHEET_PREFIX}${item.id}`, item] as [string, unknown]),
    ...data.links.map((item) => [`${LINK_PREFIX}${item.id}`, item] as [string, unknown]),
    ...data.contexts.map((item) => [`${CONTEXT_PREFIX}${item.id}`, item] as [string, unknown]),
  ];
}

function runtimePage(sheet: SheetRecord, page: PageRecord, lazy: boolean): PageLike {
  const content = lazy
    ? { ...summarizeContent(sheet.content), body: "", bodyHtml: "", strokes: [], excerpts: [], [LAZY_PAGE_FLAG]: true }
    : clone(sheet.content);
  // These fields belong only to the compatibility view consumed by the current
  // editor. They are never written into Sheet.content.
  return {
    ...content,
    id: sheet.id,
    title: page.title,
    titleHtml: page.title,
    pageId: page.id,
    order: sheet.order,
  };
}

function notebookRuntimePages(data: CanonicalData, notebookId: string, activeSheetId: string) {
  const sectionIds = data.sections.filter((section) => section.notebookId === notebookId).sort((a, b) => a.order - b.order).map((section) => section.id);
  const pageIds = data.pages.filter((page) => sectionIds.includes(page.sectionId)).sort((left, right) => {
    const sectionCompare = sectionIds.indexOf(left.sectionId) - sectionIds.indexOf(right.sectionId);
    return sectionCompare || left.order - right.order;
  }).map((page) => page.id);
  return data.sheets.filter((sheet) => pageIds.includes(sheet.pageId)).sort((left, right) => {
    const pageCompare = pageIds.indexOf(left.pageId) - pageIds.indexOf(right.pageId);
    return pageCompare || left.order - right.order;
  }).map((sheet) => runtimePage(sheet, data.pages.find((page) => page.id === sheet.pageId)!, sheet.id !== activeSheetId));
}

function toRuntimeSnapshot(meta: MetaRecord, data: CanonicalData) {
  const notebookById = new Map(data.notebooks.map((notebook) => [notebook.id, notebook]));
  const contexts = data.contexts.map((context) => {
    const notebookIds = context.notebookIds.filter((id) => notebookById.has(id));
    const fallbackNotebookId = meta.activeNotebookId && notebookById.has(meta.activeNotebookId) ? meta.activeNotebookId : data.notebooks[0]?.id;
    const visibleIds = notebookIds.length ? notebookIds : fallbackNotebookId && !context.documents.length ? [fallbackNotebookId] : [];
    const notebooks = visibleIds.map((notebookId) => {
      const record = notebookById.get(notebookId)!;
      const pages = notebookRuntimePages(data, notebookId, notebookId === meta.activeNotebookId ? meta.activeSheetId : "");
      return {
        id: record.id,
        title: record.title,
        activePageId: notebookId === meta.activeNotebookId && pages.some((page) => page.id === meta.activeSheetId) ? meta.activeSheetId : pages[0]?.id || "",
        createdAt: 0,
        pages,
      };
    });
    return {
      id: context.id,
      kind: context.kind,
      name: context.name,
      documents: clone(context.documents),
      activeDocumentId: context.activeDocumentId,
      notebooks,
      activeNotebookId: notebooks.some((notebook) => notebook.id === meta.activeNotebookId) ? meta.activeNotebookId : notebooks[0]?.id || "",
      sourcePage: context.sourcePage,
    };
  });
  return {
    workspaces: contexts,
    activeWorkspaceId: contexts.some((context) => context.id === meta.activeDocumentContextId) ? meta.activeDocumentContextId : contexts[0]?.id || "",
    readerShare: meta.readerShare,
    workspaceMode: meta.workspaceMode,
    noteZoom: meta.noteZoom,
    savedAt: meta.savedAt,
  };
}

async function loadCanonicalV5(meta: MetaRecord) {
  const [workspace, notebooks, sections, pages, sheets, links, contexts] = await Promise.all([
    readOne<WorkspaceRecord>(WORKSPACE_KEY),
    readMany<NotebookRecord>(meta.notebookIds.map((id) => `${NOTEBOOK_PREFIX}${id}`)),
    readMany<SectionRecord>(meta.sectionIds.map((id) => `${SECTION_PREFIX}${id}`)),
    readMany<PageRecord>(meta.pageIds.map((id) => `${PAGE_PREFIX}${id}`)),
    readMany<SheetRecord>(meta.sheetIds.map((id) => `${SHEET_PREFIX}${id}`)),
    readMany<NoteDocumentLinkRecord>(meta.linkIds.map((id) => `${LINK_PREFIX}${id}`)),
    readMany<DocumentContextRecord>(meta.contextIds.map((id) => `${CONTEXT_PREFIX}${id}`)),
  ]);
  if (!workspace
    || notebooks.size !== meta.notebookIds.length
    || sections.size !== meta.sectionIds.length
    || pages.size !== meta.pageIds.length
    || sheets.size !== meta.sheetIds.length
    || links.size !== meta.linkIds.length
    || contexts.size !== meta.contextIds.length) return null;
  const data: CanonicalData = {
    workspace,
    notebooks: meta.notebookIds.map((id) => notebooks.get(`${NOTEBOOK_PREFIX}${id}`)!),
    sections: meta.sectionIds.map((id) => sections.get(`${SECTION_PREFIX}${id}`)!),
    pages: meta.pageIds.map((id) => pages.get(`${PAGE_PREFIX}${id}`)!),
    sheets: meta.sheetIds.map((id) => sheets.get(`${SHEET_PREFIX}${id}`)!),
    links: meta.linkIds.map((id) => links.get(`${LINK_PREFIX}${id}`)!),
    contexts: meta.contextIds.map((id) => contexts.get(`${CONTEXT_PREFIX}${id}`)!),
    active: {
      activeNotebookId: meta.activeNotebookId,
      activeSectionId: meta.activeSectionId,
      activePageId: meta.activePageId,
      activeSheetId: meta.activeSheetId,
    },
  };
  canonicalCache = data;
  const entries = recordEntries(meta, data);
  persistedSignatures = new Map(entries.map(([key, value]) => [key, JSON.stringify(value)]));
  knownKeys = new Set(entries.map(([key]) => key));
  return toRuntimeSnapshot(meta, data);
}

async function loadLegacySnapshot(meta: LegacyMetaRecord) {
  const workspaceKeys = meta.workspaceIds.map((id) => `${LEGACY_WORKSPACE_PREFIX}${id}`);
  const workspaces = await readMany<LegacyWorkspaceRecord>(workspaceKeys);
  if (workspaces.size !== workspaceKeys.length) return null;
  const ordered = meta.workspaceIds.map((id) => workspaces.get(`${LEGACY_WORKSPACE_PREFIX}${id}`)!);
  const notebookIds = Array.from(new Set(ordered.flatMap((workspace) => workspace.notebookIds)));
  const notebooks = await readMany<LegacyNotebookRecord>(notebookIds.map((id) => `${LEGACY_NOTEBOOK_PREFIX}${id}`));
  if (notebooks.size !== notebookIds.length) return null;
  const pageIds = Array.from(new Set(notebookIds.flatMap((id) => notebooks.get(`${LEGACY_NOTEBOOK_PREFIX}${id}`)?.pageIds || [])));
  const pageRecords = await readMany<PageLike>(pageIds.map((id) => `${LEGACY_PAGE_PREFIX}${id}`));
  if (pageRecords.size !== pageIds.length) return null;
  return {
    workspaces: ordered.map((workspace) => ({
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      documents: workspace.documents,
      activeDocumentId: workspace.activeDocumentId,
      activeNotebookId: workspace.activeNotebookId,
      sourcePage: workspace.sourcePage,
      notebooks: workspace.notebookIds.map((notebookId) => {
        const notebook = notebooks.get(`${LEGACY_NOTEBOOK_PREFIX}${notebookId}`)!;
        return {
          id: notebook.id,
          title: notebook.title,
          activePageId: notebook.activePageId,
          createdAt: notebook.createdAt,
          pages: notebook.pageIds.map((pageId) => pageRecords.get(`${LEGACY_PAGE_PREFIX}${pageId}`)!),
        };
      }),
    })),
    activeWorkspaceId: meta.activeWorkspaceId,
    readerShare: meta.readerShare,
    workspaceMode: meta.workspaceMode,
    noteZoom: meta.noteZoom,
    savedAt: meta.savedAt,
  };
}

export async function loadIncrementalLibrary() {
  const meta = await readOne<MetaRecord>(META_KEY);
  if (meta?.version === 5 && meta.contextIds.length) return loadCanonicalV5(meta);

  const legacyMeta = await readOne<LegacyMetaRecord>(LEGACY_META_KEY);
  if (!legacyMeta?.workspaceIds?.length) return null;
  const legacy = await loadLegacySnapshot(legacyMeta);
  if (!legacy) return null;
  await performSave(legacy);
  return loadCanonicalV5((await readOne<MetaRecord>(META_KEY))!);
}

export async function loadIncrementalPage<P extends PageLike>(sheetId: string, summary?: P): Promise<P | null> {
  const sheet = await readOne<SheetRecord>(`${SHEET_PREFIX}${sheetId}`);
  if (sheet) {
    const page = canonicalCache?.pages.find((item) => item.id === sheet.pageId) || await readOne<PageRecord>(`${PAGE_PREFIX}${sheet.pageId}`);
    if (!page) return null;
    const hydrated = runtimePage(sheet, page, false) as P;
    if (summary) Object.assign(hydrated, summarizeContent(stripNavigation(summary)), { id: sheetId, title: page.title, titleHtml: page.title });
    delete hydrated[LAZY_PAGE_FLAG];
    return hydrated;
  }

  // A v4 page may be requested during the first migration render.
  const legacy = await readOne<P>(`${LEGACY_PAGE_PREFIX}${sheetId}`);
  if (!legacy) return null;
  const hydrated = { ...legacy, ...(summary ? summarizeContent(stripNavigation(summary)) : {}), id: sheetId } as P;
  delete hydrated[LAZY_PAGE_FLAG];
  return hydrated;
}

export async function materializeIncrementalPages<P extends PageLike>(pages: P[]): Promise<P[]> {
  return Promise.all(pages.map(async (page) => {
    if (!isLazyPage(page)) return page;
    const hydrated = await loadIncrementalPage(page.id, page);
    if (!hydrated) throw new Error(`Không thể đọc nội dung Sheet ${page.id} từ bộ nhớ cục bộ`);
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
  // The canonical cache is loaded from v5 records. A legacy/localStorage
  // snapshot is intentionally not promoted to source of truth here.
  if (!canonicalCache && snapshot.workspaces.length) canonicalCache = buildCanonicalFromSnapshot(snapshot);
}

async function performSave<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  const data = buildCanonicalFromSnapshot(snapshot);
  const meta = buildMeta(snapshot, data);
  const entries = recordEntries(meta, data);
  const nextKeys = new Set(entries.map(([key]) => key));
  const puts = entries.filter(([key, value]) => persistedSignatures.get(key) !== JSON.stringify(value));
  const deletes = [...knownKeys].filter((key) => !nextKeys.has(key));
  await writeRecords(puts, deletes);

  canonicalCache = data;
  persistedSignatures = new Map(entries.map(([key, value]) => [key, JSON.stringify(value)]));
  knownKeys = nextKeys;

  // Keep only one authoritative note schema after the transaction has safely
  // committed. PDF blobs/assets share the same object store and are untouched.
  const legacyMeta = await readOne<LegacyMetaRecord>(LEGACY_META_KEY);
  if (legacyMeta?.workspaceIds?.length) {
    const legacyWorkspaces = await readMany<LegacyWorkspaceRecord>(legacyMeta.workspaceIds.map((id) => `${LEGACY_WORKSPACE_PREFIX}${id}`));
    const legacyNotebookIds = Array.from(new Set([...legacyWorkspaces.values()].flatMap((workspace) => workspace.notebookIds || [])));
    const legacyNotebooks = await readMany<LegacyNotebookRecord>(legacyNotebookIds.map((id) => `${LEGACY_NOTEBOOK_PREFIX}${id}`));
    const legacyPageIds = Array.from(new Set([...legacyNotebooks.values()].flatMap((notebook) => notebook.pageIds || [])));
    await writeRecords([], [
      LEGACY_META_KEY,
      ...legacyMeta.workspaceIds.map((id) => `${LEGACY_WORKSPACE_PREFIX}${id}`),
      ...legacyNotebookIds.map((id) => `${LEGACY_NOTEBOOK_PREFIX}${id}`),
      ...legacyPageIds.map((id) => `${LEGACY_PAGE_PREFIX}${id}`),
    ]);
  }
  return meta.savedAt;
}

export function saveIncrementalLibrary<P extends PageLike, N extends NotebookLike<P>, W extends WorkspaceLike<N>>(snapshot: SnapshotLike<W>) {
  const run = saveQueue.then(() => performSave(snapshot));
  saveQueue = run.catch(() => undefined);
  return run;
}

/** Returns the normalized IDs behind a render-only sheet object. */
export function normalizedSheetContext(sheetId: string) {
  const sheet = canonicalCache?.sheets.find((item) => item.id === sheetId);
  if (!sheet) return null;
  const page = canonicalCache?.pages.find((item) => item.id === sheet.pageId);
  const section = page && canonicalCache?.sections.find((item) => item.id === page.sectionId);
  if (!page || !section) return null;
  return { notebookId: section.notebookId, sectionId: section.id, pageId: page.id, sheetId: sheet.id };
}

export function readActiveNoteState(): ActiveNoteState | null {
  return canonicalCache ? { ...canonicalCache.active } : null;
}
