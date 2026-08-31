import {
  Blend,
  Crop,
  Eraser,
  Hand,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  Move,
  PaintBucket,
  PenTool,
  Signature,
  Shapes,
  Square,
  Stamp,
  Strikethrough,
  TextSelect,
  Type,
  Underline,
  type LucideIcon,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import {
  addPdfMarkup as addPdfMarkupCommand,
  deletePdfAnnotation as deletePdfAnnotationCommand,
  emptyPdfAnnotationHistory,
  redoPdfAnnotations as redoPdfAnnotationCommand,
  replacePdfPageAnnotations as replacePdfPageAnnotationCommand,
  undoPdfAnnotations as undoPdfAnnotationCommand,
  type PdfAnnotationHistory,
} from "./pdf-annotation-session";
import type { LibraryDocument, ReaderState, WorkspaceMode } from "./document-runtime-adapter";
import { lookupEnglishVietnamese, oxfordLookupUrl, type EnglishVietnameseLookup } from "./dictionary";
import type { PdfAnnotation, PdfCropResult, PdfMarkupAnnotation, PdfSelection, PdfTool, PdfViewMode } from "./pdf-domain";
import { PdfReaderController, zoomAroundAnchor } from "./pdf-reader-controller";
import type { PdfHistory, PdfPanel } from "./ui/ui-contracts";
import type { PdfContinuousScrollAnchor } from "./virtualized-pdf-pages";

export type DictionaryLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  sourceText: string;
  result: EnglishVietnameseLookup | null;
  error: string | null;
};

export type ReaderScrollPosition = {
  top: number;
  left: number;
  anchorPage: number;
  anchorOffset: number;
  continuousAnchor: PdfContinuousScrollAnchor | null;
};

export type ReaderPdfTool = { id: PdfTool; label: string; shortLabel: string; icon: LucideIcon };

export const READER_INK_COLORS = ["#2465a8", "#c94b50", "#111111", "#16836f", "#f6d96b"];

