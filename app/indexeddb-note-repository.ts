import { assertDocumentGraph, type DocumentGraph, type DocumentLinkRelation, type NoteDocumentLink } from "./document-domain";
import type { DocumentRepository } from "./document-repository";
import { assertNoteGraph, noteContextForSheet, ordered, type ActiveNoteState, type Notebook, type NoteGraph, type Page, type Section, type Sheet, type SheetContent } from "./note-domain";
import { NOTE_SCHEMA_VERSION, type CreateNotebookInput, type CreatePageInput, type CreateSectionInput, type CreateSheetInput, type LibraryPreferences, type LibraryV6, type NoteRepository } from "./note-repository";

export const V6_KEYS = {
  meta: "library:v6:meta",
  workspace: "library:v6:workspace",
  notebook: "library:v6:notebook:",
  section: "library:v6:section:",
  page: "library:v6:page:",
  sheet: "library:v6:sheet:",
  document: "library:v6:document:",
  context: "library:v6:document-context:",
  group: "library:v6:document-group:",
  link: "library:v6:note-document-link:",
  linkRelation: "library:v6:document-link-relation:",
} as const;

type V6Meta = {
  version: typeof NOTE_SCHEMA_VERSION;
  notebookIds: string[];
  sectionIds: string[];
  pageIds: string[];
  sheetIds: string[];
  documentIds: string[];
  contextIds: string[];
  groupIds: string[];
  linkIds: string[];
  linkRelationIds: string[];
  active: ActiveNoteState;
  preferences: LibraryPreferences;
  savedAt: number;
};

type StoreTransaction = { transaction: IDBTransaction; store: IDBObjectStore };

export class RepositoryCorruptionError extends Error {
  readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(`Kho note v6 thiếu record: ${missingKeys.join(", ")}`);
    this.name = "RepositoryCorruptionError";
    this.missingKeys = missingKeys;
  }
}

export class RepositoryMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryMutationError";
  }
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const requestValue = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
});

