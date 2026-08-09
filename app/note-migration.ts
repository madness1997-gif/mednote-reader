import { assertDocumentGraph, type DocumentGraph, type DocumentRecord } from "./document-domain";
import { assertNoteStructure, assertSheetContents, ordered, type ActiveNoteState, type NoteStructure, type Page, type Section, type Sheet, type SheetContent, type SheetContentMap } from "./note-domain";
import { IndexedDbNoteRepository } from "./indexeddb-note-repository";
import { NOTE_SCHEMA_VERSION, type LibraryV6 } from "./note-repository";
import { migrateRelationV2, stableMigrationId, type LegacyRelationV2 } from "./relation-v2-migration";

export type { LegacyRelationV2 } from "./relation-v2-migration";

type AnyRecord = Record<string, any>;

export type LegacySnapshot = {
  workspaces: AnyRecord[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
  savedAt?: number;
};

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

export type MigrationReport = {
  sourceVersion: 3 | 4 | 5;
  notebookCount: number;
  sectionCount: number;
  pageCount: number;
  sheetCount: number;
  documentCount: number;
  linkCount: number;
  sheetContentHashes: Record<string, string>;
  warnings: string[];
};

export type MigrationResult = { library: LibraryV6; report: MigrationReport };

const LEGACY_META_WORKSPACE = "__mednote_relations_v2__";
const LAZY_FLAG = "__mednoteLazyPage";
const NAVIGATION_FIELDS = new Set([
  "id", "title", "titleHtml", "pageId", "sectionId", "notebookId", "order",
  "logicalPageId", "logicalPageTitle", "sheetTitle", "sheetOrder", LAZY_FLAG,
]);

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizedOrder = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value: SheetContent) {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stripNavigation(record: AnyRecord): SheetContent {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !NAVIGATION_FIELDS.has(key)));
}

function documentFromLegacy(record: AnyRecord): DocumentRecord {
  const { id, name, size, lastModified, available, ...payload } = record;
  return {
    id: String(id),
    name: String(name || "Tài liệu PDF"),
    size: Number(size) || 0,
    lastModified: Number(lastModified) || 0,
    available: available !== false,
    payload: clone(payload),
  };
}

function collectDocuments(contexts: AnyRecord[], relation?: LegacyRelationV2) {
  const documents = new Map<string, DocumentRecord>();
  contexts.forEach((context) => (context.documents || []).forEach((record: AnyRecord) => {
    if (record?.id) documents.set(String(record.id), documentFromLegacy(record));
  }));
  (relation?.documents || []).forEach((record) => {
    if (!record?.id) return;
    const id = String(record.id);
    const current = documents.get(id);
    const next = documentFromLegacy(record);
    documents.set(id, current ? { ...next, ...current, available: record.available !== false } : next);
  });
  return [...documents.values()];
}

function buildDocumentContexts(contexts: AnyRecord[], documents: DocumentRecord[]) {
  const documentIds = new Set(documents.map((record) => record.id));
  return contexts.filter((context) => String(context.id) !== LEGACY_META_WORKSPACE).map((context) => {
    const ids = [...new Set<string>((context.documents || []).map((record: AnyRecord) => String(record.id)).filter((id: string) => documentIds.has(id)))];
    return {
      id: String(context.id),
      kind: String(context.kind || "empty"),
      name: String(context.name || "Workspace"),
      documentIds: ids,
      activeDocumentId: ids.includes(String(context.activeDocumentId || "")) ? String(context.activeDocumentId) : ids[0] || null,
      sourcePage: Number(context.sourcePage) || 1,
    };
  });
}

function normalizeSiblingOrders<T extends { order: number }>(records: T[], parent: (record: T) => string) {
  const groups = new Map<string, T[]>();
  records.forEach((record) => {
    const id = parent(record);
    const group = groups.get(id) || [];
    group.push(record);
    groups.set(id, group);
  });
  groups.forEach((group) => group.sort((left, right) => left.order - right.order).forEach((record, index) => { record.order = index; }));
  return records;
}

function defaultActive(notes: Omit<NoteStructure, "active">, requested: Partial<ActiveNoteState> = {}): ActiveNoteState {
  const requestedPage = notes.pages.find((record) => record.id === requested.activePageId);
  const requestedSection = notes.sections.find((record) => record.id === requested.activeSectionId);
  const requestedNotebookId = notes.notebooks.some((record) => record.id === requested.activeNotebookId) ? requested.activeNotebookId : "";
  const pageFromSection = requestedSection && ordered(notes.pages.filter((record) => record.sectionId === requestedSection.id))[0];
  const sectionFromNotebook = requestedNotebookId && ordered(notes.sections.filter((record) => record.notebookId === requestedNotebookId))[0];
  const pageFromNotebook = sectionFromNotebook && ordered(notes.pages.filter((record) => record.sectionId === sectionFromNotebook.id))[0];
  const fallbackPage = requestedPage || pageFromSection || pageFromNotebook;
  const requestedSheet = notes.sheets.find((record) => record.id === requested.activeSheetId);
  const sheet = requestedSheet || (fallbackPage && ordered(notes.sheets.filter((record) => record.pageId === fallbackPage.id))[0]) || notes.sheets[0];
  const page = sheet && notes.pages.find((record) => record.id === sheet.pageId);
  const section = page && notes.sections.find((record) => record.id === page.sectionId);
  if (!sheet || !page || !section) return { activeNotebookId: "", activeSectionId: "", activePageId: "", activeSheetId: "" };
  return { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: page.id, activeSheetId: sheet.id };
}

