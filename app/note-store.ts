import { useSyncExternalStore } from "react";
import { IndexedDbNoteRepository } from "./indexeddb-note-repository";
import {
  migrateLegacySnapshotToV6,
  migrateStoredLibraryToV6,
  type LegacyRelationV2,
  type LegacySnapshot,
} from "./note-migration";
import { NoteCommands, type NoteCommandResult } from "./note-commands";
import type { NoteRepository } from "./note-repository";
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
  activeSheetContent: SheetContent | null;
  hydratingSheetId: string | null;
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
  activeSheetContent: null,
  hydratingSheetId: null,
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
        const activeSheetContent = structure.active.activeSheetId
          ? await this.repository.loadSheetContent(structure.active.activeSheetId)
          : null;
        this.publish({ status: "ready", structure, activeSheetContent, hydratingSheetId: null, dirty: false, busy: false, error: null });
      } catch (error) {
        this.publish({ status: "error", busy: false, hydratingSheetId: null, error: errorMessage(error) });
        throw error;
      }
    });
    return this.initialized;
  }

  updateActiveSheetContent(content: SheetContent) {
    if (this.snapshot.status !== "ready" || !this.snapshot.structure?.active.activeSheetId) return;
    this.publish({ activeSheetContent: clone(content), dirty: true, error: null });
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
    const nextSheetId = result.active.activeSheetId;
    const currentSheetId = this.snapshot.structure?.active.activeSheetId;
    if (!nextSheetId) {
      this.publish({ structure: result.structure, activeSheetContent: null, hydratingSheetId: null, dirty: false, busy: false });
      return;
    }
    if (!force && nextSheetId === currentSheetId && this.snapshot.activeSheetContent) {
      this.publish({ structure: result.structure, hydratingSheetId: null, busy: false });
      return;
    }
    this.publish({ structure: result.structure, activeSheetContent: null, hydratingSheetId: nextSheetId, dirty: false });
    const content = await this.repository.loadSheetContent(nextSheetId);
    const stillActive = this.snapshot.structure?.active.activeSheetId === nextSheetId;
    if (stillActive) this.publish({ activeSheetContent: content || {}, hydratingSheetId: null, dirty: false, busy: false });
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
      this.publish({ busy: true, hydratingSheetId: sheetId, activeSheetContent: null, dirty: false, error: null });
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
    return this.createPage(section.id, "Page mới", {});
  }

  createNotebook(title: string, content: SheetContent = {}) {
    return this.mutation(() => this.commands.createNotebook(title, content), true);
  }

  createSection(notebookId: string, title: string) {
    return this.mutation(async () => {
      const result = await this.commands.createSection(notebookId, title);
      return result;
    });
  }

  createPage(sectionId: string, title: string, content: SheetContent = {}) {
    return this.mutation(() => this.commands.createPage(sectionId, title, content), true);
  }

  createSheet(pageId: string, content: SheetContent = {}) {
    return this.mutation(() => this.commands.createSheet(pageId, content), true);
  }

  renameNotebook(id: string, title: string) { return this.mutation(() => this.commands.renameNotebook(id, title)); }
  renameSection(id: string, title: string) { return this.mutation(() => this.commands.renameSection(id, title)); }
  renamePage(id: string, title: string) { return this.mutation(() => this.commands.renamePage(id, title)); }
  movePage(id: string, sectionId: string, order: number) { return this.mutation(() => this.commands.movePage(id, sectionId, order)); }
  moveSheet(id: string, pageId: string, order: number) { return this.mutation(() => this.commands.moveSheet(id, pageId, order)); }
  deleteNotebook(id: string, replacementContent: SheetContent = {}) { return this.mutation(() => this.commands.deleteNotebook(id, replacementContent), true); }
  deleteSection(id: string) { return this.mutation(() => this.commands.deleteSection(id), true); }
  deletePage(id: string, replacementContent: SheetContent = {}) { return this.mutation(() => this.commands.deletePage(id, replacementContent), true); }
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

  async loadAllContents(): Promise<SheetContentMap> {
    await this.flushDraft();
    const structure = this.snapshot.structure;
    if (!structure) return {};
    const entries = await Promise.all(structure.sheets.map(async (sheet) => [sheet.id, await this.repository.loadSheetContent(sheet.id) || {}] as const));
    return Object.fromEntries(entries);
  }

  replaceFromLegacySnapshot(snapshot: LegacySnapshot, relation?: LegacyRelationV2) {
    return this.serialize(async () => {
      await this.flushDraft();
      this.publish({ busy: true, error: null });
      try {
        const migrated = migrateLegacySnapshotToV6(snapshot, 4, relation);
        if (migrated.report.warnings.length) {
          throw new Error(`Không thể khôi phục vì có liên kết chưa bảo toàn: ${migrated.report.warnings.join("; ")}`);
        }
        await this.repository.replaceLibrary(migrated.library);
        const structure = await this.repository.loadNoteStructure();
        if (!structure) throw new Error("Không thể đọc cấu trúc note sau khi khôi phục");
        await this.hydrateCommitted({ structure, active: structure.active }, true);
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

export function readLegacyRelationV2(): LegacyRelationV2 | undefined {
  try {
    const raw = localStorage.getItem("mednote-relations-v2");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LegacyRelationV2;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
