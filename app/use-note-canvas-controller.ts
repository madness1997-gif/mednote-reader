import { Brush, Eraser, Highlighter, Lasso, MessageSquareText, MousePointer2, Pencil, PenLine, PenTool, ScanText, Shapes, TextCursorInput, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import type { PdfCropResult, PdfRect, PdfSelection, PdfTool } from "./pdf-domain";
import { localBinaryStorage } from "./local-binary-storage";
import { fitFirstAidImageLayout } from "./first-aid-image-placement";
import { firstAidTemplateTransition } from "./first-aid-block-model";
import { firstAidThemeVariables } from "./first-aid-theme";
import { NoteInkSession } from "./note-ink-session";
import {
  DEFAULT_CALLOUT_APPEARANCE,
  DEFAULT_TEXT_BOX_APPEARANCE,
  defaultExcerptLayout,
  normalizeExcerptAppearance,
  plainTextToRichHtml,
  type ExcerptAppearance,
  type ExcerptLayout,
  type NoteExcerpt,
  type NotePage,
  type NotePageContentPatch,
  type PaperColor,
  type PaperSettings,
  type PaperSize,
  type PaperTemplate,
  type PenStyle,
  type ShapeKind,
  type Stroke,
} from "./note-runtime-adapter";
import type { LibraryDocument } from "./document-runtime-adapter";
import type { NoteEditorController } from "./use-note-editor-controller";
import type { FirstAidCropPlacement, FirstAidCropResult, FirstAidCropTarget, LayerDirection, NotePanel, StickerPresetId, Tool } from "./ui/ui-contracts";

export type NotePaperSizeOption = { label: string; dimensions: string; width: number; height: number; maxWidth: number };
export type NoteStickerPreset = { id: StickerPresetId; label: string; description: string; width: number; height: number; rotation: number };
export type NoteCanvasTool = { id: Tool; label: string; icon: LucideIcon };

const PAPER_SIZES: Record<PaperSize, NotePaperSizeOption> = {
  a4: { label: "A4", dimensions: "210 × 297 mm", width: 210, height: 297, maxWidth: 720 },
  a5: { label: "A5", dimensions: "148 × 210 mm", width: 148, height: 210, maxWidth: 590 },
  b5: { label: "B5", dimensions: "176 × 250 mm", width: 176, height: 250, maxWidth: 650 },
  letter: { label: "Letter", dimensions: "216 × 279 mm", width: 216, height: 279, maxWidth: 740 },
  square: { label: "Vuông", dimensions: "210 × 210 mm", width: 210, height: 210, maxWidth: 720 },
};

const PAPER_TEMPLATES: { id: PaperTemplate; label: string }[] = [
  { id: "blank", label: "Trắng" },
  { id: "ruled", label: "Kẻ ngang thưa" },
  { id: "ruled-dense", label: "Kẻ ngang dày" },
  { id: "grid", label: "Ô vuông" },
  { id: "dotted", label: "Chấm" },
  { id: "cornell", label: "Cornell" },
  { id: "first-aid", label: "First Aid" },
];

const PAPER_COLORS: { id: PaperColor; label: string; swatch: string }[] = [
  { id: "white", label: "Trắng", swatch: "#ffffff" },
  { id: "ivory", label: "Kem", swatch: "#fffaf0" },
  { id: "yellow", label: "Vàng nhạt", swatch: "#fff8cf" },
  { id: "mint", label: "Xanh bạc hà", swatch: "#eefaf3" },
  { id: "blue", label: "Xanh nhạt", swatch: "#eef7fc" },
  { id: "dark", label: "Tối", swatch: "#263139" },
];

const PEN_STYLES: { id: PenStyle; label: string; icon: LucideIcon }[] = [
  { id: "ballpoint", label: "Bút bi", icon: PenLine },
  { id: "fountain", label: "Bút máy", icon: PenTool },
  { id: "pencil", label: "Bút chì", icon: Pencil },
  { id: "brush", label: "Bút cọ", icon: Brush },
];

const INK_COLORS = ["#2465a8", "#c94b50", "#111111", "#16836f", "#f6d96b"];
const TEXT_BOX_BACKGROUND_COLORS = ["transparent", "#ffffff", "#fff2a8", "#d8f1dc", "#ccebf3", "#f7d5dd", "#e4d8f3"];

const STICKER_PRESETS: NoteStickerPreset[] = [
  { id: "classic-yellow", label: "Sticky vàng", description: "Giấy note cổ điển, góc gấp", width: .30, height: .17, rotation: -1 },
  { id: "tape-pink", label: "Tape hồng", description: "Note pastel có băng dính phía trên", width: .31, height: .17, rotation: 1 },
  { id: "pin-mint", label: "Ghim xanh", description: "Thẻ xanh bạc hà có ghim tròn", width: .29, height: .16, rotation: -.5 },
  { id: "tab-blue", label: "Tab xanh", description: "Thẻ xanh có nhãn tab nổi", width: .31, height: .16, rotation: 0 },
  { id: "clinical-card", label: "Clinical card", description: "Thẻ trắng viền teal cho ý chính", width: .33, height: .17, rotation: 0 },
  { id: "high-yield", label: "High-yield", description: "Sticker vàng nhấn mạnh điểm cần nhớ", width: .32, height: .16, rotation: 0 },
];

const TOOLS: NoteCanvasTool[] = [
  { id: "pointer", label: "Chọn", icon: MousePointer2 },
  { id: "pen", label: "Bút", icon: PenTool },
  { id: "highlight", label: "Tô sáng", icon: Highlighter },
  { id: "eraser", label: "Tẩy chính xác", icon: Eraser },
  { id: "lasso", label: "Khoanh chọn", icon: Lasso },
  { id: "shape", label: "Hình học", icon: Shapes },
  { id: "text", label: "Nhập chữ", icon: TextCursorInput },
  { id: "textbox", label: "Tạo hộp chữ", icon: ScanText },
  { id: "callout", label: "Callout — hộp chú thích có mũi tên", icon: MessageSquareText },
];

function canvasUid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function boundingPdfRect(rects: PdfRect[]): PdfRect | undefined {
  if (!rects.length) return undefined;
  return rects.reduce<PdfRect>((bounds, rect) => ({
    x1: Math.min(bounds.x1, rect.x1, rect.x2),
    y1: Math.min(bounds.y1, rect.y1, rect.y2),
    x2: Math.max(bounds.x2, rect.x1, rect.x2),
    y2: Math.max(bounds.y2, rect.y1, rect.y2),
  }), {
    x1: Math.min(rects[0].x1, rects[0].x2),
    y1: Math.min(rects[0].y1, rects[0].y2),
    x2: Math.max(rects[0].x1, rects[0].x2),
    y2: Math.max(rects[0].y1, rects[0].y2),
  });
}

export function moveExcerptLayer(excerpts: NoteExcerpt[], excerptId: string, direction: LayerDirection) {
  const sourceIndex = excerpts.findIndex((excerpt) => excerpt.id === excerptId);
  if (sourceIndex < 0) return excerpts;
  const targetIndex = direction === "front"
    ? excerpts.length - 1
    : direction === "back"
      ? 0
      : sourceIndex + (direction === "forward" ? 1 : -1);
  if (targetIndex < 0 || targetIndex >= excerpts.length || targetIndex === sourceIndex) return excerpts;
  const next = [...excerpts];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export function notePaperGeometry(paper: PaperSettings) {
  const selectedPaperSize = PAPER_SIZES[paper.size];
  const portrait = paper.orientation === "portrait";
  const paperWidth = portrait ? selectedPaperSize.width : selectedPaperSize.height;
  const paperHeight = portrait ? selectedPaperSize.height : selectedPaperSize.width;
  const basePaperMaxWidth = portrait ? selectedPaperSize.maxWidth : Math.min(920, selectedPaperSize.maxWidth * 1.32);
  return { selectedPaperSize, paperWidth, paperHeight, basePaperMaxWidth };
}

export function calloutPlacement(anchorX: number, anchorY: number) {
  const width = .38;
  const height = .18;
  const x = anchorX + width + .055 <= .98 ? anchorX + .055 : Math.max(.02, anchorX - width - .055);
  const y = anchorY - height - .055 >= .06 ? anchorY - height - .055 : Math.min(1 - height - .02, anchorY + .055);
  return { x, y, width, height, contentScale: 1, rotation: 0, opacity: 1 } satisfies ExcerptLayout;
}

export type UseNoteCanvasControllerOptions = {
  activeDocument: LibraryDocument | null;
  activeNote: NotePage;
  canvasScopeKey: string;
  editor: NoteEditorController;
  notePanel: NotePanel;
  noteZoom: number;
  notify: (message: string) => void;
  pdfSelection: PdfSelection | null;
  setNotePanel: Dispatch<SetStateAction<NotePanel>>;
  setPdfSelection: Dispatch<SetStateAction<PdfSelection | null>>;
  setPdfTool: Dispatch<SetStateAction<PdfTool>>;
  updateActiveNote: (changes: NotePageContentPatch) => void;
};

export function useNoteCanvasController({ activeDocument, activeNote, canvasScopeKey, editor, notePanel, noteZoom, notify, pdfSelection, setNotePanel, setPdfSelection, setPdfTool, updateActiveNote }: UseNoteCanvasControllerOptions) {
  const [activeTool, setActiveTool] = useState<Tool>("pointer");
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState("#2465a8");
  const [inkWidth, setInkWidth] = useState(2);
  const [highlighterWidth, setHighlighterWidth] = useState(14);
  const [penStyle, setPenStyle] = useState<PenStyle>("ballpoint");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [firstAidCropTarget, setFirstAidCropTarget] = useState<FirstAidCropTarget | null>(null);
  const [firstAidCropResult, setFirstAidCropResult] = useState<FirstAidCropResult | null>(null);
  const noteInkSession = useMemo(() => new NoteInkSession(60), []);
  const [inkHistoryVersion, setInkHistoryVersion] = useState(0);

  const selectedExcerptIndex = activeNote.excerpts.findIndex((excerpt) => excerpt.id === selectedExcerptId);
  const selectedExcerpt = selectedExcerptIndex >= 0 ? activeNote.excerpts[selectedExcerptIndex] : null;
  const selectedTextBoxAppearance = selectedExcerpt?.kind === "text" ? normalizeExcerptAppearance(selectedExcerpt.appearance) : null;
  const { selectedPaperSize, paperWidth, paperHeight, basePaperMaxWidth } = notePaperGeometry(activeNote.paper);
  const lineStep = activeNote.paper.template === "ruled-dense" ? 5 : 8;
  const defaultTextFont = editor.TEXT_FONTS.find((font) => font.id === activeNote.text.font) ?? editor.TEXT_FONTS[0];
  const paperStyle = {
    "--paper-ratio": `${paperWidth} / ${paperHeight}`,
    "--paper-max-width": `${basePaperMaxWidth}px`,
    "--note-view-zoom": noteZoom,
    "--paper-line-step": `${(lineStep / paperHeight) * 100}%`,
    "--paper-cell-x": `${(8 / paperWidth) * 100}%`,
    "--paper-cell-y": `${(8 / paperHeight) * 100}%`,
    "--cornell-header": `${(40 / paperHeight) * 100}%`,
    ...(activeNote.paper.template === "first-aid" ? firstAidThemeVariables(activeNote.paper.color) : {}),
  } as CSSProperties;
  const textLayerStyle = {
    "--text-font": defaultTextFont.family,
    "--text-size": `${activeNote.text.size}px`,
    "--text-color": activeNote.text.color === "auto" ? "var(--paper-ink)" : activeNote.text.color,
    "--text-weight": activeNote.text.bold ? 700 : 400,
    "--text-style": activeNote.text.italic ? "italic" : "normal",
    "--text-decoration": activeNote.text.underline ? "underline" : "none",
    "--text-align": activeNote.text.align,
  } as CSSProperties;

  useEffect(() => {
    setSelectedExcerptId(null);
    setFirstAidCropTarget(null);
    setFirstAidCropResult(null);
  }, [canvasScopeKey]);

  const chooseNoteTool = (tool: Tool) => {
    setActiveTool(tool);
    if (tool !== "pointer" && tool !== "text") setSelectedExcerptId(null);
    if (tool === "pen" || tool === "highlight") {
      setNotePanel((panel) => panel === "ink" && activeTool === tool ? null : "ink");
    } else if (tool === "shape") {
      setNotePanel((panel) => panel === "shape" && activeTool === tool ? null : "shape");
    } else if (tool === "text" || tool === "textbox" || tool === "callout") {
      setNotePanel((panel) => panel === "text" && activeTool === tool ? null : "text");
      if (tool === "text") {
        const editorId = selectedExcerpt?.kind === "text" ? `excerpt:${selectedExcerpt.id}` : `body:${activeNote.id}`;
        window.requestAnimationFrame(() => editor.focusTypeEditor(editorId));
      }
    } else {
      setNotePanel(null);
    }
  };

  const cancelFirstAidCrop = () => {
    setFirstAidCropTarget(null);
    setFirstAidCropResult(null);
  };

  const addTextExcerpt = (selection: PdfSelection | null = pdfSelection, textOverride?: string) => {
    if (!selection || !activeDocument) return;
    const text = textOverride ?? selection.text;
    const excerpt: NoteExcerpt = {
      id: canvasUid("excerpt"),
      kind: "text",
      sourceKind: "pdf",
      text,
      richText: plainTextToRichHtml(text),
      documentId: activeDocument.id,
      documentName: activeDocument.name,
      page: selection.page,
      rect: boundingPdfRect(selection.rects),
      createdAt: Date.now(),
      layout: defaultExcerptLayout(activeNote.excerpts.length, "text"),
      appearance: { ...DEFAULT_TEXT_BOX_APPEARANCE },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt], citationPage: selection.page });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("pointer");
    setNotePanel(null);
    window.getSelection()?.removeAllRanges();
    setPdfSelection(null);
    notify("Đã đưa đoạn trích sang note");
  };

  const addImageExcerpt = async (result: PdfCropResult) => {
    if (!activeDocument) return;
    if (firstAidCropTarget && firstAidCropTarget.noteId !== activeNote.id) {
      setFirstAidCropTarget(null);
      setPdfTool("smart");
      notify("Đã hủy Crop vì trang First Aid đích đã thay đổi");
      return;
    }
    const assetId = canvasUid("crop");
    const cropTarget = firstAidCropTarget?.noteId === activeNote.id ? firstAidCropTarget : null;
    try {
      await localBinaryStorage.saveAsset(assetId, result.blob);
      const fallbackWidth = Math.max(1, Math.abs(result.rect.x2 - result.rect.x1));
      const fallbackHeight = Math.max(1, Math.abs(result.rect.y2 - result.rect.y1));
      let aspectRatio = fallbackWidth / fallbackHeight;
      try {
        const bitmap = await createImageBitmap(result.blob);
        aspectRatio = bitmap.width / Math.max(1, bitmap.height);
        bitmap.close();
      } catch { /* PDF crop dimensions remain the reliable fallback. */ }
      const layout = defaultExcerptLayout(activeNote.excerpts.length, "image");
      layout.aspectRatio = aspectRatio;
      if (cropTarget) {
        Object.assign(layout, fitFirstAidImageLayout(cropTarget.placement, aspectRatio, paperWidth, paperHeight));
      } else {
        layout.height = Math.min(.72, Math.max(.04, layout.width * (paperWidth / paperHeight) / aspectRatio));
      }
      const excerptId = canvasUid("excerpt");
      const excerpt: NoteExcerpt = {
        id: excerptId,
        kind: "image",
        sourceKind: "pdf",
        assetId,
        documentId: activeDocument.id,
        documentName: activeDocument.name,
        page: result.page,
        rect: result.rect,
        createdAt: Date.now(),
        layout,
      };
      updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt], citationPage: result.page });
      setSelectedExcerptId(excerpt.id);
      setActiveTool("pointer");
      setNotePanel(null);
      setPdfTool("smart");
      if (cropTarget) {
        setFirstAidCropResult({ token: canvasUid("crop-result"), blockId: cropTarget.blockId, excerptId, imageName: `${activeDocument.name} · trang ${result.page}`, aspectRatio });
        setFirstAidCropTarget(null);
        notify("Đã crop từ PDF — ảnh đã gắn vào block và trở thành đối tượng trên trang");
      } else {
        notify("Đã cắt hình và đưa sang note");
      }
    } catch {
      setFirstAidCropTarget(null);
      notify("Không thể lưu hình cắt trên thiết bị này");
    }
  };

  const requestFirstAidPdfCrop = ({ blockId, placement }: { blockId: string; placement: FirstAidCropPlacement }) => {
    if (!activeDocument) {
      notify("Thêm hoặc mở một PDF trước khi dùng Crop từ PDF");
      return;
    }
    setFirstAidCropResult(null);
    setFirstAidCropTarget({ noteId: activeNote.id, blockId, placement });
    setPdfSelection(null);
    setPdfTool("crop");
    notify("Kéo khoanh vùng cần cắt trên trang PDF; ảnh sẽ tự gắn vào block đang chọn");
  };

  const finishFirstAidPdfCrop = (token: string) => {
    setFirstAidCropResult((current) => current?.token === token ? null : current);
  };

  const addFirstAidImage = async ({ blob, name, aspectRatio, placement }: { blob: Blob; name: string; aspectRatio: number; placement: FirstAidCropPlacement }) => {
    const assetId = canvasUid("note-image");
    try {
      await localBinaryStorage.saveAsset(assetId, blob);
      const layout = defaultExcerptLayout(activeNote.excerpts.length, "image");
      layout.aspectRatio = Math.max(.01, aspectRatio);
      Object.assign(layout, fitFirstAidImageLayout(placement, layout.aspectRatio, paperWidth, paperHeight));
      const excerptId = canvasUid("excerpt");
      const excerpt: NoteExcerpt = { id: excerptId, kind: "image", sourceKind: "manual", assetId, documentName: name, createdAt: Date.now(), layout };
      updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
      setSelectedExcerptId(excerpt.id);
      setActiveTool("pointer");
      setNotePanel(null);
      notify("Đã đưa ảnh lên trang — có thể kéo, đổi cỡ, xoay, chỉnh độ trong suốt và xếp lớp");
      return { excerptId };
    } catch {
      notify("Không thể lưu ảnh trên thiết bị này");
      return null;
    }
  };

  const deleteExcerpt = (excerptId: string) => {
    updateActiveNote({ excerpts: activeNote.excerpts.filter((excerpt) => excerpt.id !== excerptId) });
    if (selectedExcerptId === excerptId) setSelectedExcerptId(null);
    notify("Đã xóa trích dẫn khỏi note");
  };

  const moveExcerpt = (excerptId: string, layout: ExcerptLayout) => {
    updateActiveNote({ excerpts: activeNote.excerpts.map((excerpt) => excerpt.id === excerptId ? { ...excerpt, layout } : excerpt) });
    notify("Đã lưu vị trí trích dẫn");
  };

  const editExcerpt = (excerptId: string, changes: Partial<NoteExcerpt>) => {
    updateActiveNote({ excerpts: activeNote.excerpts.map((excerpt) => excerpt.id === excerptId ? { ...excerpt, ...changes } : excerpt) });
  };

  const updateSelectedTextBoxAppearance = (changes: Partial<ExcerptAppearance>, closePopover = false) => {
    if (!selectedExcerpt || selectedExcerpt.kind !== "text") {
      notify("Chọn một hộp chữ trước khi chỉnh viền hoặc nền");
      return;
    }
    editExcerpt(selectedExcerpt.id, { appearance: { ...normalizeExcerptAppearance(selectedExcerpt.appearance), ...changes } });
    if (closePopover) editor.setTextInsertPopover(null);
    notify("Đã cập nhật hộp chữ");
  };

  const pointInTypedLayer = (event: PointerEvent<HTMLElement>) => {
    const host = event.currentTarget.querySelector<HTMLElement>(".typed-layer");
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const addTextBoxAt = (event: PointerEvent<HTMLElement>) => {
    const point = pointInTypedLayer(event);
    if (!point) return;
    const width = .24;
    const height = .08;
    const excerpt: NoteExcerpt = {
      id: canvasUid("textbox"), kind: "text", sourceKind: "manual", text: "", richText: "", createdAt: Date.now(),
      layout: { x: Math.min(1 - width, point.x), y: Math.min(1 - height, Math.max(.065, point.y)), width, height, contentScale: 1, rotation: 0, opacity: 1, autoFit: true },
      appearance: { ...DEFAULT_TEXT_BOX_APPEARANCE },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    notify("Đã tạo hộp chữ — nhập nội dung ngay");
  };

  const addSticker = (presetId: StickerPresetId) => {
    const preset = STICKER_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const slot = activeNote.excerpts.length % 6;
    const excerpt: NoteExcerpt = {
      id: canvasUid("sticker"), kind: "text", sourceKind: "manual", text: "", richText: "", stickerStyle: preset.id, createdAt: Date.now(),
      layout: {
        x: Math.min(1 - preset.width - .03, .13 + (slot % 3) * .045),
        y: Math.min(1 - preset.height - .04, .16 + (slot % 4) * .055),
        width: preset.width, height: preset.height, contentScale: 1, rotation: preset.rotation, opacity: 1, autoFit: false,
      },
      appearance: { borderStyle: "solid", borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent" },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    editor.setTextInsertPopover(null);
    notify(`Đã chèn ${preset.label} — nhập chữ trực tiếp, dùng Chọn để kéo và đổi kích thước`);
  };

  const addCalloutAt = (event: PointerEvent<HTMLElement>) => {
    const point = pointInTypedLayer(event);
    if (!point) return;
    const excerpt: NoteExcerpt = {
      id: canvasUid("callout"), kind: "text", annotationKind: "callout", callout: { anchorX: point.x, anchorY: point.y }, sourceKind: "manual", text: "", richText: "", createdAt: Date.now(),
      layout: calloutPlacement(point.x, point.y), appearance: { ...DEFAULT_CALLOUT_APPEARANCE },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    notify("Đã tạo callout — nhập chú thích, dùng Chọn để kéo đầu mũi tên");
  };

  const shiftExcerptLayer = (direction: LayerDirection) => {
    if (!selectedExcerpt) return;
    const next = moveExcerptLayer(activeNote.excerpts, selectedExcerpt.id, direction);
    if (next === activeNote.excerpts) return;
    updateActiveNote({ excerpts: next });
    notify(direction === "front" ? "Đã đưa đối tượng lên trên cùng" : direction === "back" ? "Đã đưa đối tượng xuống dưới cùng" : direction === "forward" ? "Đã đưa đối tượng lên một lớp" : "Đã đưa đối tượng xuống một lớp");
  };

  const commitStrokes = (next: Stroke[], previous: Stroke[]) => {
    if (!noteInkSession.commit(activeNote.id, next, previous)) return;
    updateActiveNote({ strokes: next });
    setInkHistoryVersion((value) => value + 1);
  };

  const undo = () => {
    const previous = noteInkSession.undo(activeNote.id, activeNote.strokes);
    if (!previous) return;
    updateActiveNote({ strokes: previous });
    setInkHistoryVersion((value) => value + 1);
  };

  const redo = () => {
    const next = noteInkSession.redo(activeNote.id, activeNote.strokes);
    if (!next) return;
    updateActiveNote({ strokes: next });
    setInkHistoryVersion((value) => value + 1);
  };

  const updatePaper = (changes: Partial<PaperSettings>) => {
    updateActiveNote({ paper: { ...activeNote.paper, ...changes } });
    notify("Đã lưu mẫu giấy cho trang này");
  };

  const updatePaperTemplate = (template: PaperTemplate) => {
    const currentTemplate = activeNote.paper.template;
    const transition = firstAidTemplateTransition({
      currentTemplate,
      nextTemplate: template,
      bodyHtml: activeNote.bodyHtml ?? "",
      body: activeNote.body,
      firstAid: activeNote.firstAid,
    });
    if (template !== "first-aid") {
      updateActiveNote({ paper: { ...activeNote.paper, template }, ...transition });
      notify(currentTemplate === "first-aid" ? "Đã chuyển nội dung First Aid về văn bản thường" : "Đã lưu mẫu giấy cho trang này");
      return;
    }
    updateActiveNote({
      paper: { ...activeNote.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
      text: { ...activeNote.text, font: "times", size: 12, align: "left" },
      ...transition,
    });
    setActiveTool("text");
    notify("Đã áp dụng bố cục First Aid");
  };

  return {
    INK_COLORS, PAPER_COLORS, PAPER_SIZES, PAPER_TEMPLATES, PEN_STYLES, STICKER_PRESETS, TEXT_BOX_BACKGROUND_COLORS, tools: TOOLS,
    activeTool, addCalloutAt, addFirstAidImage, addImageExcerpt, addSticker, addTextBoxAt, addTextExcerpt, basePaperMaxWidth,
    cancelFirstAidCrop, canRedo: noteInkSession.canRedo(activeNote.id), canUndo: noteInkSession.canUndo(activeNote.id), chooseNoteTool,
    commitStrokes, deleteExcerpt, editExcerpt, finishFirstAidPdfCrop, firstAidCropResult, highlighterWidth, inkColor, inkHistoryVersion,
    inkWidth, moveExcerpt, notePanel, notify, paperHeight, paperStyle, paperWidth, penStyle, redo, requestFirstAidPdfCrop, selectedExcerpt,
    selectedExcerptId, selectedExcerptIndex, selectedPaperSize, selectedTextBoxAppearance, setActiveTool, setHighlighterWidth, setInkColor,
    setInkWidth, setNotePanel, setPenStyle, setSelectedExcerptId, setShapeKind, shapeKind, shiftExcerptLayer, textLayerStyle, undo, updatePaper,
    updateActiveNote, updatePaperTemplate, updateSelectedTextBoxAppearance,
  };
}

export type NoteCanvasController = ReturnType<typeof useNoteCanvasController>;
