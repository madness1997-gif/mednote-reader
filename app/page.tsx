"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfRect } from "./pdf-domain";
import { PdfReaderController } from "./pdf-reader-controller";
import { PdfNavigationControllerProvider, usePdfNavigationController } from "./pdf-navigation-controller";
import { DriveControllerProvider, useDriveController } from "./drive-controller";
import { resolveDocumentSource } from "./note-document-source";
import type { PDFiumDocument } from "./pdfium-renderer";
import { localBinaryStorage } from "./local-binary-storage";
import { useLiveController } from "./live-controller";
import { bootstrapMedNote, type BootstrapResult } from "./app-bootstrap";
import { documentLibrary } from "./document-library-controller";
import { projectLibrary } from "./library-projection";
import { firstAidThemeInlineStyle } from "./first-aid-theme";
import { AppTopBar } from "./ui/app-top-bar";
import { DrivePanel } from "./ui/drive-panel";
import { LibraryPanel } from "./ui/library-panel";
import { PdfNavigationRail } from "./ui/pdf-navigation-rail";
import { ReaderPane, type ReaderPaneViewModel } from "./ui/pdf-reader-pane";
import { PdfSelectionMenu } from "./ui/pdf-selection-menu";
import { NotePane, type NotePaneViewModel } from "./ui/note-pane";
import { NoteNavigationHost } from "./ui/note-navigation-host";
import { SplitDivider } from "./ui/split-divider";
import { WorkspaceShell } from "./ui/workspace-shell";
import type { NotePanel, NoteSheetViewMode } from "./ui/ui-contracts";
import { useNoteCanvasController } from "./use-note-canvas-controller";
import { useDocumentWorkspaceController } from "./use-document-workspace-controller";
import { useNoteEditorController } from "./use-note-editor-controller";
import { useReaderInteractionController, type ReaderInteractionController } from "./use-reader-interaction-controller";
import { NOTE_ZOOM_PRESETS, useNoteZoomController } from "./note-zoom-controller";
import { useWorkspaceLayoutController } from "./use-workspace-layout-controller";
import type { VirtualizedPdfPagesHandle } from "./virtualized-pdf-pages";
import {
  NotePaneControllersProvider,
  ReaderPaneControllersProvider,
  type NotePaneControllers,
  type ReaderPaneControllers,
} from "./workspace-controllers-context";
import { noteStore, useNoteStoreSnapshot } from "./note-store";
import { ordered } from "./note-domain";
import {
  createBlankPage, escapeHtml, normalizeText,
  notePageFromSheet, notePageToSheetContent, notebookFromStructure, plainTextToRichHtml,
  type NoteExcerpt, type NotePage, type NotePageContentPatch,
} from "./note-runtime-adapter";
import {
  DEFAULT_READER, NOTE_RUNTIME_WORKSPACE_ID, createNoteRuntimeWorkspace,
  normalizeReader, type ReaderState,
  type WorkspaceItem,
} from "./document-runtime-adapter";