export const READER_PDF_TOOLS: ReaderPdfTool[] = [
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

export function nearestPdfPage(entries: Array<{ page: number; top: number }>, anchorTop: number) {
  return entries.reduce<{ page: number; distance: number } | null>((best, entry) => {
    const distance = Math.abs(entry.top - anchorTop);
    return !best || distance < best.distance ? { page: entry.page, distance } : best;
  }, null)?.page ?? null;
}

function readerUid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type UseReaderInteractionControllerOptions = {
  activeDocument: LibraryDocument | null;
  activeReader: ReaderState;
  currentPdfDocument: PDFDocumentProxy | null;
  documentStageRef: RefObject<HTMLDivElement | null>;
  getContinuousScrollAnchor: (inset?: number) => PdfContinuousScrollAnchor | null;
  inkColor: string;
  inkWidth: number;
  notify: (message: string) => void;
  onAddTextExcerpt: (selection: PdfSelection, textOverride?: string) => void;
  onCancelCrop: () => void;
  onCrop: (result: PdfCropResult) => void | Promise<void>;
  pdfReader: PdfReaderController;
  pinContinuousScrollAnchor: () => void;
  releaseContinuousScrollAnchor: () => void;
  restoreContinuousScrollAnchor: (anchor: PdfContinuousScrollAnchor) => boolean;
  setInkColor: Dispatch<SetStateAction<string>>;
  setInkWidth: Dispatch<SetStateAction<number>>;
  setSourcePage: (page: number) => void;
  setSourceZoom: (value: number | ((zoom: number) => number)) => void;
  sourcePage: number;
  sourceZoom: number;
  updateReader: (updater: (reader: ReaderState) => ReaderState) => void;
  viewMode: PdfViewMode;
  workspaceMode: WorkspaceMode;
  workspaceModeRef: MutableRefObject<WorkspaceMode>;
};

export function useReaderInteractionController({
  activeDocument,
  activeReader,
  currentPdfDocument,
  documentStageRef,
  getContinuousScrollAnchor,
  inkColor,
  inkWidth,
  notify,
  onAddTextExcerpt,
  onCancelCrop,
  onCrop,
  pdfReader,
  pinContinuousScrollAnchor,
  releaseContinuousScrollAnchor,
  restoreContinuousScrollAnchor,
  setInkColor,
  setInkWidth,
  setSourcePage,
  setSourceZoom,
  sourcePage,
  sourceZoom,
  updateReader,
  viewMode,
  workspaceMode,
  workspaceModeRef,
}: UseReaderInteractionControllerOptions) {
  const scrollFrameRef = useRef<number | null>(null);
  const scrollPositionRef = useRef<ReaderScrollPosition | null>(null);
  const pendingScrollRestoreRef = useRef(false);
  const restoringScrollRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const wheelZoomingRef = useRef(false);
  const dictionaryAbortRef = useRef<AbortController | null>(null);
  const [pdfTool, setPdfTool] = useState<PdfTool>("smart");
  const [pdfTextDraft, setPdfTextDraft] = useState("Ghi chú");
  const [pdfStampDraft, setPdfStampDraft] = useState("ĐÃ XEM");
  const [pdfSignatureDraft, setPdfSignatureDraft] = useState("Ký tên");
  const [pdfHistory, setPdfHistory] = useState<PdfHistory>({});
  const [pdfSelection, setPdfSelection] = useState<PdfSelection | null>(null);
  const [dictionaryLookup, setDictionaryLookup] = useState<DictionaryLookupState>({ status: "idle", sourceText: "", result: null, error: null });
  const [pdfHighlightColor, setPdfHighlightColor] = useState("#f6d96b");
  const [pdfPanel, setPdfPanel] = useState<PdfPanel>(null);

  const pdfAnnotations = activeReader.annotations;
  const bookmarks = activeReader.bookmarks;
  const pdfHistoryKey = activeDocument?.id ?? "demo";
  const pdfAnnotationText = pdfTool === "stamp" ? pdfStampDraft : pdfTool === "signature" ? pdfSignatureDraft : pdfTextDraft;
  const isPdfHighlightTool = pdfTool === "highlight" || pdfTool === "area-highlight";
  const pdfPanelColor = isPdfHighlightTool ? pdfHighlightColor : inkColor;

  const clearSelection = () => {
    setPdfSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const updatePdfPanelColor = (color: string) => {
    if (isPdfHighlightTool) setPdfHighlightColor(color);
    else setInkColor(color);
  };

  const choosePdfTool = (tool: PdfTool) => {
    setPdfTool(tool);
    if (tool !== "crop") onCancelCrop();
    if (["pen", "highlight", "area-highlight", "underline", "strikeout", "squiggly", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(tool)) {
      setPdfPanel((panel) => panel === "ink" && pdfTool === tool ? null : "ink");
    } else {
      setPdfPanel(null);
    }
  };

  const applyPdfAnnotationResult = (result: { annotations: PdfAnnotation[]; history: PdfAnnotationHistory }) => {
    setPdfHistory((state) => ({ ...state, [pdfHistoryKey]: result.history }));
    updateReader((reader) => ({ ...reader, annotations: result.annotations }));
  };

  const addPdfMarkup = (kind: PdfMarkupAnnotation["kind"], selection: PdfSelection | null = pdfSelection) => {
    if (!selection || !activeDocument) return;
    const color = kind === "highlight" || kind === "area-highlight" ? pdfHighlightColor : kind === "underline" || kind === "squiggly" ? inkColor : "#c94b50";
    const annotation: PdfMarkupAnnotation = {
      id: readerUid(`pdf-${kind}`),
      kind,
      page: selection.page,
      color,
      rects: selection.rects,
      text: selection.text,
      createdAt: Date.now(),
    };
    applyPdfAnnotationResult(addPdfMarkupCommand(pdfAnnotations, annotation, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
    clearSelection();
    notify(kind === "highlight" ? "Đã tô sáng" : kind === "underline" ? "Đã gạch chân" : kind === "squiggly" ? "Đã gạch lượn sóng" : "Đã gạch ngang");
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

  const copyPdfSelection = async () => {
    if (!pdfSelection) return;
    try {
      await navigator.clipboard.writeText(pdfSelection.text);
      notify("Đã sao chép đoạn chọn");
    } catch {
      notify("Trình duyệt không cho phép sao chép tự động");
    }
  };

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
    void new Audio(audioUrl).play().catch(() => notify("Trình duyệt chưa cho phép phát âm thanh"));
  };

  const copyTranslation = async () => {
    const translation = dictionaryLookup.result?.translation;
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      notify("Đã sao chép bản dịch đề xuất");
    } catch {
      notify("Trình duyệt không cho phép sao chép tự động");
    }
  };

  const openOxfordLookup = () => {
    if (pdfSelection) window.open(oxfordLookupUrl(pdfSelection.text), "_blank", "noopener,noreferrer");
  };

  const addSelectionToNote = () => {
    if (pdfSelection) onAddTextExcerpt(pdfSelection);
  };

  const addTranslationToNote = () => {
    const translation = dictionaryLookup.result?.translation;
    if (pdfSelection && translation) onAddTextExcerpt(pdfSelection, `${pdfSelection.text}\n\nBản dịch đề xuất:\n${translation}`);
  };

  const commitPdfPageAnnotations = (page: number, nextPage: PdfAnnotation[], previousPage: PdfAnnotation[]) => {
    applyPdfAnnotationResult(replacePdfPageAnnotationCommand(pdfAnnotations, page, nextPage, previousPage, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
  };

  const undoPdf = () => {
    const result = undoPdfAnnotationCommand(pdfAnnotations, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory());
    if (result.annotations === pdfAnnotations) return;
    applyPdfAnnotationResult(result);
    notify("Đã hoàn tác chú thích PDF");
  };

  const redoPdf = () => {
    const result = redoPdfAnnotationCommand(pdfAnnotations, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory());
    if (result.annotations === pdfAnnotations) return;
    applyPdfAnnotationResult(result);
    notify("Đã làm lại chú thích PDF");
  };

  const removePdfAnnotation = (annotationId: string) => {
    applyPdfAnnotationResult(deletePdfAnnotationCommand(pdfAnnotations, annotationId, pdfHistory[pdfHistoryKey] ?? emptyPdfAnnotationHistory()));
    notify("Đã xóa chú thích PDF");
  };

  const toggleBookmark = () => {
    const exists = bookmarks.includes(sourcePage);
    updateReader((reader) => ({
      ...reader,
      bookmarks: exists ? reader.bookmarks.filter((page) => page !== sourcePage) : [...reader.bookmarks, sourcePage].sort((a, b) => a - b),
    }));
    notify(exists ? `Đã bỏ đánh dấu trang ${sourcePage}` : `Đã đánh dấu trang ${sourcePage}`);
  };

  const dropDocumentHistories = (documentIds: string[]) => {
    if (!documentIds.length) return;
    const removed = new Set(documentIds);
    setPdfHistory((history) => Object.fromEntries(Object.entries(history).filter(([documentId]) => !removed.has(documentId))));
  };

  const handlePdfWheelZoom = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey) || !currentPdfDocument) return;
    event.preventDefault();
    const stage = event.currentTarget as HTMLDivElement;
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, stage.clientHeight) : 1;
    wheelAccumulatorRef.current += event.deltaY * multiplier;
    if (Math.abs(wheelAccumulatorRef.current) < 60 || wheelZoomingRef.current) return;
    const direction = wheelAccumulatorRef.current > 0 ? -1 : 1;
    wheelAccumulatorRef.current -= Math.sign(wheelAccumulatorRef.current) * 60;
    const oldZoom = sourceZoom;
    const nextZoom = pdfReader.clampZoom(oldZoom + direction * .1);
    if (nextZoom === oldZoom) return;
    if (viewMode === "continuous") pinContinuousScrollAnchor();
    const stageRect = stage.getBoundingClientRect();
    const localX = event.clientX - stageRect.left;
    const localY = event.clientY - stageRect.top;
    const contentX = stage.scrollLeft + localX;
    const contentY = stage.scrollTop + localY;
    const surface = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".pdf-page-surface, .document-paper");
    const surfaceRect = surface?.getBoundingClientRect();
    const surfaceX = surfaceRect ? (event.clientX - surfaceRect.left) / Math.max(1, surfaceRect.width) : 0;
    const surfaceY = surfaceRect ? (event.clientY - surfaceRect.top) / Math.max(1, surfaceRect.height) : 0;
    wheelZoomingRef.current = true;
    setSourceZoom(nextZoom);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (surface?.isConnected) {
        const nextRect = surface.getBoundingClientRect();
        stage.scrollLeft += nextRect.left + nextRect.width * surfaceX - event.clientX;
        if (viewMode !== "continuous") stage.scrollTop += nextRect.top + nextRect.height * surfaceY - event.clientY;
      } else {
        const anchored = zoomAroundAnchor(oldZoom, nextZoom, { contentX, contentY, localX, localY });
        stage.scrollLeft = anchored.left;
        if (viewMode !== "continuous") stage.scrollTop = anchored.top;
      }
      wheelZoomingRef.current = false;
    }));
  };

  const rememberReaderScrollPosition = (stage: HTMLElement) => {
    const virtualAnchor = viewMode === "continuous" ? getContinuousScrollAnchor(24) : null;
    const stageTop = stage.getBoundingClientRect().top;
    const pages = Array.from(stage.querySelectorAll<HTMLElement>("[data-pdf-page]"));
    const anchorPage = virtualAnchor?.page
      ?? nearestPdfPage(pages.map((element) => ({ page: Number(element.dataset.pdfPage), top: element.getBoundingClientRect().top })), stageTop)
      ?? sourcePage;
    const anchor = pages.find((element) => Number(element.dataset.pdfPage) === anchorPage);
    scrollPositionRef.current = {
      top: stage.scrollTop,
      left: stage.scrollLeft,
      anchorPage,
      anchorOffset: virtualAnchor?.offset ?? (anchor ? anchor.getBoundingClientRect().top - stageTop : 0),
      continuousAnchor: virtualAnchor,
    };
  };

  const handleReaderScroll = () => {
    const stage = documentStageRef.current;
    if (!stage) return;
    if (workspaceModeRef.current !== "note" && !restoringScrollRef.current) rememberReaderScrollPosition(stage);
    if (viewMode !== "continuous") return;
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const virtualPage = getContinuousScrollAnchor(24)?.page;
      if (virtualPage) {
        if (virtualPage !== sourcePage) setSourcePage(virtualPage);
        return;
      }
      const stageTop = stage.getBoundingClientRect().top + 24;
      const pages = Array.from(stage.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const page = nearestPdfPage(pages.map((element) => ({ page: Number(element.dataset.pdfPage), top: element.getBoundingClientRect().top })), stageTop);
      if (page && page !== sourcePage) setSourcePage(page);
    });
  };

  const prepareWorkspaceModeChange = (mode: WorkspaceMode) => {
    const stage = documentStageRef.current;
    if (stage && workspaceModeRef.current !== "note") rememberReaderScrollPosition(stage);
    if (mode === "note" && workspaceModeRef.current !== "note") pendingScrollRestoreRef.current = true;
    if (mode === "note") {
      clearSelection();
      setPdfPanel(null);
    }
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
    return () => dictionaryAbortRef.current?.abort();
  }, [pdfSelection?.text]);

  useEffect(() => {
    clearSelection();
  }, [activeDocument?.id, pdfTool, sourcePage]);

  useEffect(() => {
    setPdfPanel(null);
  }, [activeDocument?.id]);

  useEffect(() => {
    if (workspaceMode === "note" || !pendingScrollRestoreRef.current) return;
    const stage = documentStageRef.current;
    const saved = scrollPositionRef.current;
    if (!stage || !saved) return;
    pendingScrollRestoreRef.current = false;
    restoringScrollRef.current = true;
    let cancelled = false;
    let restoreFrame: number | null = null;
    const restore = () => {
      if (cancelled) return;
      stage.scrollLeft = saved.left;
      if (saved.continuousAnchor && restoreContinuousScrollAnchor(saved.continuousAnchor)) return;
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
      releaseContinuousScrollAnchor();
      restoringScrollRef.current = false;
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
    return finish;
  }, [workspaceMode]);

  useEffect(() => () => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  return {
    INK_COLORS: READER_INK_COLORS,
    PDF_TOOLS: READER_PDF_TOOLS,
    addPdfMarkup,
    addSelectionToNote,
    addTranslationToNote,
    bookmarks,
    choosePdfTool,
    clearSelection,
    commitPdfPageAnnotations,
    copyPdfSelection,
    copyTranslation,
    dictionaryLookup,
    dropDocumentHistories,
    handleCrop: onCrop,
    handlePdfSelection,
    handlePdfWheelZoom,
    handleReaderScroll,
    inkColor,
    inkWidth,
    openOxfordLookup,
    pdfAnnotationText,
    pdfAnnotations,
    pdfHighlightColor,
    pdfHistory,
    pdfHistoryKey,
    pdfPanel,
    pdfPanelColor,
    pdfSelection,
    pdfSignatureDraft,
    pdfStampDraft,
    pdfTextDraft,
    pdfTool,
    playDictionaryAudio,
    prepareWorkspaceModeChange,
    redoPdf,
    removePdfAnnotation,
    requestDictionaryLookup,
    setInkWidth,
    setPdfPanel,
    setPdfSelection,
    setPdfSignatureDraft,
    setPdfStampDraft,
    setPdfTextDraft,
    setPdfTool,
    toggleBookmark,
    undoPdf,
    updatePdfPanelColor,
  };
}

export type ReaderInteractionController = ReturnType<typeof useReaderInteractionController>;
