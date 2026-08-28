"use client";

import {
  Blend,
  BookOpen,
  Copy,
  Crop,
  Eraser,
  Hand,
  Highlighter,
  Languages,
  MessageSquareText,
  MousePointer2,
  Move,
  NotebookTabs,
  PaintBucket,
  PenTool,
  RefreshCw,
  Signature,
  Shapes,
  Square,
  Stamp,
  Strikethrough,
  TextSelect,
  Type,
  Underline,
  Volume2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfAnnotation, PdfMarkupAnnotation, PdfRect, PdfSelection, PdfTool } from "./pdf-domain";
import { PdfReaderController, zoomAroundAnchor } from "./pdf-reader-controller";
import { PdfNavigationControllerProvider, usePdfNavigationController } from "./pdf-navigation-controller";
import {
  addPdfMarkup as addPdfMarkupCommand,
  deletePdfAnnotation as deletePdfAnnotationCommand,
  emptyPdfAnnotationHistory,
  redoPdfAnnotations as redoPdfAnnotationCommand,
  replacePdfPageAnnotations as replacePdfPageAnnotationCommand,
  undoPdfAnnotations as undoPdfAnnotationCommand,
  type PdfAnnotationHistory,
} from "./pdf-annotation-session";
import { DriveControllerProvider, useDriveController } from "./drive-controller";
import { resolveDocumentSource } from "./note-document-source";
import {
  lookupEnglishVietnamese,
  oxfordLookupUrl,
  type EnglishVietnameseLookup,
} from "./dictionary";
import type { PDFiumDocument } from "./pdfium-renderer";
import { localBinaryStorage } from "./local-binary-storage";
import { bootstrapMedNote, type BootstrapResult } from "./app-bootstrap";
import { documentLibrary, type DocumentMutationResult } from "./document-library-controller";
import { projectLibrary } from "./library-projection";
import { requestNoteDestination } from "./mednote-dialog";
import { firstAidThemeInlineStyle } from "./first-aid-theme";
import { AppTopBar } from "./ui/app-top-bar";
import { DrivePanel } from "./ui/drive-panel";
import { LibraryPanel } from "./ui/library-panel";
import { PdfNavigationRail } from "./ui/pdf-navigation-rail";
import { ReaderPane } from "./ui/pdf-reader-pane";
import { NotePane } from "./ui/note-pane";
import { NoteNavigationHost } from "./ui/note-navigation-host";
import { SplitDivider } from "./ui/split-divider";
import { WorkspaceShell } from "./ui/workspace-shell";
import type { NotePanel, NoteSheetViewMode, PdfHistory, PdfPanel } from "./ui/ui-contracts";
import { useNoteCanvasController } from "./use-note-canvas-controller";
import { useNoteEditorController } from "./use-note-editor-controller";
import { useNoteToolbar } from "./use-note-toolbar";
import { useNoteZoomController } from "./note-zoom-controller";
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
  type WorkspaceItem, type WorkspaceMode,
} from "./document-runtime-adapter";

type DictionaryLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  sourceText: string;
  result: EnglishVietnameseLookup | null;
  error: string | null;
};

const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const NOTE_SHEET_VIEW_KEY = "mednote-note-sheet-view-v1";
const NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-hidden";
const LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-v6-hidden";
const NOTE_ZOOM_PRESETS = [50, 60, 70, 75, 80, 85, 90, 100, 110, 120, 125, 130, 140, 150, 175, 200];

const PDF_TOOLS: { id: PdfTool; label: string; shortLabel: string; icon: typeof MousePointer2 }[] = [
  { id: "smart", label: "Thông minh — kéo trên chữ để chọn, kéo khoảng trắng để di chuyển; giữ Space để kéo trang", shortLabel: "Thông minh", icon: MousePointer2 },
  { id: "pan", label: "Bàn tay — kéo trang", shortLabel: "Kéo", icon: Hand },
  { id: "select", label: "Chọn và sao chép chữ", shortLabel: "Chọn chữ", icon: TextSelect },
  { id: "highlight", label: "Tô sáng chữ", shortLabel: "Tô sáng", icon: Highlighter },
  { id: "area-highlight", label: "Tô một vùng bất kỳ — dùng cho công thức, hình, bảng hoặc PDF scan", shortLabel: "Tô vùng", icon: PaintBucket },
  { id: "underline", label: "Gạch chân chữ", shortLabel: "Gạch chân", icon: Underline },
  { id: "strikeout", label: "Gạch ngang chữ", shortLabel: "Gạch ngang", icon: Strikethrough },
  { id: "squiggly", label: "Gạch lượn sóng dưới chữ", shortLabel: "Lượn sóng", icon: Blend },
  { id: "pen", label: "Viết trên PDF", shortLabel: "Bút", icon: PenTool },
  { id: "eraser", label: "Tẩy mọi chú thích đã tạo trên PDF", shortLabel: "Tẩy", icon: Eraser },
  { id: "crop", label: "Cắt hình hoặc bảng sang note", shortLabel: "Cắt", icon: Crop },
  { id: "note", label: "Đặt ghi chú dán", shortLabel: "Ghi chú", icon: MessageSquareText },
  { id: "text", label: "Chèn chữ trực tiếp lên PDF", shortLabel: "Chữ", icon: Type },
  { id: "rectangle", label: "Vẽ hình chữ nhật", shortLabel: "Chữ nhật", icon: Square },
  { id: "ellipse", label: "Vẽ hình elip", shortLabel: "Elip", icon: Shapes },
  { id: "arrow", label: "Vẽ mũi tên", shortLabel: "Mũi tên", icon: Move },
  { id: "stamp", label: "Đóng dấu lên PDF", shortLabel: "Đóng dấu", icon: Stamp },
  { id: "signature", label: "Đặt chữ ký lên PDF", shortLabel: "Chữ ký", icon: Signature },
];

