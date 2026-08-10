import { localBinaryStorage, type StoredPdf } from "./local-binary-storage";
import { persistentDocumentWorkspaces, saveDocumentRuntimeSnapshot } from "./document-runtime-storage";
import { noteStore, type NoteStore } from "./note-store";
import { createBlankPage, notePageToSheetContent } from "./note-runtime-adapter";
import {
  DEFAULT_READER,
  createEmptyWorkspace,
  createReaderPlaceholder,
  documentWorkspaceInput,
  type LibraryDocument,
  type LinkedNoteTarget,
  type PersistedLibrary,
  type WorkspaceItem,
  type WorkspaceMode,
} from "./document-runtime-adapter";

export type DocumentNoteDestination =
  | { mode: "none" }
  | { mode: "notebook"; title: string }
  | { mode: "section"; notebookId: string; title: string }
  | { mode: "page"; notebookId: string; sectionId: string; title: string }
  | { mode: "existing"; notebookId: string; target: LinkedNoteTarget };

export type DocumentRuntimeSettings = {
  readerShare: number;
  workspaceMode: WorkspaceMode;
  noteZoom: number;
};

export type DocumentMutationResult = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  workspaceMode: WorkspaceMode;
  savedAt: number;
  message?: string;
  removedDocumentIds?: string[];
};

export type ImportPdfFilesInput = DocumentRuntimeSettings & {
  files: File[];
  saveToLibrary: boolean;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  destination?: DocumentNoteDestination | null;
};

export type SaveTemporaryWorkspaceInput = DocumentRuntimeSettings & {
  workspaceId: string;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  hasActiveNote: boolean;
};

export type RenameWorkspaceInput = DocumentRuntimeSettings & {
  workspaceId: string;
  name: string;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
};

export type DeleteWorkspaceInput = DocumentRuntimeSettings & {
  workspaceId: string;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
};

export type DeleteDocumentInput = DocumentRuntimeSettings & {
  workspaceId: string;
  documentId: string;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
};

export type LinkWorkspaceToNoteInput = DocumentRuntimeSettings & {
  workspaceId: string;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  notebookId: string;
  target: LinkedNoteTarget;
};

type PdfStorage = Pick<typeof localBinaryStorage, "savePdf" | "readPdf" | "deletePdf">;
type RuntimeWriter = (snapshot: PersistedLibrary) => void;

