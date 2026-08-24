import { useSyncExternalStore } from "react";
import { IndexedDbNoteRepository } from "./indexeddb-note-repository";
import {
  migrateLegacySnapshotToV6,
  migrateStoredLibraryToV6,
  type LegacyRelationV2,
  type LegacySnapshot,
} from "./note-migration";
import { NoteCommands, type NoteCommandResult } from "./note-commands";
import type { DocumentGraph } from "./document-domain";
import type { SaveDocumentWorkspaceInput } from "./document-repository";
import { remapDocumentReferencesInContent } from "./note-document-source";
import type { LibraryPreferences, LibraryV6, NoteRepository } from "./note-repository";
import {
  noteContextForSheet,
  ordered,
  type ActiveNoteState,
  type NoteStructure,
  type SheetContent,
  type SheetContentMap,
} from "./note-domain";

export type NoteStoreStatus = "idle" | "loading" | "ready" | "error";

export type NoteStoreSnapshot = {
  status: NoteStoreStatus;
  structure: NoteStructure | null;
  documents: DocumentGraph;
  activeSheetContent: SheetContent | null;
  /** Bounded content cache for the Page currently shown in continuous mode. */
  pageSheetContents: SheetContentMap;
  hydratingSheetId: string | null;
  hydratingPageId: string | null;
  dirty: boolean;
  busy: boolean;
  revision: number;
  error: string | null;
};

export type NoteStoreInitializeOptions = {
  relation?: LegacyRelationV2;
  localSnapshot?: LegacySnapshot;
  fallbackSnapshot?: LegacySnapshot;
  /** Unit/integration harnesses may seed the injected repository directly. */
  skipMigration?: boolean;
};

const EMPTY_SNAPSHOT: NoteStoreSnapshot = {
  status: "idle",
  structure: null,
  documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
  activeSheetContent: null,
  pageSheetContents: {},
  hydratingSheetId: null,
  hydratingPageId: null,
  dirty: false,
  busy: false,
  revision: 0,
  error: null,
};

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể cập nhật kho note";
}