const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const NOTE_SHEET_VIEW_KEY = "mednote-note-sheet-view-v1";
const noteStorePendingPage: NotePage = {
  ...createBlankPage(null),
  id: "note-store-pending",
  title: "Đang mở ghi chú",
};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function Home() {
  const noteState = useNoteStoreSnapshot();
  const documentStageRef = useRef<HTMLDivElement>(null);
  const continuousPdfPagesRef = useRef<VirtualizedPdfPagesHandle>(null);
  const noteStageRef = useRef<HTMLDivElement>(null);
  const [demoReader, setDemoReader] = useState<ReaderState>({ ...DEFAULT_READER, page: 126 });
  const [sourceFocus, setSourceFocus] = useState<{ documentId: string; page: number; rect: PdfRect } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createNoteRuntimeWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(NOTE_RUNTIME_WORKSPACE_ID);
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const pdfReader = useMemo(() => new PdfReaderController({
    readBlob: async (documentId) => (await documentLibrary.readPdf(documentId))?.blob ?? null,
  }), []);
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string; lastModified: number } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfiumDocument, setPdfiumDocument] = useState<PDFiumDocument | null>(null);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const [noteZoom, setNoteZoom] = useState(1);
  const [noteSheetViewMode, setNoteSheetViewMode] = useState<NoteSheetViewMode>(() => {
    try { return localStorage.getItem(NOTE_SHEET_VIEW_KEY) === "continuous" ? "continuous" : "single"; } catch { return "single"; }
  });
  const pendingNoteScrollRef = useRef<{ sheetId: string; scrollTop: number } | null>(null);
  const [toast, setToast] = useState("Đã tự lưu");
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notePanel, setNotePanel] = useState<NotePanel>(null);

  workspacesRef.current = workspaces;
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const localSavedAtRef = useRef(Date.now());

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeNotebook = noteState.structure
    ? notebookFromStructure(noteState.structure, noteState.structure.active.activeNotebookId, noteState.pageSheetContents, noteState.activeSheetContent)
    : null;
  const notePages = activeNotebook?.pages ?? [noteStorePendingPage];
  const activeNote = notePages.find((page) => page.id === activeNotebook?.activePageId) ?? notePages[0];
  const activeNoteHydrating = noteState.status !== "ready"
    || !activeNotebook
    || noteState.hydratingSheetId === activeNote.id
    || activeNote.__mednoteLazyPage === true;
  const activeLogicalPage = noteState.structure?.pages.find((page) => page.id === noteState.structure?.active.activePageId);
  const activePageSheets = noteState.structure
    ? ordered(noteState.structure.sheets.filter((sheet) => sheet.pageId === noteState.structure?.active.activePageId))
    : [];
  const activePageSheetKey = activePageSheets.map((sheet) => sheet.id).join("|");
  const activeSheetIndex = Math.max(0, activePageSheets.findIndex((sheet) => sheet.id === activeNote.id));
  const continuousNotes = activePageSheets.map((sheet) => notePages.find((page) => page.id === sheet.id)
    || notePageFromSheet(sheet.id, activeLogicalPage?.title || "Page mới", noteState.pageSheetContents[sheet.id], !noteState.pageSheetContents[sheet.id]));
  const hasActiveNote = Boolean(noteState.structure?.active.activeSheetId);
  const activeDocument = activeWorkspace.documents.find((document) => document.id === activeWorkspace.activeDocumentId) ?? activeWorkspace.documents[0] ?? null;
  const onPdfPageRendered = useCallback(() => {
    if (activeDocument) pdfReader.notifyVisiblePageRendered(activeDocument.id);
  }, [activeDocument?.id, pdfReader]);
  const libraryProjection = useMemo(() => noteState.structure
    ? projectLibrary(noteState.structure, noteState.documents)
    : { notes: [], documents: [] }, [noteState.documents, noteState.structure]);
  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;
  const resolveExcerptSource = useCallback((excerpt: NoteExcerpt) => resolveDocumentSource(excerpt, noteState.documents, activeWorkspace.documents), [activeWorkspace.documents, noteState.documents]);
  const updateActiveNote = (changes: NotePageContentPatch) => {
    if (activeNoteHydrating || activeNote.id !== noteState.structure?.active.activeSheetId) {
      setToast("Đang mở nội dung tờ note…");
      return;
    }
    noteStore.updateActiveSheetContent(notePageToSheetContent({ ...activeNote, ...changes }));
  };
  const noteScopeKey = `${activeWorkspace.id}:${activeNotebook?.id ?? "note-store-pending"}:${activeNote.id}`;
  const noteEditor = useNoteEditorController({
    editorScopeKey: noteScopeKey,
    defaultText: activeNote.text,
    notePanel,
    notify: setToast,
  });
  const readerInteractionRef = useRef<ReaderInteractionController | null>(null);
  const workspaceLayout = useWorkspaceLayoutController({
    activeWorkspaceKind: activeWorkspace.kind,
    hasActiveNote,
    notify: setToast,
    onEnterReader: () => {
      setNotePanel(null);
      noteEditor.setTextInsertPopover(null);
    },
    onPrepareWorkspaceModeChange: (mode) => readerInteractionRef.current?.prepareWorkspaceModeChange(mode),
  });
  const { readerShare, workspaceMode, workspaceModeRef } = workspaceLayout;
  const noteCanvas = useNoteCanvasController({
    activeDocument,
    activeNote,
    canvasScopeKey: noteScopeKey,
    clearPdfSelection: () => readerInteractionRef.current?.clearSelection(),
    editor: noteEditor,
    getPdfSelection: () => readerInteractionRef.current?.pdfSelection ?? null,
    notePanel,
    noteZoom,
    notify: setToast,
    setNotePanel,
    setPdfTool: (tool) => readerInteractionRef.current?.setPdfTool(tool),
    updateActiveNote,
  });
  const activeReader = activeDocument?.reader ?? demoReader;
  const sourcePage = activeDocument?.reader.page ?? demoReader.page;
  const sourceZoom = activeReader.zoom;
  const fitMode = activeReader.fitMode;
  const rotation = activeReader.rotation;
  const viewMode = activeReader.viewMode;
  const documentName = activeWorkspace.name;
  const totalPages = currentPdfDocument?.numPages ?? (activeDocument ? 1 : 482);

  const updateActiveWorkspace = (updater: (workspace: WorkspaceItem) => WorkspaceItem) => {
    setWorkspaces((items) => items.map((workspace) => workspace.id === activeWorkspaceId ? updater(workspace) : workspace));
  };

  const updateReader = (updater: (reader: ReaderState) => ReaderState) => {
    if (!activeDocument) {
      setDemoReader((reader) => updater(reader));
      return;
    }
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      documents: workspace.documents.map((document) => document.id === activeDocument.id
        ? { ...document, reader: updater(normalizeReader(document.reader)) }
        : document),
    }));
  };

  const setSourcePage = (value: number | ((page: number) => number)) => {
    const next = pdfReader.clampPage(typeof value === "function" ? value(sourcePage) : value, totalPages);
    if (activeDocument) {
      updateActiveWorkspace((workspace) => ({
        ...workspace,
        sourcePage: next,
        documents: workspace.documents.map((document) => document.id === activeDocument.id
          ? { ...document, reader: { ...normalizeReader(document.reader), page: next } }
          : document),
      }));
    } else {
      setDemoReader((reader) => ({ ...reader, page: next }));
      updateActiveWorkspace((workspace) => ({ ...workspace, sourcePage: next }));
    }
  };

  const setSourceZoom = (value: number | ((zoom: number) => number)) => {
    updateReader((reader) => ({ ...reader, zoom: pdfReader.clampZoom(typeof value === "function" ? value(reader.zoom) : value) }));
  };

  const goToPage = (page: number, smooth = true) => {
    const next = pdfReader.clampPage(page, totalPages);
    setSourcePage(next);
    if (viewMode === "continuous") {
      window.requestAnimationFrame(() => {
        continuousPdfPagesRef.current?.scrollToPage(next, smooth);
      });
    }
  };

  const switchDocument = (documentId: string, page?: number, rect?: PdfRect) => {
    const selection = pdfReader.selectDocumentTarget(activeWorkspace.documents, documentId, page);
    if (!selection) return;
    const nextPage = selection.page;
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      activeDocumentId: documentId,
      sourcePage: nextPage,
      documents: workspace.documents.map((document) => document.id === documentId
        ? { ...document, reader: { ...normalizeReader(document.reader), page: nextPage } }
        : document),
    }));
    readerInteractionRef.current?.clearSelection();
    if (rect) {
      setSourceFocus({ documentId, page: nextPage, rect });
      window.setTimeout(() => setSourceFocus((focus) => focus?.documentId === documentId && focus.page === nextPage ? null : focus), 3600);
    }
  };

  const loadedSourcePages = useMemo(() => currentPdfDocument
    ? Array.from({ length: currentPdfDocument.numPages }, (_, index) => index + 1)
    : null, [currentPdfDocument]);
  const sourcePages = loadedSourcePages ?? (activeDocument ? [sourcePage] : activeWorkspace.kind === "demo" ? DEMO_PAGES : []);

  const readerInteraction = useReaderInteractionController({
    activeDocument,
    activeReader,
    currentPdfDocument,
    documentStageRef,
    getContinuousScrollAnchor: (inset) => continuousPdfPagesRef.current?.getScrollAnchor(inset) ?? null,
    pinContinuousScrollAnchor: () => continuousPdfPagesRef.current?.pinScrollAnchor(),
    releaseContinuousScrollAnchor: () => continuousPdfPagesRef.current?.releaseScrollAnchor(),
    restoreContinuousScrollAnchor: (anchor) => continuousPdfPagesRef.current?.restoreScrollAnchor(anchor) ?? false,
    inkColor: noteCanvas.inkColor,
    inkWidth: noteCanvas.inkWidth,
    notify: setToast,
    onAddTextExcerpt: (selection, textOverride) => noteCanvas.addTextExcerpt(selection, textOverride),
    onCancelCrop: noteCanvas.cancelFirstAidCrop,
    onCrop: noteCanvas.addImageExcerpt,
    pdfReader,
    setInkColor: noteCanvas.setInkColor,
    setInkWidth: noteCanvas.setInkWidth,
    setSourcePage,
    setSourceZoom,
    sourcePage,
    sourceZoom,
    updateReader,
    viewMode,
    workspaceMode,
    workspaceModeRef,
  });
  readerInteractionRef.current = readerInteraction;
  const { bookmarks, pdfAnnotations, removePdfAnnotation } = readerInteraction;
  const documentWorkspace = useDocumentWorkspaceController({
    activeDocument,
    activeWorkspace,
    activeWorkspaceIdRef,
    activateTextTool: () => noteCanvas.setActiveTool("text"),
    dropDocumentHistories: readerInteraction.dropDocumentHistories,
    hasActiveNote,
    libraryProjection,
    localSavedAtRef,
    noteZoom,
    notify: setToast,
    readerShare,
    ready,
    resolveExcerptSource,
    setActiveWorkspaceId,
    setLibraryOpen,
    setNotePanel,
    setSourceFocus,
    setWorkspaceMode: workspaceLayout.setWorkspaceMode,
    setWorkspaces,
    sourcePage,
    switchDocument,
    workspacesRef,
    workspaceModeRef,
  });

  useEffect(() => {
    let cancelled = false;
    const applyBootstrapResult = (result: BootstrapResult) => {
      documentLibrary.activate();
      setWorkspaces(result.workspaces);
      setActiveWorkspaceId(result.activeWorkspaceId);
      workspaceLayout.restoreLayout(result);
      setNoteZoom(result.noteZoom);
      localSavedAtRef.current = result.savedAt;
      if (result.warnings?.length) setToast(result.warnings.join(" "));
      setReady(true);
    };
    void bootstrapMedNote()
      .then((result) => {
        if (!cancelled) applyBootstrapResult(result);
      })
      .catch((error) => {
        if (cancelled) return;
        documentLibrary.activate();
        setToast(error instanceof Error ? error.message : "Không thể khởi động MedNote");
        setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  // MEDNOTE_AUTOSAVE_EFFECT_START
  useEffect(() => {
    if (!ready) return;
    try {
      const savedAt = Date.now();
      localSavedAtRef.current = savedAt;
      documentLibrary.persistRuntime(workspaces, activeWorkspaceId, { readerShare, workspaceMode, noteZoom });
    } catch { /* storage may be unavailable in private browsing */ }
  }, [workspaces, activeWorkspaceId, readerShare, workspaceMode, noteZoom, ready]);
  // MEDNOTE_AUTOSAVE_EFFECT_END

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPdfSource(null);
    setPdfDocument(null);
    setPdfiumDocument(null);
    setLoadedDocumentId(null);
    if (!activeDocument) {
      setPdfStatus("idle");
      return;
    }
    setPdfStatus("loading");
    void documentLibrary.readPdf(activeDocument.id).then((stored) => {
      if (cancelled) return;
      if (!stored) {
        setPdfStatus("error");
        return;
      }
      setPdfSource({ blob: stored.blob, documentId: activeDocument.id, lastModified: activeDocument.lastModified });
    }).catch(() => !cancelled && setPdfStatus("error"));
    return () => { cancelled = true; };
  }, [activeDocument?.id, ready]);

  useEffect(() => pdfReader.subscribe(({ status, session }) => {
    setPdfDocument(session?.pdf ?? null);
    setPdfiumDocument(session?.pdfium ?? null);
    setLoadedDocumentId(session?.documentId ?? null);
    setPdfStatus(status === "loading" ? "loading" : status === "error" ? "error" : "idle");
  }), [pdfReader]);

  useEffect(() => () => {
    void pdfReader.close();
  }, [pdfReader]);

  useEffect(() => {
    if (!pdfSource) {
      void pdfReader.close();
      return;
    }
    let cancelled = false;
    void pdfReader.open({ documentId: pdfSource.documentId, lastModified: pdfSource.lastModified, blob: pdfSource.blob }).then((session) => {
      if (!session || cancelled) return;
      setWorkspaces((items) => items.map((workspace) => ({
        ...workspace,
        sourcePage: workspace.id === activeWorkspaceId
          ? pdfReader.clampPage(workspace.documents.find((item) => item.id === pdfSource.documentId)?.reader.page ?? workspace.sourcePage, session.pdf.numPages)
          : workspace.sourcePage,
        documents: workspace.documents.map((item) => item.id === pdfSource.documentId
          ? { ...item, reader: { ...normalizeReader(item.reader), page: pdfReader.clampPage(item.reader?.page ?? 1, session.pdf.numPages) } }
          : item),
      })));
      setToast(`Đã mở ${session.pdf.numPages} trang`);
    }).catch(() => {
      if (!cancelled) setToast("Không thể mở PDF này");
    });
    return () => { cancelled = true; };
  }, [activeWorkspaceId, pdfReader, pdfSource]);

  useEffect(() => {
    if (!toast || toast === "Đã tự lưu") return;
    const timer = window.setTimeout(() => setToast("Đã tự lưu"), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try { localStorage.setItem(NOTE_SHEET_VIEW_KEY, noteSheetViewMode); } catch { /* Local preference is optional. */ }
  }, [noteSheetViewMode]);

  useEffect(() => {
    const pageId = noteState.structure?.active.activePageId;
    if (noteState.status !== "ready" || !pageId) return;
    if (noteSheetViewMode !== "continuous") {
      noteStore.releaseInactiveSheetContents();
      return;
    }
    void noteStore.loadPageSheetContents(pageId).catch((error) => {
      setToast(error instanceof Error ? error.message : "Không thể tải các tờ trong Page");
    });
  }, [activePageSheetKey, noteSheetViewMode, noteState.status, noteState.structure?.active.activePageId]);

  useEffect(() => {
    const pending = pendingNoteScrollRef.current;
    if (!pending || pending.sheetId !== activeNote.id) return;
    const restore = () => {
      if (pendingNoteScrollRef.current !== pending) return;
      if (noteStageRef.current) noteStageRef.current.scrollTop = pending.scrollTop;
    };
    restore();
    let attempts = 0;
    const timer = window.setInterval(() => {
      restore();
      attempts += 1;
      if (attempts < 6) return;
      window.clearInterval(timer);
      if (pendingNoteScrollRef.current === pending) pendingNoteScrollRef.current = null;
    }, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeNote.id, activeNoteHydrating]);

  const activateContinuousSheet = async (sheetId: string) => {
    if (sheetId === activeNote.id) return;
    pendingNoteScrollRef.current = { sheetId, scrollTop: noteStageRef.current?.scrollTop ?? 0 };
    try {
      await noteStore.openSheet(sheetId);
      setToast("Đã chuyển tờ; nội dung tờ trước đã được lưu");
    } catch (error) {
      pendingNoteScrollRef.current = null;
      setToast(error instanceof Error ? error.message : "Không thể mở tờ note");
    }
  };

  const hasMeaningfulLocalData = () => Boolean(noteStore.getSnapshot().structure?.sheets.length)
    || workspaces.some((workspace) => workspace.kind === "document" || workspace.kind === "collection");

  const drive = useDriveController({
    ready,
    workspaces,
    activeWorkspaceId,
    readerShare,
    workspaceMode,
    noteZoom,
    activeSheetContent: noteState.activeSheetContent,
    noteStructure: noteState.structure,
    createSnapshot: () => ({
      workspaces: workspacesRef.current,
      activeWorkspaceId: activeWorkspaceIdRef.current,
      readerShare,
      workspaceMode: workspaceModeRef.current,
      noteZoom,
      savedAt: localSavedAtRef.current,
    }),
    applyRestore: ({ snapshot }) => {
      workspacesRef.current = snapshot.workspaces;
      activeWorkspaceIdRef.current = snapshot.activeWorkspaceId;
      setWorkspaces(snapshot.workspaces);
      setActiveWorkspaceId(snapshot.activeWorkspaceId);
      workspaceLayout.restoreLayout(snapshot);
      setNoteZoom(snapshot.noteZoom);
    },
    hasMeaningfulLocalData,
    onSnapshotSaved: (savedAt) => { localSavedAtRef.current = savedAt; },
    notify: setToast,
  });

  const pdfNavigation = usePdfNavigationController({
    reader: pdfReader,
    activeDocument,
    activeWorkspace,
    currentDocument: currentPdfDocument,
    loadedDocumentId,
    sourcePage,
    sourcePages,
    bookmarks,
    annotations: pdfAnnotations,
    goToPage,
    switchDocument,
    updateReader,
    removeAnnotation: removePdfAnnotation,
    notify: setToast,
  });

  const exportAnnotatedPdf = async (mode: "download" | "print") => {
    if (!activeDocument) {
      setToast("Chưa có PDF để xuất");
      return;
    }
    setToast(mode === "print" ? "Đang chuẩn bị bản in…" : "Đang tạo PDF có chú thích…");
    try {
      const stored = await documentLibrary.readPdf(activeDocument.id);
      if (!stored) throw new Error("Không tìm thấy PDF gốc trên thiết bị");
      const { exportAnnotatedPdf } = await import("./pdf-document-export");
      const blob = await exportAnnotatedPdf({ blob: stored.blob, annotations: pdfAnnotations });
      const url = URL.createObjectURL(blob);
      if (mode === "download") {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${activeDocument.name.replace(/\.pdf$/i, "")}-annotated.pdf`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1200);
        setToast("Đã xuất PDF có chú thích");
        return;
      }
      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.opacity = "0";
      frame.src = url;
      frame.onload = () => window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 500);
      document.body.appendChild(frame);
      window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
      setToast("Đã mở hộp thoại in");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xuất PDF");
    }
  };

  const exportNotebook = async () => {
    setToast("Đang tạo tệp note…");
    const structure = noteState.structure;
    if (!structure || !activeNotebook) return setToast("Kho note chưa sẵn sàng");
    let exportNotebook = activeNotebook;
    try {
      const contents = await noteStore.loadNotebookContents(activeNotebook.id);
      const hydratedNotebook = notebookFromStructure(structure, activeNotebook.id, contents);
      if (!hydratedNotebook) throw new Error("Notebook không còn tồn tại");
      exportNotebook = hydratedNotebook;
    } catch {
      setToast("Không thể nạp đầy đủ các tờ để xuất");
      return;
    }
    const pagesHtml: string[] = [];
    for (const [index, page] of exportNotebook.pages.entries()) {
      const text = normalizeText(page.text);
      const font = noteEditor.TEXT_FONTS.find((option) => option.id === text.font) ?? noteEditor.TEXT_FONTS[0];
      const firstAidStyle = page.paper.template === "first-aid" ? `${firstAidThemeInlineStyle(page.paper.color)};background:var(--fa-paper-bg);padding:12px` : "";
      const autoTextColor = page.paper.template === "first-aid" ? "var(--fa-ink,#24343c)" : "#24343c";
      const textStyle = `${firstAidStyle};font-family:${font.family};font-size:${text.size}px;color:${text.color === "auto" ? autoTextColor : text.color};font-weight:${text.bold ? 700 : 400};font-style:${text.italic ? "italic" : "normal"};text-decoration:${text.underline ? "underline" : "none"};text-align:${text.align}`;
      const excerptsHtml: string[] = [];
      for (const excerpt of page.excerpts) {
        let content = excerpt.kind === "text" ? `<blockquote>${excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")}</blockquote>` : "";
        if (excerpt.kind === "image" && excerpt.assetId) {
          const blob = await localBinaryStorage.readAsset(excerpt.assetId);
          if (blob) content = `<img src="${await blobToDataUrl(blob)}" alt="Hình trích từ PDF">`;
        }
        const source = resolveExcerptSource(excerpt);
        const caption = excerpt.sourceKind === "manual"
          ? excerpt.annotationKind === "callout" ? "Callout" : "Hộp chữ"
          : `${escapeHtml(source?.displayName ?? "PDF đã xóa")} — trang ${source?.page ?? excerpt.page ?? 1}${source && !source.available ? " · nguồn không còn trong thư viện" : ""}`;
        excerptsHtml.push(`<figure>${content}<figcaption>${caption}</figcaption></figure>`);
      }
      pagesHtml.push(`<section><h2>${index + 1}. ${escapeHtml(page.title)}</h2><div class="body" style="${textStyle}">${page.bodyHtml ?? plainTextToRichHtml(page.body)}</div>${excerptsHtml.join("")}</section>`);
    }
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(exportNotebook.title)}</title><style>body{max-width:820px;margin:40px auto;padding:0 24px;color:#24343c;font:16px/1.6 system-ui}h1{color:#0e6b70}section{padding:24px 0;border-top:1px solid #d8e1e5}.body{white-space:normal}figure{margin:20px 0;padding:14px;border-left:4px solid #0e6b70;background:#f4f8f8}blockquote{margin:0;font-style:italic}img{max-width:100%;height:auto}figcaption{margin-top:8px;color:#60737d;font-size:13px}</style></head><body><h1>${escapeHtml(exportNotebook.title)}</h1>${pagesHtml.join("")}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportNotebook.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "MedNote"}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Đã xuất note kèm nguồn");
  };

  useEffect(() => {
    setNotePanel(null);
  }, [activeNote.id, activeNotebook?.id, activeWorkspace.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        workspaceLayout.setWorkspaceMode("reader");
        pdfNavigation.openSearch();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "p" && activeDocument) {
        event.preventDefault();
        void exportAnnotatedPdf("print");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === "s" && activeDocument) {
        event.preventDefault();
        void exportAnnotatedPdf("download");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        setSourceZoom((zoom) => zoom + .1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        setSourceZoom((zoom) => zoom - .1);
        return;
      }
      if (!isTyping && event.key === "ArrowLeft" && viewMode === "single") goToPage(sourcePage - 1);
      if (!isTyping && event.key === "ArrowRight" && viewMode === "single") goToPage(sourcePage + 1);
      if (event.key === "Escape") {
        readerInteraction.clearSelection();
        workspaceLayout.setWorkspaceMode("split");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const openLibraryNotebook = async (notebookId: string) => {
    try {
      await noteStore.openNotebook(notebookId);
      const noteRuntime = workspacesRef.current.find((workspace) => workspace.id === NOTE_RUNTIME_WORKSPACE_ID);
      if (noteRuntime) {
        activeWorkspaceIdRef.current = noteRuntime.id;
        setActiveWorkspaceId(noteRuntime.id);
      }
      workspaceLayout.setWorkspaceMode("note");
      setLibraryOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể mở Notebook");
    }
  };

  const noteZoomPercent = Math.round(noteZoom * 100);
  const setNoteViewZoom = (value: number) => setNoteZoom(Math.max(.5, Math.min(2, value)));
  const fitNoteToView = () => {
    const available = (noteStageRef.current?.clientWidth ?? noteCanvas.basePaperMaxWidth) - 72;
    setNoteViewZoom(available / noteCanvas.basePaperMaxWidth);
  };
  useNoteZoomController(noteStageRef, noteZoom, setNoteViewZoom, fitNoteToView);
  const contextDrive = useLiveController(drive);
  const contextPdfNavigation = useLiveController(pdfNavigation);
  const contextDocuments = useLiveController(documentWorkspace);
  const contextLayout = useLiveController(workspaceLayout);
  const contextNoteCanvas = useLiveController(noteCanvas);
  const contextNoteEditor = useLiveController(noteEditor);
  const contextReaderInteraction = useLiveController(readerInteraction);
  const readerPaneViewModel: ReaderPaneViewModel = {
    toolbar: { exportAnnotatedPdf, setSourceZoom, sourceZoom, totalPages },
    stage: { continuousPagesRef: continuousPdfPagesRef, documentStageRef, fitMode, onPdfPageRendered, pdfStatus, pdfiumDocument, ready, rotation, sourceFocus, sourceZoom, updateReader, viewMode },
  };
  const notePaneViewModel: NotePaneViewModel = {
    openLinkedSheet: async (sheetId) => {
      pendingNoteScrollRef.current = null;
      await noteStore.openSheet(sheetId);
    },
    toolbar: { activeNote, exportNotebook, fitNoteToView, notePanel, noteSheetViewMode, noteZoom, noteZoomPercent, setNotePanel, setNoteSheetViewMode, setNoteViewZoom, zoomPresets: NOTE_ZOOM_PRESETS },
    stage: { activateContinuousSheet, activeLogicalPage, activeNote, activeNoteHydrating, activeSheetIndex, continuousNotes, notePanel, noteSheetViewMode, noteStageRef, noteState, noteZoom, resolveExcerptSource },
  };
  const readerPaneControllers = useMemo<ReaderPaneControllers>(() => ({
    documents: contextDocuments,
    layout: contextLayout,
    readerInteraction: contextReaderInteraction,
  }), [contextDocuments, contextLayout, contextReaderInteraction]);
  const notePaneControllers = useMemo<NotePaneControllers>(() => ({
    documents: contextDocuments,
    layout: contextLayout,
    noteCanvas: contextNoteCanvas,
    noteEditor: contextNoteEditor,
  }), [contextDocuments, contextLayout, contextNoteCanvas, contextNoteEditor]);

  return (
    <DriveControllerProvider controller={contextDrive}>
    <PdfNavigationControllerProvider controller={contextPdfNavigation}>
    <main className="app-shell">
      <input ref={documentWorkspace.previewPdfInputRef} data-pdf-input="preview" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={documentWorkspace.handlePreviewPdfInputChange} />
      <input ref={documentWorkspace.libraryPdfInputRef} data-pdf-input="library" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={documentWorkspace.handleLibraryPdfInputChange} />
      <AppTopBar scope={{ activeWorkspace, documentName, documents: documentWorkspace, layout: workspaceLayout, ready, setLibraryOpen, toast }} />

      {drive.panelOpen && (
        <DrivePanel />
      )}

      {libraryOpen && (
        <LibraryPanel
          activeDocumentContextId={activeWorkspace.id}
          activeNotebookId={noteState.structure?.active.activeNotebookId || null}
          documents={documentWorkspace}
          libraryProjection={libraryProjection}
          ready={ready}
          onClose={() => setLibraryOpen(false)}
          onOpenNotebook={openLibraryNotebook}
        />
      )}

      <PdfSelectionMenu controller={readerInteraction} />

      <WorkspaceShell layout={workspaceLayout} pdfRailVisible={pdfNavigation.railVisible} pdfRailTab={pdfNavigation.railTab} pdfRail={null} reader={null} divider={null} note={null} noteNavigation={null}>
        <PdfNavigationRail />

        <ReaderPaneControllersProvider controllers={readerPaneControllers}>
          <ReaderPane viewModel={readerPaneViewModel} />
        </ReaderPaneControllersProvider>

        <SplitDivider layout={workspaceLayout} />

        <NotePaneControllersProvider controllers={notePaneControllers}>
          <NotePane viewModel={notePaneViewModel} />
        </NotePaneControllersProvider>
        {workspaceLayout.showNoteSidebar && <NoteNavigationHost layout={workspaceLayout} />}
      </WorkspaceShell>
    </main>
    </PdfNavigationControllerProvider>
    </DriveControllerProvider>
  );
}