const cleanTitle = (value: string, fallback: string) => value.trim() || fallback;
const idOf = (prefix: string) => `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const touchMeta = (meta: V6Meta): V6Meta => ({ ...meta, savedAt: Math.max(Date.now(), meta.savedAt + 1) });

function metaFor(library: LibraryV6): V6Meta {
  return {
    version: NOTE_SCHEMA_VERSION,
    notebookIds: ordered(library.notes.notebooks).map((record) => record.id),
    sectionIds: [...library.notes.sections].sort((left, right) => {
      const notebookOrder = library.notes.notebooks.find((record) => record.id === left.notebookId)?.order ?? 0;
      const rightNotebookOrder = library.notes.notebooks.find((record) => record.id === right.notebookId)?.order ?? 0;
      return notebookOrder - rightNotebookOrder || left.order - right.order;
    }).map((record) => record.id),
    pageIds: [...library.notes.pages].sort((left, right) => left.sectionId.localeCompare(right.sectionId) || left.order - right.order).map((record) => record.id),
    sheetIds: [...library.notes.sheets].sort((left, right) => left.pageId.localeCompare(right.pageId) || left.order - right.order).map((record) => record.id),
    documentIds: library.documents.documents.map((record) => record.id),
    contextIds: library.documents.contexts.map((record) => record.id),
    groupIds: library.documents.groups.map((record) => record.id),
    linkIds: library.documents.links.map((record) => record.id),
    linkRelationIds: library.documents.linkRelations.map((record) => record.id),
    active: clone(library.notes.active),
    preferences: clone(library.preferences),
    savedAt: library.savedAt,
  };
}

function v6RecordKeys(meta: V6Meta) {
  return [
    V6_KEYS.meta,
    V6_KEYS.workspace,
    ...meta.notebookIds.map((id) => `${V6_KEYS.notebook}${id}`),
    ...meta.sectionIds.map((id) => `${V6_KEYS.section}${id}`),
    ...meta.pageIds.map((id) => `${V6_KEYS.page}${id}`),
    ...meta.sheetIds.map((id) => `${V6_KEYS.sheet}${id}`),
    ...meta.documentIds.map((id) => `${V6_KEYS.document}${id}`),
    ...meta.contextIds.map((id) => `${V6_KEYS.context}${id}`),
    ...meta.groupIds.map((id) => `${V6_KEYS.group}${id}`),
    ...meta.linkIds.map((id) => `${V6_KEYS.link}${id}`),
    ...meta.linkRelationIds.map((id) => `${V6_KEYS.linkRelation}${id}`),
  ];
}

function recordEntries(library: LibraryV6, meta = metaFor(library)): Array<[string, unknown]> {
  return [
    [V6_KEYS.meta, meta],
    [V6_KEYS.workspace, library.notes.workspace],
    ...library.notes.notebooks.map((record) => [`${V6_KEYS.notebook}${record.id}`, record] as [string, unknown]),
    ...library.notes.sections.map((record) => [`${V6_KEYS.section}${record.id}`, record] as [string, unknown]),
    ...library.notes.pages.map((record) => [`${V6_KEYS.page}${record.id}`, record] as [string, unknown]),
    ...library.notes.sheets.map((record) => [`${V6_KEYS.sheet}${record.id}`, record] as [string, unknown]),
    ...library.documents.documents.map((record) => [`${V6_KEYS.document}${record.id}`, record] as [string, unknown]),
    ...library.documents.contexts.map((record) => [`${V6_KEYS.context}${record.id}`, record] as [string, unknown]),
    ...library.documents.groups.map((record) => [`${V6_KEYS.group}${record.id}`, record] as [string, unknown]),
    ...library.documents.links.map((record) => [`${V6_KEYS.link}${record.id}`, record] as [string, unknown]),
    ...library.documents.linkRelations.map((record) => [`${V6_KEYS.linkRelation}${record.id}`, record] as [string, unknown]),
  ];
}

function assertLibrary(library: LibraryV6) {
  if (library.version !== NOTE_SCHEMA_VERSION) throw new RepositoryMutationError(`Repository chỉ nhận schema v${NOTE_SCHEMA_VERSION}`);
  assertNoteGraph(library.notes);
  assertDocumentGraph(library.documents, library.notes);
}

export class IndexedDbNoteRepository implements NoteRepository, DocumentRepository {
  private readonly dbName: string;
  private readonly storeName: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: { dbName?: string; storeName?: string } = {}) {
    this.dbName = options.dbName || "mednote-local";
    this.storeName = options.storeName || "documents";
  }

  private openDb() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) request.result.createObjectStore(this.storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async transaction<T>(mode: IDBTransactionMode, callback: (context: StoreTransaction) => Promise<T>) {
    const db = await this.openDb();
    const transaction = db.transaction(this.storeName, mode);
    const done = transactionDone(transaction);
    try {
      const value = await callback({ transaction, store: transaction.objectStore(this.storeName) });
      await done;
      return value;
    } catch (error) {
      try { transaction.abort(); } catch { /* It may already be complete. */ }
      try { await done; } catch { /* Preserve the original domain error. */ }
      throw error;
    } finally {
      db.close();
    }
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async requireMeta(store: IDBObjectStore) {
    const meta = await requestValue(store.get(V6_KEYS.meta)) as V6Meta | undefined;
    if (!meta || meta.version !== NOTE_SCHEMA_VERSION) throw new RepositoryMutationError("Chưa có thư viện note v6");
    return meta;
  }

  private async requireRecord<T>(store: IDBObjectStore, key: string, label: string) {
    const value = await requestValue(store.get(key)) as T | undefined;
    if (!value) throw new RepositoryMutationError(`Không tìm thấy ${label}`);
    return value;
  }

  async flush() {
    await this.queue;
  }

  async loadLibrary(): Promise<LibraryV6 | null> {
    await this.flush();
    return this.transaction("readonly", async ({ store }) => {
      const meta = await requestValue(store.get(V6_KEYS.meta)) as V6Meta | undefined;
      if (!meta) return null;
      if (meta.version !== NOTE_SCHEMA_VERSION) throw new RepositoryCorruptionError([V6_KEYS.meta]);
      const keys = v6RecordKeys(meta).filter((key) => key !== V6_KEYS.meta);
      const values = await Promise.all(keys.map(async (key) => [key, await requestValue(store.get(key))] as const));
      const records = new Map(values);
      const missing = values.filter(([, value]) => value === undefined).map(([key]) => key);
      if (missing.length) throw new RepositoryCorruptionError(missing);
      const fromIds = <T>(ids: string[], prefix: string) => ids.map((id) => clone(records.get(`${prefix}${id}`) as T));
      const notes: NoteGraph = {
        workspace: clone(records.get(V6_KEYS.workspace) as NoteGraph["workspace"]),
        notebooks: fromIds<Notebook>(meta.notebookIds, V6_KEYS.notebook),
        sections: fromIds<Section>(meta.sectionIds, V6_KEYS.section),
        pages: fromIds<Page>(meta.pageIds, V6_KEYS.page),
        sheets: fromIds<Sheet>(meta.sheetIds, V6_KEYS.sheet),
        active: clone(meta.active),
      };
      const documents: DocumentGraph = {
        documents: fromIds<DocumentGraph["documents"][number]>(meta.documentIds, V6_KEYS.document),
        contexts: fromIds<DocumentGraph["contexts"][number]>(meta.contextIds, V6_KEYS.context),
        groups: fromIds<DocumentGraph["groups"][number]>(meta.groupIds, V6_KEYS.group),
        links: fromIds<NoteDocumentLink>(meta.linkIds, V6_KEYS.link),
        linkRelations: fromIds<DocumentLinkRelation>(meta.linkRelationIds, V6_KEYS.linkRelation),
      };
      const library: LibraryV6 = { version: NOTE_SCHEMA_VERSION, notes, documents, preferences: clone(meta.preferences), savedAt: meta.savedAt };
      assertLibrary(library);
      return library;
    });
  }

  async loadNoteGraph() {
    return (await this.loadLibrary())?.notes || null;
  }

  async loadDocumentGraph() {
    return (await this.loadLibrary())?.documents || null;
  }

  async loadSheetContent(sheetId: string) {
    await this.flush();
    return this.transaction("readonly", async ({ store }) => {
      const sheet = await requestValue(store.get(`${V6_KEYS.sheet}${sheetId}`)) as Sheet | undefined;
      return sheet ? clone(sheet.content) : null;
    });
  }

  replaceLibrary(library: LibraryV6) {
    const snapshot = clone(library);
    assertLibrary(snapshot);
    return this.enqueue(async () => {
      const nextMeta = metaFor(snapshot);
      await this.transaction("readwrite", async ({ store }) => {
        const previous = await requestValue(store.get(V6_KEYS.meta)) as V6Meta | undefined;
        recordEntries(snapshot, nextMeta).forEach(([key, value]) => store.put(clone(value), key));
        if (previous?.version === NOTE_SCHEMA_VERSION) {
          const nextKeys = new Set(v6RecordKeys(nextMeta));
          v6RecordKeys(previous).filter((key) => !nextKeys.has(key)).forEach((key) => store.delete(key));
        }
      });
    });
  }

  createNotebook(input: CreateNotebookInput) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const notebookId = input.id || idOf("notebook");
      const sectionId = input.sectionId || idOf("section");
      const pageId = input.pageId || idOf("page");
      const sheetId = input.sheetId || idOf("sheet");
      const existing = await Promise.all([
        requestValue(store.get(`${V6_KEYS.notebook}${notebookId}`)),
        requestValue(store.get(`${V6_KEYS.section}${sectionId}`)),
        requestValue(store.get(`${V6_KEYS.page}${pageId}`)),
        requestValue(store.get(`${V6_KEYS.sheet}${sheetId}`)),
      ]);
      if (existing.some((value) => value !== undefined)) throw new RepositoryMutationError("ID tạo Notebook đã tồn tại");
      const notebook: Notebook = { id: notebookId, title: cleanTitle(input.title, "Sổ ghi chú"), order: meta.notebookIds.length };
      const section: Section = { id: sectionId, notebookId, title: cleanTitle(input.sectionTitle || "Phần 1", "Phần 1"), order: 0 };
      const page: Page = { id: pageId, sectionId, title: cleanTitle(input.pageTitle || "Page 1", "Page 1"), order: 0 };
      const sheet: Sheet = { id: sheetId, pageId, order: 0, content: clone(input.content || {}) };
      const active = noteContextForSheet({ workspace: { id: "", title: "" }, notebooks: [notebook], sections: [section], pages: [page], sheets: [sheet], active: meta.active }, sheetId)!;
      store.put(notebook, `${V6_KEYS.notebook}${notebookId}`);
      store.put(section, `${V6_KEYS.section}${sectionId}`);
      store.put(page, `${V6_KEYS.page}${pageId}`);
      store.put(sheet, `${V6_KEYS.sheet}${sheetId}`);
      store.put(touchMeta({ ...meta, notebookIds: [...meta.notebookIds, notebookId], sectionIds: [...meta.sectionIds, sectionId], pageIds: [...meta.pageIds, pageId], sheetIds: [...meta.sheetIds, sheetId], active }), V6_KEYS.meta);
      return active;
    }));
  }

  createSection(input: CreateSectionInput) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      await this.requireRecord<Notebook>(store, `${V6_KEYS.notebook}${input.notebookId}`, `Notebook ${input.notebookId}`);
      const id = input.id || idOf("section");
      if (await requestValue(store.get(`${V6_KEYS.section}${id}`)) !== undefined) throw new RepositoryMutationError(`Section ${id} đã tồn tại`);
      const siblings = await this.recordsByIds<Section>(store, meta.sectionIds, V6_KEYS.section);
      const record: Section = { id, notebookId: input.notebookId, title: cleanTitle(input.title, "Phần mới"), order: siblings.filter((item) => item.notebookId === input.notebookId).length };
      store.put(record, `${V6_KEYS.section}${id}`);
      store.put(touchMeta({ ...meta, sectionIds: [...meta.sectionIds, id] }), V6_KEYS.meta);
      return id;
    }));
  }

  createPage(input: CreatePageInput) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const section = await this.requireRecord<Section>(store, `${V6_KEYS.section}${input.sectionId}`, `Section ${input.sectionId}`);
      const id = input.id || idOf("page");
      const sheetId = input.sheetId || idOf("sheet");
      if (await requestValue(store.get(`${V6_KEYS.page}${id}`)) !== undefined || await requestValue(store.get(`${V6_KEYS.sheet}${sheetId}`)) !== undefined) {
        throw new RepositoryMutationError("ID tạo Page/Sheet đã tồn tại");
      }
      const pages = await this.recordsByIds<Page>(store, meta.pageIds, V6_KEYS.page);
      const record: Page = { id, sectionId: section.id, title: cleanTitle(input.title, "Page mới"), order: pages.filter((item) => item.sectionId === section.id).length };
      const sheet: Sheet = { id: sheetId, pageId: id, order: 0, content: clone(input.content || {}) };
      const active = { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: id, activeSheetId: sheetId };
      store.put(record, `${V6_KEYS.page}${id}`);
      store.put(sheet, `${V6_KEYS.sheet}${sheetId}`);
      store.put(touchMeta({ ...meta, pageIds: [...meta.pageIds, id], sheetIds: [...meta.sheetIds, sheetId], active }), V6_KEYS.meta);
      return active;
    }));
  }

  createSheet(input: CreateSheetInput) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const page = await this.requireRecord<Page>(store, `${V6_KEYS.page}${input.pageId}`, `Page ${input.pageId}`);
      const section = await this.requireRecord<Section>(store, `${V6_KEYS.section}${page.sectionId}`, `Section ${page.sectionId}`);
      const id = input.id || idOf("sheet");
      if (await requestValue(store.get(`${V6_KEYS.sheet}${id}`)) !== undefined) throw new RepositoryMutationError(`Sheet ${id} đã tồn tại`);
      const sheets = await this.recordsByIds<Sheet>(store, meta.sheetIds, V6_KEYS.sheet);
      const record: Sheet = { id, pageId: page.id, order: sheets.filter((item) => item.pageId === page.id).length, content: clone(input.content || {}) };
      const active = { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: page.id, activeSheetId: id };
      store.put(record, `${V6_KEYS.sheet}${id}`);
      store.put(touchMeta({ ...meta, sheetIds: [...meta.sheetIds, id], active }), V6_KEYS.meta);
      return active;
    }));
  }

  renameNotebook(id: string, title: string) { return this.renameRecord<Notebook>(V6_KEYS.notebook, id, title, "Notebook"); }
  renameSection(id: string, title: string) { return this.renameRecord<Section>(V6_KEYS.section, id, title, "Section"); }
  renamePage(id: string, title: string) { return this.renameRecord<Page>(V6_KEYS.page, id, title, "Page"); }

  private renameRecord<T extends { id: string; title: string }>(prefix: string, id: string, title: string, label: string) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const record = await this.requireRecord<T>(store, `${prefix}${id}`, `${label} ${id}`);
      store.put({ ...record, title: cleanTitle(title, record.title) }, `${prefix}${id}`);
      store.put(touchMeta(meta), V6_KEYS.meta);
    }));
  }

  movePage(id: string, sectionId: string, order: number) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const moving = await this.requireRecord<Page>(store, `${V6_KEYS.page}${id}`, `Page ${id}`);
      const targetSection = await this.requireRecord<Section>(store, `${V6_KEYS.section}${sectionId}`, `Section ${sectionId}`);
      const pages = await this.recordsByIds<Page>(store, meta.pageIds, V6_KEYS.page);
      this.reorderMove(pages, moving, (record) => record.sectionId, sectionId, order, (record, parentId, nextOrder) => ({ ...record, sectionId: parentId, order: nextOrder }))
        .forEach((record) => store.put(record, `${V6_KEYS.page}${record.id}`));
      const nextMeta = meta.active.activePageId === id
        ? { ...meta, active: { ...meta.active, activeNotebookId: targetSection.notebookId, activeSectionId: targetSection.id } }
        : meta;
      store.put(touchMeta(nextMeta), V6_KEYS.meta);
    }));
  }

  moveSheet(id: string, pageId: string, order: number) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const moving = await this.requireRecord<Sheet>(store, `${V6_KEYS.sheet}${id}`, `Sheet ${id}`);
      await this.requireRecord<Page>(store, `${V6_KEYS.page}${pageId}`, `Page ${pageId}`);
      const sheets = await this.recordsByIds<Sheet>(store, meta.sheetIds, V6_KEYS.sheet);
      const oldSiblings = sheets.filter((record) => record.pageId === moving.pageId);
      if (oldSiblings.length === 1 && moving.pageId !== pageId) throw new RepositoryMutationError("Không thể chuyển Sheet duy nhất vì Page nguồn phải luôn có ít nhất một Sheet");
      this.reorderMove(sheets, moving, (record) => record.pageId, pageId, order, (record, parentId, nextOrder) => ({ ...record, pageId: parentId, order: nextOrder }))
        .forEach((record) => store.put(record, `${V6_KEYS.sheet}${record.id}`));
      let nextMeta = meta;
      if (meta.active.activeSheetId === id) {
        const page = await this.requireRecord<Page>(store, `${V6_KEYS.page}${pageId}`, `Page ${pageId}`);
        const section = await this.requireRecord<Section>(store, `${V6_KEYS.section}${page.sectionId}`, `Section ${page.sectionId}`);
        nextMeta = { ...meta, active: { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: page.id, activeSheetId: id } };
      }
      store.put(touchMeta(nextMeta), V6_KEYS.meta);
    }));
  }

  private reorderMove<T extends { id: string; order: number }>(
    records: T[],
    moving: T,
    parent: (record: T) => string,
    nextParent: string,
    nextOrder: number,
    update: (record: T, parentId: string, order: number) => T,
  ) {
    const oldParent = parent(moving);
    const changed = new Map<string, T>();
    const oldSiblings = records.filter((record) => parent(record) === oldParent && record.id !== moving.id).sort((left, right) => left.order - right.order);
    const destination = oldParent === nextParent
      ? oldSiblings
      : records.filter((record) => parent(record) === nextParent && record.id !== moving.id).sort((left, right) => left.order - right.order);
    const position = Math.max(0, Math.min(Math.trunc(nextOrder), destination.length));
    destination.splice(position, 0, moving);
    oldSiblings.forEach((record, index) => {
      if (oldParent !== nextParent && record.order !== index) changed.set(record.id, update(record, oldParent, index));
    });
    destination.forEach((record, index) => {
      const updated = update(record, nextParent, index);
      if (parent(record) !== nextParent || record.order !== index) changed.set(record.id, updated);
    });
    return [...changed.values()];
  }

  deleteNotebook(id: string) {
    return this.enqueue(() => this.deleteHierarchy("notebook", id));
  }

  deleteSection(id: string) {
    return this.enqueue(() => this.deleteHierarchy("section", id));
  }

  deletePage(id: string) {
    return this.enqueue(() => this.deleteHierarchy("page", id));
  }

  private deleteHierarchy(kind: "notebook" | "section" | "page", id: string) {
    return this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const notebooks = await this.recordsByIds<Notebook>(store, meta.notebookIds, V6_KEYS.notebook);
      const sections = await this.recordsByIds<Section>(store, meta.sectionIds, V6_KEYS.section);
      const pages = await this.recordsByIds<Page>(store, meta.pageIds, V6_KEYS.page);
      const sheets = await this.recordsByIds<Sheet>(store, meta.sheetIds, V6_KEYS.sheet);
      const notebookIds = new Set(kind === "notebook" ? [id] : []);
      const sectionIds = new Set(kind === "section" ? [id] : sections.filter((record) => notebookIds.has(record.notebookId)).map((record) => record.id));
      const pageIds = new Set(kind === "page" ? [id] : pages.filter((record) => sectionIds.has(record.sectionId)).map((record) => record.id));
      const sheetIds = new Set(sheets.filter((record) => pageIds.has(record.pageId)).map((record) => record.id));
      if (kind === "notebook" && !notebooks.some((record) => record.id === id)) throw new RepositoryMutationError(`Không tìm thấy Notebook ${id}`);
      if (kind === "section" && !sections.some((record) => record.id === id)) throw new RepositoryMutationError(`Không tìm thấy Section ${id}`);
      if (kind === "page" && !pages.some((record) => record.id === id)) throw new RepositoryMutationError(`Không tìm thấy Page ${id}`);
      if (kind === "section") {
        const target = sections.find((record) => record.id === id)!;
        if (sections.filter((record) => record.notebookId === target.notebookId).length <= 1) {
          throw new RepositoryMutationError("Notebook phải luôn có ít nhất một Section");
        }
      }
      notebookIds.forEach((recordId) => store.delete(`${V6_KEYS.notebook}${recordId}`));
      sectionIds.forEach((recordId) => store.delete(`${V6_KEYS.section}${recordId}`));
      pageIds.forEach((recordId) => store.delete(`${V6_KEYS.page}${recordId}`));
      sheetIds.forEach((recordId) => store.delete(`${V6_KEYS.sheet}${recordId}`));
      const nextMeta: V6Meta = {
        ...meta,
        notebookIds: meta.notebookIds.filter((recordId) => !notebookIds.has(recordId)),
        sectionIds: meta.sectionIds.filter((recordId) => !sectionIds.has(recordId)),
        pageIds: meta.pageIds.filter((recordId) => !pageIds.has(recordId)),
        sheetIds: meta.sheetIds.filter((recordId) => !sheetIds.has(recordId)),
      };
      await this.deleteTargetLinks(store, nextMeta, (link) => pageIds.has(link.targetId) || sheetIds.has(link.targetId));
      await this.repairOrders(store, nextMeta);
      nextMeta.active = await this.fallbackActive(store, nextMeta, meta.active.activeSheetId);
      store.put(touchMeta(nextMeta), V6_KEYS.meta);
    });
  }

  deleteSheet(id: string) {
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const sheet = await this.requireRecord<Sheet>(store, `${V6_KEYS.sheet}${id}`, `Sheet ${id}`);
      const sheets = await this.recordsByIds<Sheet>(store, meta.sheetIds, V6_KEYS.sheet);
      if (sheets.filter((record) => record.pageId === sheet.pageId).length <= 1) throw new RepositoryMutationError("Page phải luôn có ít nhất một Sheet");
      store.delete(`${V6_KEYS.sheet}${id}`);
      const nextMeta = { ...meta, sheetIds: meta.sheetIds.filter((recordId) => recordId !== id) };
      await this.deleteTargetLinks(store, nextMeta, (link) => link.targetType === "sheet" && link.targetId === id);
      await this.repairOrders(store, nextMeta);
      nextMeta.active = await this.fallbackActive(store, nextMeta, meta.active.activeSheetId);
      store.put(touchMeta(nextMeta), V6_KEYS.meta);
    }));
  }

  private async deleteTargetLinks(store: IDBObjectStore, meta: V6Meta, shouldDelete: (link: NoteDocumentLink) => boolean) {
    const links = await this.recordsByIds<NoteDocumentLink>(store, meta.linkIds, V6_KEYS.link);
    const removed = new Set(links.filter(shouldDelete).map((link) => link.id));
    if (!removed.size) return;
    removed.forEach((id) => store.delete(`${V6_KEYS.link}${id}`));
    meta.linkIds = meta.linkIds.filter((id) => !removed.has(id));
    const relations = await this.recordsByIds<DocumentLinkRelation>(store, meta.linkRelationIds, V6_KEYS.linkRelation);
    relations.forEach((relation) => {
      const linkIds = relation.linkIds.filter((id) => !removed.has(id));
      if (!linkIds.length) {
        store.delete(`${V6_KEYS.linkRelation}${relation.id}`);
        meta.linkRelationIds = meta.linkRelationIds.filter((id) => id !== relation.id);
      } else if (linkIds.length !== relation.linkIds.length) {
        store.put({ ...relation, linkIds }, `${V6_KEYS.linkRelation}${relation.id}`);
      }
    });
  }

  private async repairOrders(store: IDBObjectStore, meta: V6Meta) {
    const notebooks = await this.recordsByIds<Notebook>(store, meta.notebookIds, V6_KEYS.notebook);
    ordered(notebooks).forEach((record, index) => { if (record.order !== index) store.put({ ...record, order: index }, `${V6_KEYS.notebook}${record.id}`); });
    const sections = await this.recordsByIds<Section>(store, meta.sectionIds, V6_KEYS.section);
    new Set(sections.map((record) => record.notebookId)).forEach((parentId) => {
      ordered(sections.filter((record) => record.notebookId === parentId)).forEach((record, index) => { if (record.order !== index) store.put({ ...record, order: index }, `${V6_KEYS.section}${record.id}`); });
    });
    const pages = await this.recordsByIds<Page>(store, meta.pageIds, V6_KEYS.page);
    new Set(pages.map((record) => record.sectionId)).forEach((parentId) => {
      ordered(pages.filter((record) => record.sectionId === parentId)).forEach((record, index) => { if (record.order !== index) store.put({ ...record, order: index }, `${V6_KEYS.page}${record.id}`); });
    });
    const sheets = await this.recordsByIds<Sheet>(store, meta.sheetIds, V6_KEYS.sheet);
    new Set(sheets.map((record) => record.pageId)).forEach((parentId) => {
      ordered(sheets.filter((record) => record.pageId === parentId)).forEach((record, index) => { if (record.order !== index) store.put({ ...record, order: index }, `${V6_KEYS.sheet}${record.id}`); });
    });
  }

  private async fallbackActive(store: IDBObjectStore, meta: V6Meta, preferredSheetId: string): Promise<ActiveNoteState> {
    const sheetId = meta.sheetIds.includes(preferredSheetId) ? preferredSheetId : meta.sheetIds[0];
    if (!sheetId) return { activeNotebookId: "", activeSectionId: "", activePageId: "", activeSheetId: "" };
    const sheet = await this.requireRecord<Sheet>(store, `${V6_KEYS.sheet}${sheetId}`, `Sheet ${sheetId}`);
    const page = await this.requireRecord<Page>(store, `${V6_KEYS.page}${sheet.pageId}`, `Page ${sheet.pageId}`);
    const section = await this.requireRecord<Section>(store, `${V6_KEYS.section}${page.sectionId}`, `Section ${page.sectionId}`);
    return { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: page.id, activeSheetId: sheet.id };
  }

  saveSheetContent(sheetId: string, content: SheetContent) {
    const snapshot = clone(content);
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const sheet = await this.requireRecord<Sheet>(store, `${V6_KEYS.sheet}${sheetId}`, `Sheet ${sheetId}`);
      store.put({ ...sheet, content: snapshot }, `${V6_KEYS.sheet}${sheetId}`);
      store.put(touchMeta(meta), V6_KEYS.meta);
    }));
  }

  async readActiveState() {
    await this.flush();
    return this.transaction("readonly", async ({ store }) => {
      const meta = await requestValue(store.get(V6_KEYS.meta)) as V6Meta | undefined;
      return meta ? clone(meta.active) : null;
    });
  }

  setActiveState(active: ActiveNoteState) {
    const next = clone(active);
    return this.enqueue(() => this.transaction("readwrite", async ({ store }) => {
      const meta = await this.requireMeta(store);
      const sheet = await this.requireRecord<Sheet>(store, `${V6_KEYS.sheet}${next.activeSheetId}`, `Sheet ${next.activeSheetId}`);
      const page = await this.requireRecord<Page>(store, `${V6_KEYS.page}${next.activePageId}`, `Page ${next.activePageId}`);
      const section = await this.requireRecord<Section>(store, `${V6_KEYS.section}${next.activeSectionId}`, `Section ${next.activeSectionId}`);
      if (sheet.pageId !== page.id || page.sectionId !== section.id || section.notebookId !== next.activeNotebookId) {
        throw new RepositoryMutationError("Active state không tạo thành chuỗi Notebook → Section → Page → Sheet hợp lệ");
      }
      store.put(touchMeta({ ...meta, active: next }), V6_KEYS.meta);
    }));
  }

  private async recordsByIds<T>(store: IDBObjectStore, ids: string[], prefix: string) {
    return Promise.all(ids.map((id) => this.requireRecord<T>(store, `${prefix}${id}`, `${prefix}${id}`)));
  }
}

export function deleteNoteRepositoryDatabase(dbName: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Không thể xóa database test ${dbName}`));
  });
}