export class NoteStore {
  private snapshot: NoteStoreSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly commands: NoteCommands;
  private initialized: Promise<void> | null = null;
  private legacyRelation: LegacyRelationV2 | undefined;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly repository: NoteRepository, commands?: NoteCommands) {
    this.commands = commands || new NoteCommands(repository);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => EMPTY_SNAPSHOT;

  private publish(changes: Partial<NoteStoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes, revision: this.snapshot.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }

  private serialize<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.catch(() => undefined);
    return run;
  }

  initialize(options: NoteStoreInitializeOptions = {}) {
    if (this.initialized) return this.initialized;
    this.legacyRelation = options.relation;
    this.initialized = this.serialize(async () => {
      this.publish({ status: "loading", busy: true, error: null });
      try {
        if (!options.skipMigration) {
          let migrated = await migrateStoredLibraryToV6({
            relation: options.relation,
            localSnapshot: options.localSnapshot,
            localSnapshotVersion: 4,
          });
          if (!migrated && options.fallbackSnapshot) {
            const fallback = migrateLegacySnapshotToV6(options.fallbackSnapshot, 4, options.relation);
            await this.repository.replaceLibrary(fallback.library);
            migrated = fallback;
          }
          if (!migrated) throw new Error("Không tìm thấy dữ liệu note để khởi tạo schema v6");
        }
        const structure = await this.repository.loadNoteStructure();
        if (!structure) throw new Error("Không thể đọc cấu trúc note v6 sau migration");
        const [activeSheetContent, documents] = await Promise.all([
          structure.active.activeSheetId ? this.repository.loadSheetContent(structure.active.activeSheetId) : Promise.resolve(null),
          this.repository.loadDocumentGraph(),
        ]);
        this.publish({
          status: "ready",
          structure,
          documents: documents || EMPTY_SNAPSHOT.documents,
          activeSheetContent,
          pageSheetContents: structure.active.activeSheetId && activeSheetContent
            ? { [structure.active.activeSheetId]: clone(activeSheetContent) }
            : {},
          hydratingSheetId: null,
          hydratingPageId: null,
          dirty: false,
          busy: false,
          error: null,
        });
      } catch (error) {
        this.publish({ status: "error", busy: false, hydratingSheetId: null, hydratingPageId: null, error: errorMessage(error) });
        throw error;
      }
    });
    return this.initialized;
  }

  updateActiveSheetContent(content: SheetContent) {
    const sheetId = this.snapshot.structure?.active.activeSheetId;
    if (this.snapshot.status !== "ready" || !sheetId) return;
    const nextContent = clone(content);
    this.publish({
      activeSheetContent: nextContent,
      pageSheetContents: { ...this.snapshot.pageSheetContents, [sheetId]: clone(nextContent) },
      dirty: true,
      error: null,
    });
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => { void this.flushDraft(); }, 260);
  }

  patchActiveSheetContent(changes: SheetContent) {
    this.updateActiveSheetContent({ ...(this.snapshot.activeSheetContent || {}), ...clone(changes) });
  }

  async flushDraft() {
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    const sheetId = this.snapshot.structure?.active.activeSheetId;
    if (!sheetId || !this.snapshot.dirty || !this.snapshot.activeSheetContent) return;
    const content = clone(this.snapshot.activeSheetContent);
    const revision = this.snapshot.revision;
    await this.commands.saveSheetContent(sheetId, content);
    if (this.snapshot.structure?.active.activeSheetId === sheetId && this.snapshot.revision === revision) {
      this.publish({ dirty: false });
    }
  }

  async flush() {
    await this.flushDraft();
    await this.operationQueue;
    await this.commands.flush();
  }

  private async hydrateCommitted(result: NoteCommandResult, force = false) {
    const documents = await this.repository.loadDocumentGraph() || this.snapshot.documents;
    const nextSheetId = result.active.activeSheetId;
    const currentSheetId = this.snapshot.structure?.active.activeSheetId;
    if (!nextSheetId) {
      this.publish({ structure: result.structure, documents, activeSheetContent: null, pageSheetContents: {}, hydratingSheetId: null, hydratingPageId: null, dirty: false, busy: false });
      return;
    }
    const nextPageId = result.active.activePageId;
    const currentPageId = this.snapshot.structure?.active.activePageId;
    const validSheetIds = new Set(result.structure.sheets.map((sheet) => sheet.id));
    const retainedContents = nextPageId === currentPageId
      ? Object.fromEntries(Object.entries(this.snapshot.pageSheetContents).filter(([id]) => validSheetIds.has(id)))
      : {};
    if (!force && nextSheetId === currentSheetId && this.snapshot.activeSheetContent) {
      this.publish({
        structure: result.structure,
        documents,
        pageSheetContents: { ...retainedContents, [nextSheetId]: clone(this.snapshot.activeSheetContent) },
        hydratingSheetId: null,
        hydratingPageId: null,
        busy: false,
      });
      return;
    }
    this.publish({ structure: result.structure, documents, activeSheetContent: null, pageSheetContents: retainedContents, hydratingSheetId: nextSheetId, hydratingPageId: null, dirty: false });
    const content = await this.repository.loadSheetContent(nextSheetId);
    const stillActive = this.snapshot.structure?.active.activeSheetId === nextSheetId;
    if (stillActive) {
      const resolved = content || {};
      this.publish({
        activeSheetContent: resolved,
        pageSheetContents: { ...this.snapshot.pageSheetContents, [nextSheetId]: clone(resolved) },
        hydratingSheetId: null,
        dirty: false,
        busy: false,
      });
    }
  }

  private mutation<T extends NoteCommandResult>(operation: () => Promise<T>, forceHydrate = false) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const result = await operation();
        await this.hydrateCommitted(result, forceHydrate);
        return result;
      } catch (error) {
        this.publish({ busy: false, hydratingSheetId: null, error: errorMessage(error) });
        throw error;
      }
    });
  }

  openSheet(sheetId: string) {
    return this.serialize(async () => {
      await this.flushDraft();
      const structure = this.snapshot.structure;
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const active = noteContextForSheet(structure, sheetId);
      if (!active) throw new Error(`Không tìm thấy Sheet ${sheetId}`);
      if (active.activeSheetId === structure.active.activeSheetId && this.snapshot.activeSheetContent) return;
      this.publish({ busy: true, hydratingSheetId: sheetId, hydratingPageId: null, activeSheetContent: null, dirty: false, error: null });
      try {
        const result = await this.commands.setActive(active);
        await this.hydrateCommitted(result, true);
      } catch (error) {
        this.publish({ busy: false, hydratingSheetId: null, error: errorMessage(error) });
        throw error;
      }
    });
  }

  openPage(pageId: string, preferredSheetId?: string) {
    const structure = this.snapshot.structure;
    if (!structure) return Promise.reject(new Error("Kho note v6 chưa sẵn sàng"));
    const sheets = ordered(structure.sheets.filter((sheet) => sheet.pageId === pageId));
    const sheet = sheets.find((record) => record.id === preferredSheetId) || sheets[0];
    if (!sheet) return Promise.reject(new Error(`Page ${pageId} chưa có Sheet`));
    return this.openSheet(sheet.id);
  }

  /**
   * Hydrates only the Sheets belonging to one logical Page. This is the read
   * boundary used by continuous view; it never expands to sibling Pages.
   */
  loadPageSheetContents(pageId: string) {
    return this.serialize(async () => {
      await this.flushDraft();
      const structure = this.snapshot.structure;
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const sheets = ordered(structure.sheets.filter((sheet) => sheet.pageId === pageId));
      if (!sheets.length) throw new Error(`Page ${pageId} chưa có Sheet`);
      this.publish({ hydratingPageId: pageId, error: null });
      try {
        const entries = await Promise.all(sheets.map(async (sheet) => [
          sheet.id,
          await this.repository.loadSheetContent(sheet.id) || {},
        ] as const));
        if (this.snapshot.structure?.active.activePageId !== pageId) {
          this.publish({ hydratingPageId: null });
          return;
        }
        const contents = Object.fromEntries(entries);
        const activeSheetId = this.snapshot.structure.active.activeSheetId;
        if (activeSheetId && this.snapshot.activeSheetContent) {
          contents[activeSheetId] = clone(this.snapshot.activeSheetContent);
        }
        this.publish({ pageSheetContents: contents, hydratingPageId: null });
      } catch (error) {
        this.publish({ hydratingPageId: null, error: errorMessage(error) });
        throw error;
      }
    });
  }

  /** Releases continuous-view previews while retaining the sole editable Sheet. */
  releaseInactiveSheetContents() {
    const activeSheetId = this.snapshot.structure?.active.activeSheetId;
    const activeContent = this.snapshot.activeSheetContent;
    this.publish({
      pageSheetContents: activeSheetId && activeContent
        ? { [activeSheetId]: clone(activeContent) }
        : {},
      hydratingPageId: null,
    });
  }

  openSection(sectionId: string) {
    const structure = this.snapshot.structure;
    if (!structure) return Promise.reject(new Error("Kho note v6 chưa sẵn sàng"));
    const activePage = structure.pages.find((page) => page.id === structure.active.activePageId && page.sectionId === sectionId);
    const page = activePage || ordered(structure.pages.filter((record) => record.sectionId === sectionId))[0];
    if (!page) return Promise.reject(new Error(`Section ${sectionId} chưa có Page`));
    return this.openPage(page.id);
  }

  openNotebook(notebookId: string) {
    const structure = this.snapshot.structure;
    if (!structure) return Promise.reject(new Error("Kho note v6 chưa sẵn sàng"));
    const activeSection = structure.sections.find((section) => section.id === structure.active.activeSectionId && section.notebookId === notebookId);
    const section = activeSection || ordered(structure.sections.filter((record) => record.notebookId === notebookId))[0];
    if (!section) return Promise.reject(new Error(`Notebook ${notebookId} chưa có Section`));
    const pages = ordered(structure.pages.filter((record) => record.sectionId === section.id));
    if (pages[0]) return this.openPage(pages[0].id);
    return this.createPage(section.id, "Page mới");
  }

  createNotebook(title: string, content?: SheetContent) {
    return this.mutation(() => this.commands.createNotebook(title, content), true);
  }

  createSection(notebookId: string, title: string) {
    return this.mutation(async () => {
      const result = await this.commands.createSection(notebookId, title);
      return result;
    });
  }

  createPage(sectionId: string, title: string, content?: SheetContent) {
    return this.mutation(() => this.commands.createPage(sectionId, title, content), true);
  }

  createSheet(pageId: string, content?: SheetContent) {
    return this.mutation(() => this.commands.createSheet(pageId, content), true);
  }

  renameNotebook(id: string, title: string) { return this.mutation(() => this.commands.renameNotebook(id, title)); }
  renameSection(id: string, title: string) { return this.mutation(() => this.commands.renameSection(id, title)); }
  renamePage(id: string, title: string) { return this.mutation(() => this.commands.renamePage(id, title)); }
  movePage(id: string, sectionId: string, order: number) { return this.mutation(() => this.commands.movePage(id, sectionId, order)); }
  moveSheet(id: string, pageId: string, order: number) { return this.mutation(() => this.commands.moveSheet(id, pageId, order)); }
  deleteNotebook(id: string, replacementContent?: SheetContent) { return this.mutation(() => this.commands.deleteNotebook(id, replacementContent), true); }
  deleteSection(id: string) { return this.mutation(() => this.commands.deleteSection(id), true); }
  deletePage(id: string, replacementContent?: SheetContent) { return this.mutation(() => this.commands.deletePage(id, replacementContent), true); }
  deleteSheet(id: string) { return this.mutation(() => this.commands.deleteSheet(id), true); }

  async loadNotebookContents(notebookId: string): Promise<SheetContentMap> {
    await this.flushDraft();
    const structure = this.snapshot.structure;
    if (!structure) return {};
    const sectionIds = new Set(structure.sections.filter((section) => section.notebookId === notebookId).map((section) => section.id));
    const pageIds = new Set(structure.pages.filter((page) => sectionIds.has(page.sectionId)).map((page) => page.id));
    const sheets = ordered(structure.sheets.filter((sheet) => pageIds.has(sheet.pageId)));
    const entries = await Promise.all(sheets.map(async (sheet) => [sheet.id, await this.repository.loadSheetContent(sheet.id) || {}] as const));
    return Object.fromEntries(entries);
  }

  /**
   * Reads an explicit Sheet set without publishing it into the live editor.
   * Export uses this boundary so preparing a PDF cannot navigate, replace the
   * active draft owner, or expand the continuous-view cache.
   */
  async loadSheetContents(sheetIds: readonly string[]): Promise<SheetContentMap> {
    await this.flushDraft();
    const structure = this.snapshot.structure;
    if (!structure) return {};
    const knownIds = new Set(structure.sheets.map((sheet) => sheet.id));
    const uniqueIds = [...new Set(sheetIds.filter((sheetId) => knownIds.has(sheetId)))];
    const entries = await Promise.all(uniqueIds.map(async (sheetId) => [
      sheetId,
      await this.repository.loadSheetContent(sheetId) || {},
    ] as const));
    const contents = Object.fromEntries(entries);
    const activeSheetId = this.snapshot.structure?.active.activeSheetId;
    if (activeSheetId && uniqueIds.includes(activeSheetId) && this.snapshot.activeSheetContent) {
      contents[activeSheetId] = clone(this.snapshot.activeSheetContent);
    }
    return contents;
  }

  async loadAllContents(): Promise<SheetContentMap> {
    await this.flushDraft();
    const structure = this.snapshot.structure;
    if (!structure) return {};
    const entries = await Promise.all(structure.sheets.map(async (sheet) => [sheet.id, await this.repository.loadSheetContent(sheet.id) || {}] as const));
    return Object.fromEntries(entries);
  }

  remapDocumentReferences(idMap: ReadonlyMap<string, string>) {
    const mapping = new Map([...idMap.entries()].filter(([from, to]) => from && to && from !== to));
    if (!mapping.size) return Promise.resolve(0);
    return this.serialize(async () => {
      await this.flushDraft();
      const structure = this.snapshot.structure;
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      this.publish({ busy: true, error: null });
      try {
        const loaded = await Promise.all(structure.sheets.map(async (sheet) => [sheet.id, await this.repository.loadSheetContent(sheet.id) || {}] as const));
        const changed = new Map<string, SheetContent>();
        loaded.forEach(([sheetId, content]) => {
          const result = remapDocumentReferencesInContent(content, mapping);
          if (result.changed) changed.set(sheetId, result.content);
        });
        for (const [sheetId, content] of changed) await this.commands.saveSheetContent(sheetId, content);
        const activeSheetId = structure.active.activeSheetId;
        const activeSheetContent = activeSheetId && changed.has(activeSheetId)
          ? clone(changed.get(activeSheetId)!)
          : this.snapshot.activeSheetContent;
        const pageSheetContents = Object.fromEntries(Object.entries(this.snapshot.pageSheetContents).map(([sheetId, content]) => [
          sheetId,
          changed.has(sheetId) ? clone(changed.get(sheetId)!) : content,
        ]));
        this.publish({ activeSheetContent, pageSheetContents, dirty: false, busy: false });
        return changed.size;
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  deleteDocumentFromWorkspace(contextId: string, documentId: string) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const documents = await this.repository.deleteDocumentFromWorkspace(contextId, documentId);
        this.publish({ documents, busy: false });
        return documents;
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  saveDocumentWorkspace(input: SaveDocumentWorkspaceInput) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const documents = await this.repository.saveDocumentWorkspace(input);
        this.publish({ documents, busy: false });
        return documents;
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  deleteDocumentWorkspace(contextId: string) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const documents = await this.repository.deleteDocumentWorkspace(contextId);
        this.publish({ documents, busy: false });
        return documents;
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  replaceDocumentGraph(documents: DocumentGraph) {
    return this.serialize(async () => {
      await this.flushDraft();
      await this.repository.replaceDocumentGraph(documents);
      this.publish({ documents: clone(documents), error: null });
    });
  }

  setPreferences(preferences: LibraryPreferences) {
    return this.serialize(async () => {
      await this.flushDraft();
      await this.repository.setPreferences(clone(preferences));
    });
  }

  async exportLibrary(): Promise<LibraryV6> {
    await this.flush();
    const library = await this.repository.loadLibrary();
    if (!library) throw new Error("Kho note v6 chưa sẵn sàng để xuất");
    return library;
  }

  replaceFromLibrary(library: LibraryV6) {
    const snapshot = clone(library);
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        await this.repository.replaceLibrary(snapshot);
        const verified = await this.repository.loadLibrary();
        if (!verified) throw new Error("Không thể đọc thư viện v6 sau khi khôi phục");
        const structure = verified.notes;
        const documents = verified.documents;
        await this.hydrateCommitted({ structure, active: structure.active }, true);
        this.publish({ documents, busy: false, error: null });
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  replaceFromLegacySnapshot(snapshot: LegacySnapshot, relation: LegacyRelationV2 | undefined = this.legacyRelation) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const migrated = migrateLegacySnapshotToV6(snapshot, 4, relation);
        if (migrated.report.warnings.length) {
          throw new Error(`Không thể khôi phục vì có liên kết chưa bảo toàn: ${migrated.report.warnings.join("; ")}`);
        }
        await this.repository.replaceLibrary(migrated.library);
        const [structure, documents] = await Promise.all([this.repository.loadNoteStructure(), this.repository.loadDocumentGraph()]);
        if (!structure || !documents) throw new Error("Không thể đọc cấu trúc note sau khi khôi phục");
        await this.hydrateCommitted({ structure, active: structure.active }, true);
        this.publish({ documents });
      } catch (error) {
        this.publish({ busy: false, error: errorMessage(error) });
        throw error;
      }
    });
  }

  activeState(): ActiveNoteState | null {
    return this.snapshot.structure?.active || null;
  }
}

export const noteRepository = new IndexedDbNoteRepository();
export const noteStore = new NoteStore(noteRepository);

export function useNoteStoreSnapshot(store: NoteStore = noteStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