const noteStorePendingPage: NotePage = {
  ...createBlankPage(null),
  id: "note-store-pending",
  title: "Đang mở ghi chú",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const previewPdfInputRef = useRef<HTMLInputElement>(null);
  const libraryPdfInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const documentStageRef = useRef<HTMLDivElement>(null);
  const noteStageRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const readerScrollPositionRef = useRef<{ top: number; left: number; anchorPage: number; anchorOffset: number } | null>(null);
  const pendingReaderScrollRestoreRef = useRef(false);
  const restoringReaderScrollRef = useRef(false);
  const [pdfHighlightColor, setPdfHighlightColor] = useState("#f6d96b");
  const [demoReader, setDemoReader] = useState<ReaderState>({ ...DEFAULT_READER, page: 126 });
  const [pdfTool, setPdfTool] = useState<PdfTool>("smart");
  const [pdfTextDraft, setPdfTextDraft] = useState("Ghi chú");
  const [pdfStampDraft, setPdfStampDraft] = useState("ĐÃ XEM");
  const [pdfSignatureDraft, setPdfSignatureDraft] = useState("Ký tên");
  const [pdfHistory, setPdfHistory] = useState<PdfHistory>({});
  const [pdfSelection, setPdfSelection] = useState<PdfSelection | null>(null);
  const [dictionaryLookup, setDictionaryLookup] = useState<DictionaryLookupState>({ status: "idle", sourceText: "", result: null, error: null });
  const dictionaryAbortRef = useRef<AbortController | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
  const workspaceModeRef = useRef<WorkspaceMode>(workspaceMode);
  const lastWorkspacePaneRef = useRef<"reader" | "note">("reader");
  const lastReaderFocusRef = useRef<HTMLElement | null>(null);
  const lastNoteFocusRef = useRef<HTMLElement | null>(null);
  const pendingWorkspaceFocusRef = useRef<"reader" | "note" | null>(null);
  const [sourceFocus, setSourceFocus] = useState<{ documentId: string; page: number; rect: PdfRect } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createNoteRuntimeWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(NOTE_RUNTIME_WORKSPACE_ID);
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const pdfReader = useMemo(() => new PdfReaderController({
    readBlob: async (documentId) => (await documentLibrary.readPdf(documentId))?.blob ?? null,
  }), []);
  const pdfWheelAccumulatorRef = useRef(0);
  const pdfWheelZoomingRef = useRef(false);
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string; lastModified: number } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfiumDocument, setPdfiumDocument] = useState<PDFiumDocument | null>(null);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const [readerShare, setReaderShare] = useState(50);
  const [noteZoom, setNoteZoom] = useState(1);
  const [noteSheetViewMode, setNoteSheetViewMode] = useState<NoteSheetViewMode>(() => {
    try { return localStorage.getItem(NOTE_SHEET_VIEW_KEY) === "continuous" ? "continuous" : "single"; } catch { return "single"; }
  });
  const pendingNoteScrollRef = useRef<{ sheetId: string; scrollTop: number } | null>(null);
  const [toast, setToast] = useState("Đã tự lưu");
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showNoteSidebar, setShowNoteSidebar] = useState(() => {
    try {
      const preference = localStorage.getItem(NOTE_SIDEBAR_PREFERENCE_KEY);
      return (preference ?? localStorage.getItem(LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY)) !== "1";
    } catch { return true; }
  });
  const [notePanel, setNotePanel] = useState<NotePanel>(null);
  const [pdfPanel, setPdfPanel] = useState<PdfPanel>(null);

  workspacesRef.current = workspaces;
  activeWorkspaceIdRef.current = activeWorkspaceId;
  workspaceModeRef.current = workspaceMode;
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
  const activeWorkspaceLinkedNotebookIds = activeWorkspace.kind === "temporary"
    ? activeWorkspace.noteNotebookId ? [activeWorkspace.noteNotebookId] : []
    : libraryProjection.documents.find((item) => item.id === activeWorkspace.id)?.linkedNotebookIds || [];
  const activeWorkspaceHasLinkedNote = activeWorkspaceLinkedNotebookIds.length > 0;
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
  const noteCanvas = useNoteCanvasController({
    activeDocument,
    activeNote,
    canvasScopeKey: noteScopeKey,
    editor: noteEditor,
    notePanel,
    noteZoom,
    notify: setToast,
    pdfSelection,
    setNotePanel,
    setPdfSelection,
    setPdfTool,
    updateActiveNote,
  });
  const { addImageExcerpt, addTextExcerpt, cancelFirstAidCrop, inkColor, inkWidth, setInkColor, setInkWidth } = noteCanvas;
  const activeReader = activeDocument?.reader ?? demoReader;
  const sourcePage = activeDocument?.reader.page ?? demoReader.page;
  const sourceZoom = activeReader.zoom;
  const fitMode = activeReader.fitMode;
  const rotation = activeReader.rotation;
  const viewMode = activeReader.viewMode;
  const bookmarks = activeReader.bookmarks;
  const pdfAnnotations = activeReader.annotations;
  const pdfAnnotationText = pdfTool === "stamp" ? pdfStampDraft : pdfTool === "signature" ? pdfSignatureDraft : pdfTextDraft;
  const isPdfHighlightTool = pdfTool === "highlight" || pdfTool === "area-highlight";
  const pdfPanelColor = isPdfHighlightTool ? pdfHighlightColor : inkColor;
  const updatePdfPanelColor = (color: string) => isPdfHighlightTool ? setPdfHighlightColor(color) : setInkColor(color);
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
        documentStageRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
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
    setPdfSelection(null);
    if (rect) {
      setSourceFocus({ documentId, page: nextPage, rect });
      window.setTimeout(() => setSourceFocus((focus) => focus?.documentId === documentId && focus.page === nextPage ? null : focus), 3600);
    }
  };

  const sourcePages = useMemo(() => {
    if (!currentPdfDocument) return activeDocument ? [sourcePage] : activeWorkspace.kind === "demo" ? DEMO_PAGES : [];
    return Array.from({ length: currentPdfDocument.numPages }, (_, index) => index + 1);
  }, [activeDocument, activeWorkspace.kind, currentPdfDocument, sourcePage]);

  useEffect(() => {
    let cancelled = false;
    const applyBootstrapResult = (result: BootstrapResult) => {
      documentLibrary.activate();
      setWorkspaces(result.workspaces);
      setActiveWorkspaceId(result.activeWorkspaceId);
      setReaderShare(result.readerShare);
      setWorkspaceMode(result.workspaceMode);
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

  const choosePdfTool = (tool: PdfTool) => {
    setPdfTool(tool);
    if (tool !== "crop") cancelFirstAidCrop();
    if (["pen", "highlight", "area-highlight", "underline", "strikeout", "squiggly", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(tool)) {
      setPdfPanel((panel) => panel === "ink" && pdfTool === tool ? null : "ink");
    } else {
      setPdfPanel(null);
    }
  };

  const pdfHistoryKey = activeDocument?.id ?? "demo";

  const applyPdfAnnotationResult = (result: { annotations: PdfAnnotation[]; history: PdfAnnotationHistory }) => {
    setPdfHistory((state) => ({ ...state, [pdfHistoryKey]: result.history }));
    updateReader((reader) => ({ ...reader, annotations: result.annotations }));
  };

  const addPdfMarkup = (kind: PdfMarkupAnnotation["kind"], selection: PdfSelection | null = pdfSelection) => {
    if (!selection || !activeDocument) return;
    const color = kind === "highlight" || kind === "area-highlight" ? pdfHighlightColor : kind === "underline" || kind === "squiggly" ? inkColor : "#c94b50";
    const annotation: PdfMarkupAnnotation = {
      id: uid(`pdf-${kind}`),
      kind,
      page: selection.page,
      color,
      rects: selection.rects,
      text: selection.text,
      createdAt: Date.now(),
    };
    applyPdfAnnotationResult(addPdfMarkupCommand(pdfAnnotations, annotation, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
    window.getSelection()?.removeAllRanges();
    setPdfSelection(null);
    setToast(kind === "highlight" ? "Đã tô sáng" : kind === "underline" ? "Đã gạch chân" : kind === "squiggly" ? "Đã gạch lượn sóng" : "Đã gạch ngang");
  };

  const copyPdfSelection = async () => {
    if (!pdfSelection) return;
    try {
      await navigator.clipboard.writeText(pdfSelection.text);
      setToast("Đã sao chép đoạn chọn");
    } catch {
      setToast("Trình duyệt không cho phép sao chép tự động");
    }
  };

  const handlePdfSelection = (selection: PdfSelection | null) => {
    if (!selection) {
      setPdfSelection(null);
      return;
    }
    if (pdfTool === "highlight" || pdfTool === "underline" || pdfTool === "strikeout" || pdfTool === "squiggly") {
      addPdfMarkup(pdfTool, selection);
      return;
    }
    setPdfSelection(selection);
  };

  useEffect(() => {
    dictionaryAbortRef.current?.abort();
    dictionaryAbortRef.current = null;
    setDictionaryLookup({
      status: "idle",
      sourceText: pdfSelection?.text.replace(/\s+/g, " ").trim() ?? "",
      result: null,
      error: null,
    });
  }, [pdfSelection?.text]);

  const requestDictionaryLookup = () => {
    if (!pdfSelection?.text || dictionaryLookup.status === "loading") return;
    const sourceText = pdfSelection.text.replace(/\s+/g, " ").trim();
    dictionaryAbortRef.current?.abort();
    const controller = new AbortController();
    dictionaryAbortRef.current = controller;
    setDictionaryLookup({ status: "loading", sourceText, result: null, error: null });
    void lookupEnglishVietnamese(sourceText, controller.signal).then((result) => {
      if (!controller.signal.aborted) setDictionaryLookup({ status: "ready", sourceText, result, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted && (error as Error).name !== "AbortError") {
        setDictionaryLookup({ status: "error", sourceText, result: null, error: error instanceof Error ? error.message : "Chưa thể tra từ điển." });
      }
    });
  };

  const playDictionaryAudio = () => {
    const audioUrl = dictionaryLookup.result?.dictionary?.audioUrl;
    if (!audioUrl) return;
    void new Audio(audioUrl).play().catch(() => setToast("Trình duyệt chưa cho phép phát âm thanh"));
  };

  const copyTranslation = async () => {
    const translation = dictionaryLookup.result?.translation;
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setToast("Đã sao chép bản dịch đề xuất");
    } catch {
      setToast("Trình duyệt không cho phép sao chép tự động");
    }
  };

  const openOxfordLookup = () => {
    if (!pdfSelection) return;
    window.open(oxfordLookupUrl(pdfSelection.text), "_blank", "noopener,noreferrer");
  };

  const commitPdfPageAnnotations = (page: number, nextPage: PdfAnnotation[], previousPage: PdfAnnotation[]) => {
    applyPdfAnnotationResult(replacePdfPageAnnotationCommand(pdfAnnotations, page, nextPage, previousPage, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
  };

  const undoPdf = () => {
    const result = undoPdfAnnotationCommand(pdfAnnotations, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory());
    if (result.annotations === pdfAnnotations) return;
    applyPdfAnnotationResult(result);
    setToast("Đã hoàn tác chú thích PDF");
  };

  const redoPdf = () => {
    const result = redoPdfAnnotationCommand(pdfAnnotations, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory());
    if (result.annotations === pdfAnnotations) return;
    applyPdfAnnotationResult(result);
    setToast("Đã làm lại chú thích PDF");
  };

  const removePdfAnnotation = (annotationId: string) => {
    applyPdfAnnotationResult(deletePdfAnnotationCommand(pdfAnnotations, annotationId, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
    setToast("Đã xóa chú thích PDF");
  };

  const toggleBookmark = () => {
    const exists = bookmarks.includes(sourcePage);
    updateReader((reader) => ({
      ...reader,
      bookmarks: exists ? reader.bookmarks.filter((page) => page !== sourcePage) : [...reader.bookmarks, sourcePage].sort((a, b) => a - b),
    }));
    setToast(exists ? `Đã bỏ đánh dấu trang ${sourcePage}` : `Đã đánh dấu trang ${sourcePage}`);
  };

  const addTranslationExcerpt = () => {
    const translation = dictionaryLookup.result?.translation;
    if (!pdfSelection || !translation) return;
    addTextExcerpt(pdfSelection, `${pdfSelection.text}\n\nBản dịch đề xuất:\n${translation}`);
  };

  const openExcerptSource = (excerpt: NoteExcerpt) => {
    const source = resolveExcerptSource(excerpt);
    if (!source?.documentId || !source.page) return;
    if (!source.available) {
      setToast("Tài liệu nguồn không còn trong thư viện");
      return;
    }
    const sourceWorkspace = workspaces.find((workspace) => workspace.documents.some((document) => document.id === source.documentId));
    if (!sourceWorkspace) {
      setToast("Tài liệu nguồn không còn trong thư viện");
      return;
    }
    if (sourceWorkspace.id === activeWorkspace.id) {
      switchDocument(source.documentId, source.page, source.rect);
    } else {
      const nextPage = source.page;
      const nextWorkspaces = workspaces.map((workspace) => workspace.id === sourceWorkspace.id ? {
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
    setToast(`Đã quay lại ${source.displayName} · trang ${source.page}`);
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
      workspaceModeRef.current = snapshot.workspaceMode;
      setWorkspaces(snapshot.workspaces);
      setActiveWorkspaceId(snapshot.activeWorkspaceId);
      setReaderShare(snapshot.readerShare);
      setWorkspaceMode(snapshot.workspaceMode);
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

  const handlePdfWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || !currentPdfDocument) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, event.currentTarget.clientHeight) : 1;
    pdfWheelAccumulatorRef.current += event.deltaY * multiplier;
    if (Math.abs(pdfWheelAccumulatorRef.current) < 60 || pdfWheelZoomingRef.current) return;
    const direction = pdfWheelAccumulatorRef.current > 0 ? -1 : 1;
    pdfWheelAccumulatorRef.current -= Math.sign(pdfWheelAccumulatorRef.current) * 60;
    const stage = event.currentTarget;
    const oldZoom = sourceZoom;
    const nextZoom = pdfReader.clampZoom(oldZoom + direction * .1);
    if (nextZoom === oldZoom) return;
    const stageRect = stage.getBoundingClientRect();
    const localX = event.clientX - stageRect.left;
    const localY = event.clientY - stageRect.top;
    const contentX = stage.scrollLeft + localX;
    const contentY = stage.scrollTop + localY;
    const surface = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".pdf-page-surface, .document-paper");
    const surfaceRect = surface?.getBoundingClientRect();
    const surfaceX = surfaceRect ? (event.clientX - surfaceRect.left) / Math.max(1, surfaceRect.width) : 0;
    const surfaceY = surfaceRect ? (event.clientY - surfaceRect.top) / Math.max(1, surfaceRect.height) : 0;
    pdfWheelZoomingRef.current = true;
    setSourceZoom(nextZoom);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (surface?.isConnected) {
        const nextRect = surface.getBoundingClientRect();
        stage.scrollLeft += nextRect.left + nextRect.width * surfaceX - event.clientX;
        stage.scrollTop += nextRect.top + nextRect.height * surfaceY - event.clientY;
      } else {
        const anchored = zoomAroundAnchor(oldZoom, nextZoom, { contentX, contentY, localX, localY });
        stage.scrollLeft = anchored.left;
        stage.scrollTop = anchored.top;
      }
      pdfWheelZoomingRef.current = false;
    }));
  };

  const rememberReaderScrollPosition = (stage: HTMLElement) => {
    const stageTop = stage.getBoundingClientRect().top;
    const pages = Array.from(stage.querySelectorAll<HTMLElement>("[data-pdf-page]"));
    const anchor = pages.reduce<{ element: HTMLElement; distance: number } | null>((best, element) => {
      const distance = Math.abs(element.getBoundingClientRect().top - stageTop);
      return !best || distance < best.distance ? { element, distance } : best;
    }, null)?.element;
    readerScrollPositionRef.current = {
      top: stage.scrollTop,
      left: stage.scrollLeft,
      anchorPage: Number(anchor?.dataset.pdfPage) || sourcePage,
      anchorOffset: anchor ? anchor.getBoundingClientRect().top - stageTop : 0,
    };
  };

  const handleReaderScroll = () => {
    const stage = documentStageRef.current;
    if (!stage) return;
    // display:none can clamp a scroll container while Reader is hidden. Do not
    // let that transient value overwrite the last position the user actually
    // saw; it is restored when Reader becomes visible again.
    if (workspaceModeRef.current !== "note" && !restoringReaderScrollRef.current) {
      rememberReaderScrollPosition(stage);
    }
    if (viewMode !== "continuous") return;
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const stageTop = stage.getBoundingClientRect().top + 24;
      const pages = Array.from(stage.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const nearest = pages.reduce<{ element: HTMLElement; distance: number } | null>((best, element) => {
        const distance = Math.abs(element.getBoundingClientRect().top - stageTop);
        return !best || distance < best.distance ? { element, distance } : best;
      }, null);
      const page = Number(nearest?.element.dataset.pdfPage);
      if (page && page !== sourcePage) setSourcePage(page);
    });
  };

  useEffect(() => {
    setPdfSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [activeDocument?.id, pdfTool, sourcePage]);

  useEffect(() => {
    setNotePanel(null);
  }, [activeNote.id, activeNotebook?.id, activeWorkspace.id]);

  useEffect(() => {
    setPdfPanel(null);
  }, [activeDocument?.id]);

  const workspacePaneForElement = (element: HTMLElement | null): "reader" | "note" | null => {
    if (element?.closest(".reader-pane, .pdf-thumbnails")) return "reader";
    if (element?.closest(".notes-pane, .note-navigation-host")) return "note";
    return null;
  };

  const focusWorkspacePane = (pane: "reader" | "note") => {
    const paneElement = workspaceRef.current?.querySelector<HTMLElement>(pane === "reader" ? ".reader-pane" : ".notes-pane");
    if (!paneElement || paneElement.getClientRects().length === 0) return;
    const remembered = pane === "reader" ? lastReaderFocusRef.current : lastNoteFocusRef.current;
    const target = remembered?.isConnected && paneElement.contains(remembered) && remembered.getClientRects().length > 0
      ? remembered
      : paneElement;
    target.focus({ preventScroll: true });
    lastWorkspacePaneRef.current = pane;
  };

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rememberPane = (event: Event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      const pane = workspacePaneForElement(element);
      if (!pane) return;
      lastWorkspacePaneRef.current = pane;
      if (event.type === "focusin" && element) {
        if (pane === "reader") lastReaderFocusRef.current = element;
        else lastNoteFocusRef.current = element;
      }
    };
    workspace.addEventListener("focusin", rememberPane);
    workspace.addEventListener("pointerdown", rememberPane, true);
    return () => {
      workspace.removeEventListener("focusin", rememberPane);
      workspace.removeEventListener("pointerdown", rememberPane, true);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "F6" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const mode = workspaceModeRef.current;
        if (mode === "split") {
          const currentPane = workspacePaneForElement(target) ?? lastWorkspacePaneRef.current;
          const nextPane = currentPane === "reader" ? "note" : "reader";
          focusWorkspacePane(nextPane);
          setToast(nextPane === "reader" ? "Đã chuyển sang Reader (F6)" : "Đã chuyển sang Note (F6)");
          return;
        }
        const nextPane = mode === "reader" ? "note" : "reader";
        if (nextPane === "note" && !hasActiveNote) {
          changeWorkspaceMode("note");
          return;
        }
        pendingWorkspaceFocusRef.current = nextPane;
        changeWorkspaceMode(nextPane);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        setWorkspaceMode("reader");
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
        setPdfSelection(null);
        setWorkspaceMode("split");
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handlePdfFiles = async (selection: FileList | null, saveToLibrary: boolean) => {
    const files = Array.from(selection ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      setToast("Vui lòng chọn tệp PDF");
      return;
    }
    if (!ready) {
      setToast("Thư viện tài liệu đang khởi động");
      return;
    }
    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${files[0].name.replace(/\.pdf$/i, "")} +${files.length - 1}`;
    const noteStructure = noteStore.getSnapshot().structure;
    const existing = saveToLibrary ? documentLibrary.findExistingPdfWorkspace(files, workspacesRef.current) : undefined;
    const requestedDestination = existing ? { mode: "none" as const } : await requestNoteDestination({
      documentLabel: name,
      savedToLibrary: saveToLibrary,
      notebooks: ordered(noteStructure?.notebooks || []).map((notebook) => ({
        id: notebook.id,
        title: notebook.title,
        sections: ordered((noteStructure?.sections || []).filter((section) => section.notebookId === notebook.id)).map((section) => ({ id: section.id, title: section.title })),
      })),
    });
    try {
      const result = await documentLibrary.importPdfFiles({
        files,
        saveToLibrary,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        destination: requestedDestination || { mode: "none" },
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      workspacesRef.current = result.workspaces;
      activeWorkspaceIdRef.current = result.activeWorkspaceId;
      workspaceModeRef.current = result.workspaceMode;
      localSavedAtRef.current = result.savedAt;
      setWorkspaces(result.workspaces);
      setActiveWorkspaceId(result.activeWorkspaceId);
      setWorkspaceMode(result.workspaceMode);
      setLibraryOpen(false);
      if (result.message) setToast(result.message);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể mở PDF");
    }
  };

  const saveTemporaryWorkspace = async () => {
    if (activeWorkspace.kind !== "temporary") return;
    try {
      const result = await documentLibrary.saveTemporaryWorkspace({
        workspaceId: activeWorkspace.id,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        hasActiveNote,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      workspacesRef.current = result.workspaces;
      activeWorkspaceIdRef.current = result.activeWorkspaceId;
      workspaceModeRef.current = result.workspaceMode;
      localSavedAtRef.current = result.savedAt;
      setWorkspaces(result.workspaces);
      setActiveWorkspaceId(result.activeWorkspaceId);
      setWorkspaceMode(result.workspaceMode);
      if (result.message) setToast(result.message);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể lưu PDF đang xem vào thư viện");
    }
  };

  const addNotebook = async () => {
    const existingNotebooks = noteState.structure?.notebooks || [];
    const title = (
      activeWorkspace.documents.length
        ? `Ghi chú — ${activeWorkspace.name}`
        : `Sổ ghi chú ${existingNotebooks.length + 1}`
    );
    const page = createBlankPage(activeWorkspace.documents.length ? sourcePage : 1);
    try {
      const result = await noteStore.createNotebook(title, notePageToSheetContent(page));
      if (activeWorkspace.documents.length) {
        const mutation = await documentLibrary.linkWorkspaceToNote({
          workspaceId: activeWorkspace.id,
          workspaces: workspacesRef.current,
          activeWorkspaceId: activeWorkspaceIdRef.current,
          notebookId: result.active.activeNotebookId,
          target: { targetType: "page", targetId: result.active.activePageId },
          readerShare,
          workspaceMode: workspaceModeRef.current,
          noteZoom,
        });
        workspacesRef.current = mutation.workspaces;
        workspaceModeRef.current = mutation.workspaceMode;
        localSavedAtRef.current = mutation.savedAt;
        setWorkspaces(mutation.workspaces);
      } else {
        const noteRuntime = workspacesRef.current.find((workspace) => workspace.id === NOTE_RUNTIME_WORKSPACE_ID);
        if (noteRuntime && activeWorkspaceIdRef.current !== noteRuntime.id) {
          activeWorkspaceIdRef.current = noteRuntime.id;
          setActiveWorkspaceId(noteRuntime.id);
        }
      }
      noteCanvas.setActiveTool("text");
      workspaceModeRef.current = activeWorkspace.documents.length ? "split" : "note";
      setWorkspaceMode(workspaceModeRef.current);
      setToast(activeWorkspace.documents.length ? "Đã tạo Notebook cho tài liệu" : "Đã tạo sổ ghi chú mới");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể tạo Notebook");
    }
  };

  const openLibraryNotebook = async (notebookId: string) => {
    try {
      await noteStore.openNotebook(notebookId);
      const noteRuntime = workspacesRef.current.find((workspace) => workspace.id === NOTE_RUNTIME_WORKSPACE_ID);
      if (noteRuntime) {
        activeWorkspaceIdRef.current = noteRuntime.id;
        setActiveWorkspaceId(noteRuntime.id);
      }
      workspaceModeRef.current = "note";
      setWorkspaceMode("note");
      setLibraryOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể mở Notebook");
    }
  };

  const openLibraryDocument = async (workspaceId: string) => {
    const item = libraryProjection.documents.find((document) => document.id === workspaceId);
    const workspace = workspacesRef.current.find((candidate) => candidate.id === workspaceId);
    if (!item || !workspace) {
      setToast("Document runtime chưa sẵn sàng");
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
      setToast(error instanceof Error ? error.message : "Không thể mở tài liệu");
    }
  };

  const applyDocumentMutation = (result: DocumentMutationResult) => {
    workspacesRef.current = result.workspaces;
    activeWorkspaceIdRef.current = result.activeWorkspaceId;
    workspaceModeRef.current = result.workspaceMode;
    localSavedAtRef.current = result.savedAt;
    setWorkspaces(result.workspaces);
    setActiveWorkspaceId(result.activeWorkspaceId);
    setWorkspaceMode(result.workspaceMode);
    if (result.removedDocumentIds?.length) {
      const removed = new Set(result.removedDocumentIds);
      setPdfHistory((history) => Object.fromEntries(Object.entries(history).filter(([documentId]) => !removed.has(documentId))));
    }
    if (result.message) setToast(result.message);
  };

  const renameLibraryDocument = async (workspaceId: string, name: string) => {
    try {
      const result = await documentLibrary.renameWorkspace({
        workspaceId,
        name,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      applyDocumentMutation(result);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể đổi tên tài liệu");
      throw error;
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const linkedNotebookCount = target.kind === "temporary"
      ? target.noteNotebookId ? 1 : 0
      : libraryProjection.documents.find((item) => item.id === target.id)?.linkedNotebookIds.length || 0;
    const targetLabel = target.kind === "collection" ? "cụm tài liệu" : target.kind === "demo" ? "tài liệu mẫu" : "tài liệu";
    if (!window.confirm(`Xóa ${targetLabel} “${target.name}”? ${linkedNotebookCount ? `Các Notebook đang liên kết (${linkedNotebookCount}) vẫn được giữ nguyên trong Ghi chú.` : "Thao tác này chỉ xóa bản PDF đã lưu."}`)) return;
    try {
      const result = await documentLibrary.deleteWorkspace({
        workspaceId,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      applyDocumentMutation(result);
      setNotePanel(null);
      setLibraryOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể tháo liên kết tài liệu");
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
      const result = await documentLibrary.deleteDocument({
        workspaceId: activeWorkspace.id,
        documentId: activeDocument.id,
        workspaces: workspacesRef.current,
        activeWorkspaceId: activeWorkspaceIdRef.current,
        readerShare,
        workspaceMode: workspaceModeRef.current,
        noteZoom,
      });
      applyDocumentMutation(result);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xóa tài liệu khỏi cụm");
    }
  };

  const changeWorkspaceMode = (mode: WorkspaceMode) => {
    if (mode !== "reader" && !hasActiveNote) {
      setToast(activeWorkspace.kind === "temporary"
        ? "PDF đang mở tạm. Chọn “Tạo note” để ghi chú mà không cần lưu PDF."
        : "PDF này chưa có note. Chọn “Tạo note” khi bạn muốn ghi chú.");
      return;
    }
    const stage = documentStageRef.current;
    if (stage && workspaceModeRef.current !== "note") {
      rememberReaderScrollPosition(stage);
    }
    if (mode === "note" && workspaceModeRef.current !== "note") {
      pendingReaderScrollRestoreRef.current = true;
    }
    setWorkspaceMode(mode);
    if (mode === "note") {
      setPdfSelection(null);
      setPdfPanel(null);
      window.getSelection()?.removeAllRanges();
    }
    if (mode === "reader") {
      setNotePanel(null);
      noteEditor.setTextInsertPopover(null);
    }
    setToast(mode === "split" ? "Đang dùng Reader và Note" : mode === "reader" ? "Đang chỉ xem Reader" : "Đang chỉ làm Note");
  };

  useEffect(() => {
    const pendingPane = pendingWorkspaceFocusRef.current;
    if (!pendingPane) return;
    if ((pendingPane === "reader" && workspaceMode !== "reader") || (pendingPane === "note" && workspaceMode !== "note")) return;
    pendingWorkspaceFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => focusWorkspacePane(pendingPane));
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "reader" || !pendingReaderScrollRestoreRef.current) return;
    const stage = documentStageRef.current;
    const saved = readerScrollPositionRef.current;
    if (!stage || !saved) return;
    pendingReaderScrollRestoreRef.current = false;
    restoringReaderScrollRef.current = true;

    // Lazy PDF pages may settle their measured heights shortly after Reader is
    // shown again. Restore once immediately and after those layout passes so a
    // mode round-trip returns to the same coordinates instead of a nearby page.
    let cancelled = false;
    let restoreFrame: number | null = null;
    const restore = () => {
      if (cancelled) return;
      stage.scrollLeft = saved.left;
      const anchor = stage.querySelector<HTMLElement>(`[data-pdf-page="${saved.anchorPage}"]`);
      if (anchor) {
        const currentOffset = anchor.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        stage.scrollTop += currentOffset - saved.anchorOffset;
      } else {
        stage.scrollTop = saved.top;
      }
    };
    const queueRestore = () => {
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
      restoreFrame = window.requestAnimationFrame(() => {
        restoreFrame = null;
        restore();
      });
    };
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      observer.disconnect();
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
      window.clearTimeout(timeout);
      stage.removeEventListener("wheel", finish);
      stage.removeEventListener("pointerdown", finish);
      stage.removeEventListener("touchstart", finish);
      window.removeEventListener("keydown", finish);
      restoringReaderScrollRef.current = false;
    };
    const observer = new ResizeObserver(queueRestore);
    observer.observe(stage.querySelector<HTMLElement>(".continuous-pages") ?? stage);
    restore();
    queueRestore();
    const timeout = window.setTimeout(finish, 3000);
    stage.addEventListener("wheel", finish, { passive: true });
    stage.addEventListener("pointerdown", finish);
    stage.addEventListener("touchstart", finish, { passive: true });
    window.addEventListener("keydown", finish);
    return () => {
      finish();
    };
  }, [workspaceMode]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const usable = rect.width - 236;
      const readerWidth = moveEvent.clientX - rect.left - 108;
      const nextShare = Math.min(65, Math.max(35, (readerWidth / usable) * 100));
      setReaderShare(nextShare);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const gridStyle = {
    "--reader-share": `${readerShare}fr`,
    "--notes-share": `${100 - readerShare}fr`,
  } as React.CSSProperties;
  const setNoteSidebarVisibility = (visible: boolean) => {
    setShowNoteSidebar(visible);
    try {
      localStorage.setItem(NOTE_SIDEBAR_PREFERENCE_KEY, visible ? "0" : "1");
      localStorage.removeItem(LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY);
    } catch { /* UI preference is non-critical. */ }
  };
  const noteZoomPercent = Math.round(noteZoom * 100);
  const setNoteViewZoom = (value: number) => setNoteZoom(Math.max(.5, Math.min(2, value)));
  const fitNoteToView = () => {
    const available = (noteStageRef.current?.clientWidth ?? noteCanvas.basePaperMaxWidth) - 72;
    setNoteViewZoom(available / noteCanvas.basePaperMaxWidth);
  };
  useNoteZoomController(noteStageRef, noteZoom, setNoteViewZoom, fitNoteToView);
  const noteToolbar = useNoteToolbar({ NOTE_ZOOM_PRESETS, activeNote, canvas: noteCanvas, editor: noteEditor, exportNotebook, fitNoteToView, notePanel, noteSheetViewMode, noteZoom, noteZoomPercent, setNotePanel, setNoteSheetViewMode, setNoteSidebarVisibility, setNoteViewZoom, showNoteSidebar });

  return (
    <DriveControllerProvider controller={drive}>
    <PdfNavigationControllerProvider controller={pdfNavigation}>
    <main className="app-shell">
      <input ref={previewPdfInputRef} data-pdf-input="preview" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, false); event.currentTarget.value = ""; }} />
      <input ref={libraryPdfInputRef} data-pdf-input="library" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, true); event.currentTarget.value = ""; }} />
      <AppTopBar scope={{ activeWorkspace, activeWorkspaceHasLinkedNote, addNotebook, changeWorkspaceMode, documentName, hasActiveNote, previewPdfInputRef, ready, saveTemporaryWorkspace, setLibraryOpen, toast, workspaceMode }} />

      {drive.panelOpen && (
        <DrivePanel />
      )}

      {libraryOpen && (
        <LibraryPanel
          activeDocumentContextId={activeWorkspace.id}
          activeNotebookId={noteState.structure?.active.activeNotebookId || null}
          libraryProjection={libraryProjection}
          ready={ready}
          onClose={() => setLibraryOpen(false)}
          onDeleteDocument={deleteWorkspace}
          onImportDocuments={() => libraryPdfInputRef.current?.click()}
          onOpenDocument={openLibraryDocument}
          onOpenNotebook={openLibraryNotebook}
          onRenameDocument={renameLibraryDocument}
        />
      )}

      {pdfSelection && (
        <div className={`pdf-selection-menu placement-${pdfSelection.menuPlacement} ${dictionaryLookup.status === "idle" ? "compact" : "translation-open"}`} style={{ left: pdfSelection.menuX, top: pdfSelection.menuY, maxHeight: pdfSelection.menuMaxHeight }} role="dialog" aria-label="Tra từ và thao tác với đoạn chữ đã chọn">
          <div className="pdf-selection-actions" role="toolbar" aria-label="Thao tác với đoạn chữ">
            <button onClick={() => { void copyPdfSelection(); }} aria-label="Sao chép" title="Sao chép"><Copy size={14} /> Chép</button>
            <button onClick={requestDictionaryLookup} disabled={dictionaryLookup.status === "loading"} aria-label="Dịch Anh sang Việt" title="Dịch Anh sang Việt"><Languages size={14} /> Dịch</button>
            <button onClick={() => addPdfMarkup("highlight")} aria-label="Tô sáng" title="Tô sáng"><Highlighter size={14} /> Tô</button>
            <button onClick={() => addPdfMarkup("underline")} aria-label="Gạch chân" title="Gạch chân"><Underline size={14} /> Chân</button>
            <button onClick={() => addPdfMarkup("strikeout")} aria-label="Gạch ngang" title="Gạch ngang"><Strikethrough size={14} /> Ngang</button>
            <button onClick={() => addPdfMarkup("squiggly")} aria-label="Gạch lượn sóng" title="Gạch lượn sóng"><Blend size={14} /> Lượn</button>
            <button className="send-note" onClick={() => addTextExcerpt()} aria-label="Đưa sang note" title="Đưa sang note"><NotebookTabs size={14} /> Note</button>
            <button onClick={openOxfordLookup} aria-label="Tra Oxford" title="Tra Oxford"><BookOpen size={14} /> Oxford</button>
            <button className="close-selection" onClick={() => { setPdfSelection(null); window.getSelection()?.removeAllRanges(); }} aria-label="Đóng"><X size={14} /></button>
          </div>
          {dictionaryLookup.status !== "idle" && <section className="selection-dictionary" aria-live="polite">
            <header><span><Languages size={15} /><b>Anh → Việt</b></span></header>
            <p className="dictionary-source-text">{dictionaryLookup.sourceText || pdfSelection.text}</p>
            {dictionaryLookup.status === "loading" && <div className="dictionary-loading"><RefreshCw size={14} /> Đang tìm nghĩa và đề xuất bản dịch…</div>}
            {dictionaryLookup.status === "error" && <p className="dictionary-error">{dictionaryLookup.error}</p>}
            {dictionaryLookup.status === "ready" && dictionaryLookup.result && (
              <>
                {dictionaryLookup.result.dictionary && (
                  <div className="dictionary-headword">
                    <span><strong>{dictionaryLookup.result.dictionary.word}</strong>{dictionaryLookup.result.dictionary.phonetic && <em>{dictionaryLookup.result.dictionary.phonetic}</em>}</span>
                    {dictionaryLookup.result.dictionary.audioUrl && <button onClick={playDictionaryAudio} aria-label="Nghe phát âm" title="Nghe phát âm"><Volume2 size={15} /></button>}
                  </div>
                )}
                {dictionaryLookup.result.translation ? (
                  <div className="translation-suggestion">
                    <small>Gợi ý dịch</small>
                    <strong>{dictionaryLookup.result.translation}</strong>
                    {dictionaryLookup.result.alternatives.length > 0 && <p>Khác: {dictionaryLookup.result.alternatives.join(" · ")}</p>}
                    <div><button onClick={() => { void copyTranslation(); }} aria-label="Sao chép bản dịch" title="Sao chép bản dịch"><Copy size={13} /> Chép</button><button className="send-translation" onClick={addTranslationExcerpt} aria-label="Đưa bản dịch sang note" title="Đưa bản dịch sang note"><NotebookTabs size={13} /> Note</button></div>
                  </div>
                ) : <p className="dictionary-error">{dictionaryLookup.result.translationError ?? "Chưa tìm thấy gợi ý dịch phù hợp."}</p>}
                {dictionaryLookup.result.dictionary?.meanings.length ? (
                  <details className="english-definitions">
                    <summary>Nghĩa tiếng Anh</summary>
                    {dictionaryLookup.result.dictionary.meanings.map((meaning, index) => <div key={`${meaning.partOfSpeech}-${index}`}><b>{meaning.partOfSpeech}</b><span>{meaning.definitions.join("; ")}</span></div>)}
                  </details>
                ) : null}
              </>
            )}
            <footer>Nghĩa mở: Wiktionary (CC BY-SA) · gợi ý dịch online: MyMemory. Oxford mở ở trang chính thức.</footer>
          </section>}
        </div>
      )}

      <WorkspaceShell className={`workspace workspace-mode-${workspaceMode} ${pdfNavigation.railVisible ? "" : "pdf-rail-collapsed"} ${showNoteSidebar ? "" : "note-sidebar-collapsed"} ${pdfNavigation.railTab === "pages" ? "" : "pdf-rail-wide"}`} workspaceRef={workspaceRef} style={gridStyle} pdfRail={null} reader={null} divider={null} note={null} noteNavigation={null}>
        <PdfNavigationRail />

        <ReaderPane scope={{ INK_COLORS: noteCanvas.INK_COLORS, PDF_TOOLS, activeDocument, activeWorkspace, addImageExcerpt, bookmarks, changeWorkspaceMode, choosePdfTool, commitPdfPageAnnotations, currentPdfDocument, deleteActiveDocument, documentStageRef, exportAnnotatedPdf, fitMode, goToPage, handlePdfSelection, handlePdfWheelZoom, handleReaderScroll, inkColor, inkWidth, libraryPdfInputRef, onPdfPageRendered, pdfAnnotationText, pdfAnnotations, pdfHighlightColor, pdfHistory, pdfHistoryKey, pdfPanel, pdfPanelColor, pdfSignatureDraft, pdfStampDraft, pdfStatus, pdfTextDraft, pdfTool, pdfiumDocument, previewPdfInputRef, ready, redoPdf, rotation, setInkWidth, setPdfPanel, setPdfSignatureDraft, setPdfStampDraft, setPdfTextDraft, setSourceZoom, sourceFocus, sourcePage, sourcePages, sourceZoom, switchDocument, toggleBookmark, totalPages, undoPdf, updatePdfPanelColor, updateReader, viewMode, workspaceMode }} />

        <SplitDivider onPointerDown={startResize} />

        <NotePane toolbar={noteToolbar} stage={{ activateContinuousSheet, activeLogicalPage, activeNote, activeNoteHydrating, activeSheetIndex, canvas: noteCanvas, continuousNotes, editor: noteEditor, goToPage, notePanel, noteSheetViewMode, noteStageRef, noteState, noteZoom, openExcerptSource, resolveExcerptSource }} />
        {showNoteSidebar && <NoteNavigationHost setNoteSidebarVisibility={setNoteSidebarVisibility} />}
      </WorkspaceShell>
    </main>
    </PdfNavigationControllerProvider>
    </DriveControllerProvider>
  );
}