export type DocumentLibraryControllerDependencies = {
  notes?: NoteStore;
  pdfStorage?: PdfStorage;
  saveRuntime?: RuntimeWriter;
  now?: () => number;
  random?: () => number;
};

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export class DocumentLibraryController {
  private ready = false;
  private readonly notes: NoteStore;
  private readonly pdfStorage: PdfStorage;
  private readonly writeRuntime: RuntimeWriter;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly temporaryPdfs = new Map<string, StoredPdf>();

  constructor(dependencies: DocumentLibraryControllerDependencies = {}) {
    this.notes = dependencies.notes || noteStore;
    this.pdfStorage = dependencies.pdfStorage || localBinaryStorage;
    this.writeRuntime = dependencies.saveRuntime || saveDocumentRuntimeSnapshot;
    this.now = dependencies.now || Date.now;
    this.random = dependencies.random || Math.random;
  }

  activate() {
    this.ready = true;
  }

  isReady() {
    return this.ready;
  }

  private requireReady() {
    if (!this.ready) throw new Error("Thư viện tài liệu chưa khởi động xong");
  }

  private sessionId() {
    return `session-${this.now()}-${this.random().toString(16).slice(2)}`;
  }

  private persist(
    workspaces: WorkspaceItem[],
    activeWorkspaceId: string,
    settings: DocumentRuntimeSettings,
  ) {
    const persistent = persistentDocumentWorkspaces(workspaces);
    const activeTemporary = workspaces.find((workspace) => workspace.id === activeWorkspaceId && workspace.kind === "temporary");
    const linkedPersistentWorkspace = activeTemporary?.noteNotebookId
      ? persistent.find((workspace) => workspace.noteNotebookId === activeTemporary.noteNotebookId)
      : undefined;
    const persistedActiveWorkspaceId = persistent.some((workspace) => workspace.id === activeWorkspaceId)
      ? activeWorkspaceId
      : linkedPersistentWorkspace?.id || persistent[0]?.id || "";
    const savedAt = this.now();
    this.writeRuntime({
      workspaces: persistent,
      activeWorkspaceId: persistedActiveWorkspaceId,
      readerShare: settings.readerShare,
      workspaceMode: activeTemporary?.noteNotebookId ? "note" : settings.workspaceMode,
      noteZoom: settings.noteZoom,
      savedAt,
    });
    return savedAt;
  }

  persistRuntime(
    workspaces: WorkspaceItem[],
    activeWorkspaceId: string,
    settings: DocumentRuntimeSettings,
  ) {
    this.requireReady();
    return this.persist(workspaces, activeWorkspaceId, settings);
  }

  async readPdf(documentId: string): Promise<StoredPdf | undefined> {
    const temporary = this.temporaryPdfs.get(documentId);
    if (temporary) return temporary;
    return this.pdfStorage.readPdf(documentId);
  }

  findExistingPdfWorkspace(files: File[], workspaces: WorkspaceItem[]) {
    const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return undefined;
    const documentIds = pdfs.map((file) => `doc-${stableId(`${file.name}:${file.size}:${file.lastModified}`)}`);
    const workspaceId = pdfs.length === 1
      ? `workspace-${documentIds[0]}`
      : `collection-${stableId(documentIds.sort().join(":"))}`;
    return workspaces.find((workspace) => workspace.id === workspaceId);
  }

  private async resolveDestination(destination: DocumentNoteDestination, documentName: string) {
    if (destination.mode === "none") return { notebookId: null, target: null };
    if (destination.mode === "existing") {
      return { notebookId: destination.notebookId, target: destination.target };
    }
    const firstPage = createBlankPage(1);
    if (destination.mode === "notebook") {
      const result = await this.notes.createNotebook(destination.title, notePageToSheetContent(firstPage));
      return {
        notebookId: result.active.activeNotebookId,
        target: { targetType: "page", targetId: result.active.activePageId } as LinkedNoteTarget,
      };
    }
    if (destination.mode === "section") {
      const section = await this.notes.createSection(destination.notebookId, destination.title);
      const result = await this.notes.createPage(section.id, documentName, notePageToSheetContent(firstPage));
      return {
        notebookId: destination.notebookId,
        target: { targetType: "page", targetId: result.active.activePageId } as LinkedNoteTarget,
      };
    }
    const result = await this.notes.createPage(destination.sectionId, destination.title, notePageToSheetContent(firstPage));
    return {
      notebookId: destination.notebookId,
      target: { targetType: "page", targetId: result.active.activePageId } as LinkedNoteTarget,
    };
  }

  async importPdfFiles(input: ImportPdfFilesInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const files = input.files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) throw new Error("Vui lòng chọn tệp PDF");
    const sessionToken = this.sessionId();
    const documents: LibraryDocument[] = files.map((file, index) => ({
      id: input.saveToLibrary
        ? `doc-${stableId(`${file.name}:${file.size}:${file.lastModified}`)}`
        : `temp-doc-${sessionToken}-${index}`,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      reader: { ...DEFAULT_READER },
    }));
    const workspaceId = input.saveToLibrary
      ? files.length === 1
        ? `workspace-${documents[0].id}`
        : `collection-${stableId(documents.map((document) => document.id).sort().join(":"))}`
      : `temporary-${sessionToken}`;
    const existing = input.saveToLibrary ? input.workspaces.find((workspace) => workspace.id === workspaceId) : undefined;
    if (existing) {
      const savedAt = this.persist(input.workspaces, existing.id, { ...input, workspaceMode: "reader" });
      return {
        workspaces: input.workspaces,
        activeWorkspaceId: existing.id,
        workspaceMode: "reader",
        savedAt,
        message: "Đã mở lại PDF trong thư viện",
      };
    }

    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${files[0].name.replace(/\.pdf$/i, "")} +${files.length - 1}`;
    const destination = input.destination || { mode: "none" };
    let warning: string | undefined;

    if (input.saveToLibrary) {
      try {
        await Promise.all(files.map((file, index) => this.pdfStorage.savePdf(documents[index].id, documents[index].name, file)));
      } catch {
        warning = "PDF mở được nhưng chưa lưu đầy đủ trên thiết bị";
      }
    } else {
      this.temporaryPdfs.clear();
      files.forEach((file, index) => this.temporaryPdfs.set(documents[index].id, { blob: file, name: file.name }));
    }

    let selectedNotebookId: string | null = null;
    let selectedTarget: LinkedNoteTarget | null = null;
    try {
      const resolved = await this.resolveDestination(destination, name);
      selectedNotebookId = resolved.notebookId;
      selectedTarget = resolved.target;
    } catch (error) {
      warning = error instanceof Error ? error.message : "Không thể tạo vị trí note";
    }

    const placeholder = createReaderPlaceholder(workspaceId);
    const workspace: WorkspaceItem = {
      id: workspaceId,
      kind: input.saveToLibrary ? (files.length === 1 ? "document" : "collection") : "temporary",
      name,
      documents,
      activeDocumentId: documents[0].id,
      noteNotebookId: selectedNotebookId,
      notebooks: [placeholder],
      activeNotebookId: placeholder.id,
      sourcePage: 1,
    };
    if (input.saveToLibrary) {
      try {
        await this.notes.saveDocumentWorkspace(documentWorkspaceInput(
          workspace,
          selectedTarget,
          { workspaceMode: selectedNotebookId ? "split" : "reader", readerShare: input.readerShare, noteZoom: input.noteZoom },
        ));
      } catch (error) {
        warning = error instanceof Error
          ? `PDF đã lưu nhưng liên kết note chưa ghi được: ${error.message}`
          : "PDF đã lưu nhưng liên kết note chưa ghi được";
      }
    }

    const persistentWorkspaces = input.workspaces.filter((item) => item.kind !== "temporary" && item.id !== workspace.id);
    if (!input.saveToLibrary && selectedNotebookId && !persistentWorkspaces.some((item) => item.noteNotebookId === selectedNotebookId)) {
      const notebookTitle = this.notes.getSnapshot().structure?.notebooks.find((notebook) => notebook.id === selectedNotebookId)?.title || "Ghi chú MedNote";
      const noteWorkspaceId = `relation-note:${selectedNotebookId}`;
      const notePlaceholder = createReaderPlaceholder(noteWorkspaceId);
      persistentWorkspaces.unshift({
        id: noteWorkspaceId,
        kind: "empty",
        name: notebookTitle,
        documents: [],
        activeDocumentId: null,
        noteNotebookId: selectedNotebookId,
        notebooks: [notePlaceholder],
        activeNotebookId: notePlaceholder.id,
        sourcePage: 1,
      });
    }
    const workspaces = [workspace, ...persistentWorkspaces];
    const workspaceMode: WorkspaceMode = selectedNotebookId ? "split" : "reader";
    const savedAt = this.persist(workspaces, workspace.id, {
      readerShare: input.readerShare,
      workspaceMode: input.saveToLibrary ? workspaceMode : selectedNotebookId ? "note" : input.workspaceMode,
      noteZoom: input.noteZoom,
    });
    const success = destination.mode === "none"
      ? input.saveToLibrary
        ? files.length === 1 ? "Đã lưu PDF vào thư viện — chưa tạo note" : "Đã lưu cụm PDF — chưa tạo note"
        : files.length === 1 ? "Đang xem PDF tạm — không lưu, không tạo note" : "Đang xem cụm PDF tạm — không lưu, không tạo note"
      : input.saveToLibrary ? "Đã thêm tài liệu và tạo vị trí note" : "Đã mở PDF tạm; note được lưu độc lập";
    return { workspaces, activeWorkspaceId: workspace.id, workspaceMode, savedAt, message: warning || success };
  }

  async saveTemporaryWorkspace(input: SaveTemporaryWorkspaceInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const temporary = input.workspaces.find((workspace) => workspace.id === input.workspaceId);
    if (!temporary || temporary.kind !== "temporary") throw new Error("Không tìm thấy phiên PDF tạm");
    const documents = temporary.documents.map((document) => ({
      ...document,
      id: `doc-${stableId(`${document.name}:${document.size}:${document.lastModified}`)}`,
    }));
    const idMap = new Map(temporary.documents.map((document, index) => [document.id, documents[index].id]));
    const workspaceId = documents.length === 1
      ? `workspace-${documents[0].id}`
      : `collection-${stableId(documents.map((document) => document.id).sort().join(":"))}`;
    const existing = input.workspaces.find((workspace) => workspace.id === workspaceId);
    if (existing) {
      await this.notes.remapDocumentReferences(idMap);
      const workspaces = input.workspaces.filter((workspace) => workspace.id !== temporary.id);
      this.temporaryPdfs.clear();
      const savedAt = this.persist(workspaces, existing.id, input);
      return {
        workspaces,
        activeWorkspaceId: existing.id,
        workspaceMode: input.workspaceMode,
        savedAt,
        message: "PDF này đã có trong thư viện; nguồn note đã được nối lại",
      };
    }

    try {
      await Promise.all(temporary.documents.map(async (document, index) => {
        const stored = this.temporaryPdfs.get(document.id);
        if (!stored) throw new Error("missing temporary PDF");
        await this.pdfStorage.savePdf(documents[index].id, documents[index].name, stored.blob);
      }));
    } catch {
      throw new Error("Không thể lưu PDF đang xem vào thư viện");
    }

    const placeholder = createReaderPlaceholder(workspaceId);
    const activeDocumentId = temporary.activeDocumentId ? idMap.get(temporary.activeDocumentId) || documents[0].id : documents[0].id;
    const savedWorkspace: WorkspaceItem = {
      ...temporary,
      id: workspaceId,
      kind: documents.length === 1 ? "document" : "collection",
      documents,
      activeDocumentId,
      notebooks: [placeholder],
      activeNotebookId: placeholder.id,
    };
    const structure = this.notes.getSnapshot().structure;
    const linkedPageId = structure && savedWorkspace.noteNotebookId
      ? structure.pages.find((page) => structure.sections.find((section) => section.id === page.sectionId)?.notebookId === savedWorkspace.noteNotebookId)?.id
      : null;
    let graphSaved = false;
    try {
      await this.notes.saveDocumentWorkspace(documentWorkspaceInput(
        savedWorkspace,
        linkedPageId ? { targetType: "page", targetId: linkedPageId } : null,
        { workspaceMode: linkedPageId ? "split" : "reader", readerShare: input.readerShare, noteZoom: input.noteZoom },
      ));
      graphSaved = true;
      await this.notes.remapDocumentReferences(idMap);
    } catch (error) {
      if (graphSaved) await this.notes.deleteDocumentWorkspace(workspaceId).catch(() => undefined);
      await Promise.allSettled(documents.map((document) => this.pdfStorage.deletePdf(document.id)));
      throw new Error(error instanceof Error ? `Không thể hoàn tất lưu PDF: ${error.message}` : "Không thể hoàn tất lưu PDF");
    }

    const workspaces = input.workspaces.map((workspace) => workspace.id === temporary.id ? savedWorkspace : workspace);
    const workspaceMode: WorkspaceMode = input.hasActiveNote ? "split" : "reader";
    const savedAt = this.persist(workspaces, workspaceId, { ...input, workspaceMode });
    this.temporaryPdfs.clear();
    return {
      workspaces,
      activeWorkspaceId: workspaceId,
      workspaceMode,
      savedAt,
      message: input.hasActiveNote
        ? "Đã lưu PDF; nguồn trong note đã được cập nhật"
        : "Đã lưu PDF đang xem vào thư viện — chưa tạo note",
    };
  }

  async renameWorkspace(input: RenameWorkspaceInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const name = input.name.trim().replace(/\.pdf$/i, "").trim();
    if (!name) throw new Error("Tên tài liệu không được để trống");
    const target = input.workspaces.find((workspace) => workspace.id === input.workspaceId);
    if (!target) throw new Error("Không tìm thấy tài liệu");
    const targetDocument = target.kind === "document" && target.documents.length === 1 ? target.documents[0] : null;
    const renamedDocument = targetDocument ? { ...targetDocument, name: `${name}.pdf` } : null;
    const updated: WorkspaceItem = {
      ...target,
      name,
      documents: renamedDocument ? [renamedDocument] : target.documents,
    };
    if (target.kind !== "temporary" && target.documents.length) {
      await this.notes.saveDocumentWorkspace(documentWorkspaceInput(updated, null, input));
    }
    if (renamedDocument) {
      const stored = await this.readPdf(renamedDocument.id);
      if (stored && target.kind !== "temporary") await this.pdfStorage.savePdf(renamedDocument.id, renamedDocument.name, stored.blob);
    }
    const workspaces = input.workspaces.map((workspace) => workspace.id === target.id ? updated : workspace);
    const savedAt = this.persist(workspaces, input.activeWorkspaceId, input);
    return { workspaces, activeWorkspaceId: input.activeWorkspaceId, workspaceMode: input.workspaceMode, savedAt, message: "Đã đổi tên tài liệu" };
  }

  async deleteWorkspace(input: DeleteWorkspaceInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const target = input.workspaces.find((workspace) => workspace.id === input.workspaceId);
    if (!target) throw new Error("Không tìm thấy tài liệu");
    const structure = this.notes.getSnapshot().structure;
    const linkedNotebook = structure?.notebooks.find((notebook) => notebook.id === target.noteNotebookId);
    let remainingIds = new Set(this.notes.getSnapshot().documents.documents.map((document) => document.id));
    if (target.kind !== "temporary") {
      const graph = await this.notes.deleteDocumentWorkspace(target.id);
      remainingIds = new Set(graph.documents.map((document) => document.id));
    }
    if (target.kind === "temporary") {
      target.documents.forEach((document) => this.temporaryPdfs.delete(document.id));
    } else {
      const unreferenced = target.documents.filter((document) => !remainingIds.has(document.id));
      await Promise.allSettled(unreferenced.map((document) => this.pdfStorage.deletePdf(document.id)));
    }
    const removedDocumentIds = target.documents.map((document) => document.id);
    const targetIndex = input.workspaces.findIndex((workspace) => workspace.id === target.id);
    const detachedPlaceholder = createReaderPlaceholder(target.id);
    const detached: WorkspaceItem | null = linkedNotebook ? {
      ...target,
      kind: "empty",
      name: linkedNotebook.title,
      documents: [],
      activeDocumentId: null,
      noteNotebookId: linkedNotebook.id,
      notebooks: [detachedPlaceholder],
      activeNotebookId: detachedPlaceholder.id,
      sourcePage: 1,
    } : null;
    const remaining = input.workspaces.flatMap((workspace) => workspace.id !== target.id ? [workspace] : detached ? [detached] : []);
    const workspaces = remaining.length ? remaining : [createEmptyWorkspace()];
    const wasActive = input.activeWorkspaceId === target.id;
    const activeWorkspaceId = wasActive
      ? detached?.id || workspaces[Math.min(targetIndex, workspaces.length - 1)].id
      : input.activeWorkspaceId;
    const workspaceMode: WorkspaceMode = wasActive ? detached ? "note" : "reader" : input.workspaceMode;
    const savedAt = this.persist(workspaces, activeWorkspaceId, { ...input, workspaceMode });
    const label = target.kind === "collection" ? "cụm tài liệu" : target.kind === "demo" ? "tài liệu mẫu" : "tài liệu";
    return {
      workspaces,
      activeWorkspaceId,
      workspaceMode,
      savedAt,
      removedDocumentIds,
      message: detached ? `Đã xóa ${label}; note đã trở thành note độc lập` : `Đã xóa ${label}`,
    };
  }

  async deleteDocument(input: DeleteDocumentInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const workspace = input.workspaces.find((item) => item.id === input.workspaceId);
    const document = workspace?.documents.find((item) => item.id === input.documentId);
    if (!workspace || !document) throw new Error("Không tìm thấy tài liệu");
    if (workspace.documents.length === 1) return this.deleteWorkspace(input);
    let graph = this.notes.getSnapshot().documents;
    if (workspace.kind !== "temporary") graph = await this.notes.deleteDocumentFromWorkspace(workspace.id, document.id);
    if (workspace.kind === "temporary") this.temporaryPdfs.delete(document.id);
    else if (!graph.documents.some((record) => record.id === document.id)) await this.pdfStorage.deletePdf(document.id).catch(() => undefined);
    const index = workspace.documents.findIndex((record) => record.id === document.id);
    const documents = workspace.documents.filter((record) => record.id !== document.id);
    const activeDocument = documents[Math.min(index, documents.length - 1)];
    const updated = { ...workspace, documents, activeDocumentId: activeDocument.id, sourcePage: activeDocument.reader.page };
    const workspaces = input.workspaces.map((item) => item.id === workspace.id ? updated : item);
    const savedAt = this.persist(workspaces, input.activeWorkspaceId, input);
    return {
      workspaces,
      activeWorkspaceId: input.activeWorkspaceId,
      workspaceMode: input.workspaceMode,
      savedAt,
      removedDocumentIds: [document.id],
      message: "Đã xóa tài liệu khỏi cụm; provenance trong note vẫn được giữ",
    };
  }

  async linkWorkspaceToNote(input: LinkWorkspaceToNoteInput): Promise<DocumentMutationResult> {
    this.requireReady();
    const workspace = input.workspaces.find((item) => item.id === input.workspaceId);
    if (!workspace || !workspace.documents.length) throw new Error("Không tìm thấy tài liệu để liên kết");
    if (workspace.kind !== "temporary") {
      await this.notes.saveDocumentWorkspace(documentWorkspaceInput(workspace, input.target, { ...input, workspaceMode: "split" }));
    }
    const workspaces = input.workspaces.map((item) => item.id === workspace.id ? { ...item, noteNotebookId: input.notebookId } : item);
    const savedAt = this.persist(workspaces, input.activeWorkspaceId, { ...input, workspaceMode: "split" });
    return {
      workspaces,
      activeWorkspaceId: input.activeWorkspaceId,
      workspaceMode: "split",
      savedAt,
      message: "Đã liên kết tài liệu với note",
    };
  }
}

export const documentLibrary = new DocumentLibraryController();