function finishLibrary(
  notes: Omit<NoteStructure, "active"> & { active?: ActiveNoteState },
  sheetContents: SheetContentMap,
  contexts: AnyRecord[],
  relation: LegacyRelationV2 | undefined,
  existingLinks: AnyRecord[],
  preferences: LibraryV6["preferences"],
  savedAt: number,
  warnings: string[],
) {
  const noteStructure: NoteStructure = { ...notes, active: notes.active || defaultActive(notes) };
  const documents = collectDocuments(contexts, relation);
  const documentContexts = buildDocumentContexts(contexts, documents);
  const normalizedRelations = migrateRelationV2(noteStructure, documents, existingLinks, relation);
  warnings.push(...normalizedRelations.warnings);
  const documentGraph: DocumentGraph = {
    documents,
    contexts: documentContexts,
    groups: normalizedRelations.groups,
    links: normalizedRelations.links,
    linkRelations: normalizedRelations.linkRelations,
  };
  assertNoteStructure(noteStructure);
  assertSheetContents(noteStructure, sheetContents);
  assertDocumentGraph(documentGraph, noteStructure);
  return {
    version: NOTE_SCHEMA_VERSION,
    notes: noteStructure,
    sheetContents,
    documents: documentGraph,
    preferences,
    savedAt,
  } satisfies LibraryV6;
}

function migrationReport(sourceVersion: 3 | 4 | 5, library: LibraryV6, warnings: string[] = []): MigrationReport {
  return {
    sourceVersion,
    notebookCount: library.notes.notebooks.length,
    sectionCount: library.notes.sections.length,
    pageCount: library.notes.pages.length,
    sheetCount: library.notes.sheets.length,
    documentCount: library.documents.documents.length,
    linkCount: library.documents.links.length,
    sheetContentHashes: Object.fromEntries(library.notes.sheets.map((sheet) => [sheet.id, contentHash(library.sheetContents[sheet.id])])),
    warnings,
  };
}

export function migrateV5ToV6(source: V5MigrationSource, relation?: LegacyRelationV2): MigrationResult {
  const warnings: string[] = [];
  const notesBase = {
    workspace: { id: String(source.workspace?.id || "workspace"), title: String(source.workspace?.title || "MedNote") },
    notebooks: clone(source.notebooks).map((record, index) => ({ id: String(record.id), title: String(record.title || "Sổ ghi chú"), order: normalizedOrder(record.order, index) })),
    sections: clone(source.sections).map((record, index) => ({ id: String(record.id), notebookId: String(record.notebookId), title: String(record.title || "Phần 1"), order: normalizedOrder(record.order, index) })),
    pages: clone(source.pages).map((record, index) => ({ id: String(record.id), sectionId: String(record.sectionId), title: String(record.title || "Page mới"), order: normalizedOrder(record.order, index) })),
    sheets: clone(source.sheets).map((record, index) => ({ id: String(record.id), pageId: String(record.pageId), order: normalizedOrder(record.order, index) })),
  };
  const sheetContents = Object.fromEntries(source.sheets.map((record) => [String(record.id), stripNavigation(record.content || {})])) as SheetContentMap;
  normalizeSiblingOrders(notesBase.notebooks, () => "workspace");
  normalizeSiblingOrders(notesBase.sections, (record) => record.notebookId);
  normalizeSiblingOrders(notesBase.pages, (record) => record.sectionId);
  normalizeSiblingOrders(notesBase.sheets, (record) => record.pageId);
  const active = defaultActive(notesBase, {
    activeNotebookId: String(source.meta.activeNotebookId || ""),
    activeSectionId: String(source.meta.activeSectionId || ""),
    activePageId: String(source.meta.activePageId || ""),
    activeSheetId: String(source.meta.activeSheetId || ""),
  });
  const library = finishLibrary(
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
      : [{ id: stableMigrationId("section", notebookId), title: "Phần 1", pageIds: [...physicalIds] }];
    const sectionForSheet = new Map<string, string>();
    legacySections.forEach((record: AnyRecord, order: number) => {
      const sectionId = String(record.id || stableMigrationId("section", `${notebookId}:${order}`));
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

async function readV5Source(dbName: string, storeName: string): Promise<V5MigrationSource | null> {
  const db = await openLegacyDb(dbName, storeName);
  try {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const meta = await requestValue(store.get("library:v5:meta")) as AnyRecord | undefined;
    if (!meta?.contextIds?.length) return null;
    const read = (prefix: string, ids: string[]) => Promise.all(ids.map((id) => requestValue(store.get(`${prefix}${id}`))));
    const [workspace, notebooks, sections, pages, sheets, links, contexts] = await Promise.all([
      requestValue(store.get("library:v5:workspace")),
      read("library:v5:notebook:", meta.notebookIds || []),
      read("library:v5:section:", meta.sectionIds || []),
      read("library:v5:page:", meta.pageIds || []),
      read("library:v5:sheet:", meta.sheetIds || []),
      read("library:v5:note-document-link:", meta.linkIds || []),
      read("library:v5:document-context:", meta.contextIds || []),
    ]);
    const all = [workspace, ...notebooks, ...sections, ...pages, ...sheets, ...links, ...contexts];
    if (all.some((record) => record === undefined)) throw new Error("Kho v5 thiếu record; không được cutover v6");
    return { meta, workspace: workspace as AnyRecord, notebooks: notebooks as AnyRecord[], sections: sections as AnyRecord[], pages: pages as AnyRecord[], sheets: sheets as AnyRecord[], links: links as AnyRecord[], contexts: contexts as AnyRecord[] };
  } finally {
    db.close();
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
  if (current) return { library: current, report: migrationReport(5, current, ["Kho v6 đã tồn tại; migration không ghi lại"] ) };
  let result: MigrationResult | null = null;
  const v5 = await readV5Source(dbName, storeName);
  if (v5) result = migrateV5ToV6(v5, options.relation);
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
  return { library: reloaded, report: result.report };
}
