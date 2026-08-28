import { useRef, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import { documentLibrary, type DocumentMutationResult } from "./document-library-controller";
import type { ResolvedDocumentSource } from "./note-document-source";
import type { PdfRect } from "./pdf-domain";
import type { LibraryProjection } from "./library-projection";
import { requestNoteDestination } from "./mednote-dialog";
import { ordered } from "./note-domain";
import { createBlankPage, notePageToSheetContent, type NoteExcerpt } from "./note-runtime-adapter";
import { noteStore } from "./note-store";
import {
  NOTE_RUNTIME_WORKSPACE_ID,
  normalizeReader,
  type LibraryDocument,
  type WorkspaceItem,
  type WorkspaceMode,
} from "./document-runtime-adapter";
import type { NotePanel } from "./ui/ui-contracts";

type CurrentRef<T> = { current: T };

export type UseDocumentWorkspaceControllerOptions = {
  activeDocument: LibraryDocument | null;
  activeWorkspace: WorkspaceItem;
  activeWorkspaceIdRef: CurrentRef<string>;
  activateTextTool: () => void;
  dropDocumentHistories: (documentIds: string[]) => void;
  hasActiveNote: boolean;
  libraryProjection: LibraryProjection;
  localSavedAtRef: CurrentRef<number>;
  noteZoom: number;
  notify: (message: string) => void;
  readerShare: number;
  ready: boolean;
  resolveExcerptSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  setNotePanel: Dispatch<SetStateAction<NotePanel>>;
  setSourceFocus: Dispatch<SetStateAction<{ documentId: string; page: number; rect: PdfRect } | null>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  setWorkspaces: Dispatch<SetStateAction<WorkspaceItem[]>>;
  sourcePage: number;
  switchDocument: (documentId: string, page?: number, rect?: PdfRect) => void;
  workspacesRef: CurrentRef<WorkspaceItem[]>;
  workspaceModeRef: CurrentRef<WorkspaceMode>;
};

export type DocumentWorkspaceController = {
  activeWorkspaceHasLinkedNote: boolean;
  createLinkedNotebook: () => Promise<void>;
  deleteActiveDocument: () => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  handleLibraryPdfInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreviewPdfInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  libraryPdfInputRef: RefObject<HTMLInputElement | null>;
  openExcerptSource: (excerpt: NoteExcerpt) => void;
  openLibraryDocument: (workspaceId: string) => Promise<void>;
  openLibraryPdfPicker: () => void;
  openPreviewPdfPicker: () => void;
  previewPdfInputRef: RefObject<HTMLInputElement | null>;
  renameLibraryDocument: (workspaceId: string, name: string) => Promise<void>;
  saveTemporaryWorkspace: () => Promise<void>;
};

export function useDocumentWorkspaceController({
  activeDocument,
  activeWorkspace,
  activeWorkspaceIdRef,
  activateTextTool,
  dropDocumentHistories,
  hasActiveNote,
  libraryProjection,
  localSavedAtRef,
  noteZoom,
  notify,
  readerShare,
  ready,
  resolveExcerptSource,
  setActiveWorkspaceId,
  setLibraryOpen,
  setNotePanel,
  setSourceFocus,
  setWorkspaceMode,
  setWorkspaces,
  sourcePage,
  switchDocument,
  workspacesRef,
  workspaceModeRef,
}: UseDocumentWorkspaceControllerOptions): DocumentWorkspaceController {
  const previewPdfInputRef = useRef<HTMLInputElement>(null);
  const libraryPdfInputRef = useRef<HTMLInputElement>(null);
  const activeWorkspaceLinkedNotebookIds = activeWorkspace.kind === "temporary"
    ? activeWorkspace.noteNotebookId ? [activeWorkspace.noteNotebookId] : []
    : libraryProjection.documents.find((item) => item.id === activeWorkspace.id)?.linkedNotebookIds || [];

  const applyDocumentMutation = (result: DocumentMutationResult) => {
    workspacesRef.current = result.workspaces;
    activeWorkspaceIdRef.current = result.activeWorkspaceId;
    workspaceModeRef.current = result.workspaceMode;
    localSavedAtRef.current = result.savedAt;
    setWorkspaces(result.workspaces);
    setActiveWorkspaceId(result.activeWorkspaceId);
    setWorkspaceMode(result.workspaceMode);
    if (result.removedDocumentIds?.length) dropDocumentHistories(result.removedDocumentIds);
    if (result.message) notify(result.message);
  };

  const handlePdfFiles = async (files: File[], saveToLibrary: boolean) => {
    const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      notify("Vui lòng chọn tệp PDF");
      return;
    }
    if (!ready) {
      notify("Thư viện tài liệu đang khởi động");
      return;
    }
    const name = pdfs.length === 1
      ? pdfs[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${pdfs[0].name.replace(/\.pdf$/i, "")} +${pdfs.length - 1}`;
    const noteStructure = noteStore.getSnapshot().structure;
    const existing = saveToLibrary ? documentLibrary.findExistingPdfWorkspace(pdfs, workspacesRef.current) : undefined;
    const requestedDestination = existing ? { mode: "none" as const } : await requestNoteDestination({
      documentLabel: name,
      savedToLibrary: saveToLibrary,
      notebooks: ordered(noteStructure?.notebooks || []).map((notebook) => ({
        id: notebook.id,
        title: notebook.title,
        sections: ordered((noteStructure?.sections || []).filter((section) => section.notebookId === notebook.id))
          .map((section) => ({ id: section.id, title: section.title })),
      })),
    });
    try {
      const result = await documentLibrary.importPdfFiles({
        files: pdfs,
        saveToLibrary,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        destination: requestedDestination || { mode: "none" },
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      applyDocumentMutation(result);
      setLibraryOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể mở PDF");
    }
  };

  const handlePdfInputChange = (event: ChangeEvent<HTMLInputElement>, saveToLibrary: boolean) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void handlePdfFiles(files, saveToLibrary);
  };

  const saveTemporaryWorkspace = async () => {
    if (activeWorkspace.kind !== "temporary") return;
    try {
      applyDocumentMutation(await documentLibrary.saveTemporaryWorkspace({
        workspaceId: activeWorkspace.id,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        hasActiveNote,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu PDF đang xem vào thư viện");
    }
  };

  const createLinkedNotebook = async () => {
    const existingNotebooks = noteStore.getSnapshot().structure?.notebooks || [];
    const title = activeWorkspace.documents.length
      ? `Ghi chú — ${activeWorkspace.name}`
      : `Sổ ghi chú ${existingNotebooks.length + 1}`;
    const page = createBlankPage(activeWorkspace.documents.length ? sourcePage : 1);
    try {
      const result = await noteStore.createNotebook(title, notePageToSheetContent(page));
      if (activeWorkspace.documents.length) {
        applyDocumentMutation(await documentLibrary.linkWorkspaceToNote({
          workspaceId: activeWorkspace.id,
          workspaces: workspacesRef.current,
          activeWorkspaceId: activeWorkspaceIdRef.current,
          notebookId: result.active.activeNotebookId,
          target: { targetType: "page", targetId: result.active.activePageId },
          readerShare,
          workspaceMode: workspaceModeRef.current,
          noteZoom,
        }));
      } else {
        const noteRuntime = workspacesRef.current.find((workspace) => workspace.id === NOTE_RUNTIME_WORKSPACE_ID);
        if (noteRuntime && activeWorkspaceIdRef.current !== noteRuntime.id) {
          activeWorkspaceIdRef.current = noteRuntime.id;
          setActiveWorkspaceId(noteRuntime.id);
        }
      }
      activateTextTool();
      workspaceModeRef.current = activeWorkspace.documents.length ? "split" : "note";
      setWorkspaceMode(workspaceModeRef.current);
      notify(activeWorkspace.documents.length ? "Đã tạo Notebook cho tài liệu" : "Đã tạo sổ ghi chú mới");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tạo Notebook");
    }
  };

  const openLibraryDocument = async (workspaceId: string) => {
    const item = libraryProjection.documents.find((document) => document.id === workspaceId);
    const workspace = workspacesRef.current.find((candidate) => candidate.id === workspaceId);
    if (!item || !workspace) {
      notify("Document runtime chưa sẵn sàng");
      return;
    }
    try {
      const currentNotebookId = noteStore.getSnapshot().structure?.active.activeNotebookId || null;
      const linkedNotebookId = currentNotebookId && item.linkedNotebookIds.includes(currentNotebookId)
        ? currentNotebookId
        : item.linkedNotebookIds[0] || null;
      if (linkedNotebookId) await noteStore.openNotebook(linkedNotebookId);
      activeWorkspaceIdRef.current = workspace.id;
      setActiveWorkspaceId(workspace.id);
      workspaceModeRef.current = "reader";
      setWorkspaceMode("reader");
      setLibraryOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể mở tài liệu");
    }
  };

  const renameLibraryDocument = async (workspaceId: string, name: string) => {
    try {
      applyDocumentMutation(await documentLibrary.renameWorkspace({
        workspaceId,
        name,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể đổi tên tài liệu");
      throw error;
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const target = workspacesRef.current.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const linkedNotebookCount = target.kind === "temporary"
      ? target.noteNotebookId ? 1 : 0
      : libraryProjection.documents.find((item) => item.id === target.id)?.linkedNotebookIds.length || 0;
    const targetLabel = target.kind === "collection" ? "cụm tài liệu" : target.kind === "demo" ? "tài liệu mẫu" : "tài liệu";
    if (!window.confirm(`Xóa ${targetLabel} “${target.name}”? ${linkedNotebookCount ? `Các Notebook đang liên kết (${linkedNotebookCount}) vẫn được giữ nguyên trong Ghi chú.` : "Thao tác này chỉ xóa bản PDF đã lưu."}`)) return;
    try {
      applyDocumentMutation(await documentLibrary.deleteWorkspace({
        workspaceId,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      }));
      setNotePanel(null);
      setLibraryOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể tháo liên kết tài liệu");
    }
  };

  const deleteActiveDocument = async () => {
    if (!activeDocument) return;
    if (activeWorkspace.documents.length === 1) {
      await deleteWorkspace(activeWorkspace.id);
      return;
    }
    if (!window.confirm(`Xóa tài liệu “${activeDocument.name}” khỏi cụm? Các sổ note chung của cụm sẽ được giữ lại.`)) return;
    try {
      applyDocumentMutation(await documentLibrary.deleteDocument({
        workspaceId: activeWorkspace.id,
        documentId: activeDocument.id,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể xóa tài liệu khỏi cụm");
    }
  };

  const openExcerptSource = (excerpt: NoteExcerpt) => {
    const source = resolveExcerptSource(excerpt);
    if (!source?.documentId || !source.page) return;
    if (!source.available) {
      notify("Tài liệu nguồn không còn trong thư viện");
      return;
    }
    const sourceWorkspace = workspacesRef.current.find((workspace) => workspace.documents.some((document) => document.id === source.documentId));
    if (!sourceWorkspace) {
      notify("Tài liệu nguồn không còn trong thư viện");
      return;
    }
    if (sourceWorkspace.id === activeWorkspace.id) {
      switchDocument(source.documentId, source.page, source.rect);
    } else {
      const nextPage = source.page;
      const nextWorkspaces = workspacesRef.current.map((workspace) => workspace.id === sourceWorkspace.id ? {
        ...workspace,
        activeDocumentId: source.documentId,
        sourcePage: nextPage,
        documents: workspace.documents.map((document) => document.id === source.documentId
          ? { ...document, reader: { ...normalizeReader(document.reader), page: nextPage } }
          : document),
      } : workspace);
      workspacesRef.current = nextWorkspaces;
      activeWorkspaceIdRef.current = sourceWorkspace.id;
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(sourceWorkspace.id);
      if (source.rect) {
        setSourceFocus({ documentId: source.documentId, page: nextPage, rect: source.rect });
        window.setTimeout(() => setSourceFocus((focus) => focus?.documentId === source.documentId && focus.page === nextPage ? null : focus), 3600);
      }
    }
    workspaceModeRef.current = "split";
    setWorkspaceMode("split");
    notify(`Đã quay lại ${source.displayName} · trang ${source.page}`);
  };

  return {
    activeWorkspaceHasLinkedNote: activeWorkspaceLinkedNotebookIds.length > 0,
    createLinkedNotebook,
    deleteActiveDocument,
    deleteWorkspace,
    handleLibraryPdfInputChange: (event) => handlePdfInputChange(event, true),
    handlePreviewPdfInputChange: (event) => handlePdfInputChange(event, false),
    libraryPdfInputRef,
    openExcerptSource,
    openLibraryDocument,
    openLibraryPdfPicker: () => libraryPdfInputRef.current?.click(),
    openPreviewPdfPicker: () => previewPdfInputRef.current?.click(),
    previewPdfInputRef,
    renameLibraryDocument,
    saveTemporaryWorkspace,
  };
}
