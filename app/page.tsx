"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BookOpen,
  Bold,
  Bookmark,
  BookmarkCheck,
  Brush,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  CloudOff,
  Copy,
  Crop,
  Download,
  DownloadCloud,
  Eraser,
  FileText,
  FolderOpen,
  Hand,
  Highlighter,
  Image,
  Italic,
  Lasso,
  Layers2,
  Languages,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  Menu,
  Minus,
  MousePointer2,
  Move,
  NotebookTabs,
  Omega,
  PaintBucket,
  PanelLeftOpen,
  Pencil,
  PenLine,
  PenTool,
  Plus,
  Redo2,
  RemoveFormatting,
  RefreshCw,
  RotateCw,
  Rows3,
  ScanText,
  Search,
  Settings2,
  Shapes,
  Sigma,
  Square,
  Strikethrough,
  Table2,
  TextSelect,
  TextCursorInput,
  Trash2,
  Underline,
  Undo2,
  UploadCloud,
  Volume2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  LazyPdfPageView,
  PdfPageView,
  type PdfAnnotation,
  type PdfCropResult,
  type PdfFitMode,
  type PdfInkAnnotation,
  type PdfMarkupAnnotation,
  type PdfRect,
  type PdfSelection,
  type PdfTool,
  type PdfViewMode,
} from "./pdf-reader";
import {
  downloadDriveFile,
  getDriveUser,
  listDriveAppFiles,
  requestDriveToken,
  revokeDriveToken,
  upsertDriveFile,
  type DriveAppFile,
  type DriveUser,
} from "./google-drive";
import {
  lookupEnglishVietnamese,
  oxfordLookupUrl,
  type EnglishVietnameseLookup,
} from "./dictionary";
import { pdfDocumentOptions } from "./pdf-config";
import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";

type Tool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox";
type InkTool = "pen" | "highlight" | "shape";
type PenStyle = "ballpoint" | "fountain" | "pencil" | "brush";
type ShapeKind = "line" | "arrow" | "rectangle" | "ellipse" | "circle";
type PaperSize = "a4" | "a5" | "b5" | "letter" | "square";
type PaperOrientation = "portrait" | "landscape";
type PaperTemplate = "blank" | "ruled" | "ruled-dense" | "grid" | "dotted" | "cornell";
type PaperColor = "white" | "ivory" | "yellow" | "mint" | "blue" | "dark";
type TextFont =
  | "handwriting"
  | "segoe"
  | "arial"
  | "tahoma"
  | "verdana"
  | "trebuchet"
  | "calibri"
  | "aptos"
  | "sans"
  | "times"
  | "cambria"
  | "georgia"
  | "palatino"
  | "serif"
  | "courier"
  | "cascadia"
  | "mono";
type TextAlign = "left" | "center" | "right" | "justify";
type TextLineHeight = "1" | "1.15" | "1.5" | "1.8" | "2";
type BulletStyle = "disc" | "circle" | "square" | "dash";
type TableBorderStyle = "solid" | "dashed" | "dotted" | "double";
type TextSettings = {
  font: TextFont;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
};
type TextToolbarState = TextSettings & {
  strike: boolean;
  unordered: boolean;
  ordered: boolean;
  backgroundColor: string;
  lineHeight: TextLineHeight;
  bulletStyle: BulletStyle;
};
type TableBorderSettings = { style: TableBorderStyle; width: number; color: string };
type TextInsertPopover = "symbols" | "equation" | "table" | null;
type Point = { x: number; y: number; pressure: number };
type Stroke = {
  id: string;
  tool: InkTool;
  penStyle?: PenStyle;
  shape?: ShapeKind;
  color: string;
  width: number;
  points: Point[];
};
type PaperSettings = {
  size: PaperSize;
  orientation: PaperOrientation;
  template: PaperTemplate;
  color: PaperColor;
};
type NotePage = {
  id: string;
  title: string;
  body: string;
  bodyHtml?: string;
  citationPage: number | null;
  strokes: Stroke[];
  paper: PaperSettings;
  text: TextSettings;
  excerpts: NoteExcerpt[];
};

type NoteExcerpt = {
  id: string;
  kind: "text" | "image";
  sourceKind?: "pdf" | "manual";
  text?: string;
  richText?: string;
  assetId?: string;
  documentId?: string;
  documentName?: string;
  page?: number;
  rect?: PdfRect;
  createdAt: number;
  layout?: ExcerptLayout;
};

type ExcerptLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  contentScale: number;
};

type Notebook = {
  id: string;
  title: string;
  pages: NotePage[];
  activePageId: string;
  createdAt: number;
};

type LibraryDocument = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  reader: ReaderState;
};

type ReaderState = {
  page: number;
  zoom: number;
  fitMode: PdfFitMode;
  rotation: number;
  viewMode: PdfViewMode;
  bookmarks: number[];
  annotations: PdfAnnotation[];
};

type PdfOutlineEntry = { title: string; page: number | null; depth: number };
type PdfRailTab = "pages" | "outline" | "search" | "marks";
type NotePanel = "ink" | "shape" | "text" | "paper" | null;
type PdfPanel = "view" | "ink" | null;
type SearchResult = { documentId: string | null; documentName: string; page: number; snippet: string; occurrences: number };
type DictionaryLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  sourceText: string;
  result: EnglishVietnameseLookup | null;
  error: string | null;
};

type WorkspaceItem = {
  id: string;
  kind: "document" | "collection" | "demo" | "empty";
  name: string;
  documents: LibraryDocument[];
  activeDocumentId: string | null;
  notebooks: Notebook[];
  activeNotebookId: string;
  sourcePage: number;
};

type PersistedLibrary = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
  savedAt?: number;
};

type LegacyNotebookState = {
  pages?: NotePage[];
  activeNoteId?: string;
  readerShare?: number;
};

type StrokeHistory = Record<string, { undo: Stroke[][]; redo: Stroke[][] }>;
type PdfHistory = Record<string, { undo: PdfAnnotation[][]; redo: PdfAnnotation[][] }>;

const STORAGE_KEY = "mednote-library-v2";
const LEGACY_STORAGE_KEY = "mednote-notebook-v1";
const DB_NAME = "mednote-local";
const DB_STORE = "documents";
const DRIVE_MANIFEST_ID = "manifest:v1";
const GOOGLE_CLIENT_ID = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const DESKTOP_GOOGLE_CLIENT_ID_KEY = "mednote-google-desktop-client-id";
const IS_DESKTOP_APP = typeof window !== "undefined" && Boolean(window.mednoteDesktop?.isDesktop);
const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const DEFAULT_PAPER: PaperSettings = { size: "a4", orientation: "portrait", template: "ruled", color: "white" };
const DEFAULT_TEXT: TextSettings = { font: "times", size: 15, color: "auto", bold: false, italic: false, underline: false, align: "left" };
const DEFAULT_READER: ReaderState = { page: 1, zoom: 1, fitMode: "page", rotation: 0, viewMode: "single", bookmarks: [], annotations: [] };

const PAPER_SIZES: Record<PaperSize, { label: string; dimensions: string; width: number; height: number; maxWidth: number }> = {
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
];

const PAPER_COLORS: { id: PaperColor; label: string; swatch: string }[] = [
  { id: "white", label: "Trắng", swatch: "#ffffff" },
  { id: "ivory", label: "Kem", swatch: "#fffaf0" },
  { id: "yellow", label: "Vàng nhạt", swatch: "#fff8cf" },
  { id: "mint", label: "Xanh bạc hà", swatch: "#eefaf3" },
  { id: "blue", label: "Xanh nhạt", swatch: "#eef7fc" },
  { id: "dark", label: "Tối", swatch: "#263139" },
];

const PEN_STYLES: { id: PenStyle; label: string; icon: typeof PenTool }[] = [
  { id: "ballpoint", label: "Bút bi", icon: PenLine },
  { id: "fountain", label: "Bút máy", icon: PenTool },
  { id: "pencil", label: "Bút chì", icon: Pencil },
  { id: "brush", label: "Bút cọ", icon: Brush },
];

const TEXT_FONTS: { id: TextFont; label: string; family: string }[] = [
  { id: "times", label: "Times New Roman", family: '"Times New Roman", Times, serif' },
  { id: "segoe", label: "Segoe UI", family: '"Segoe UI", Arial, sans-serif' },
  { id: "arial", label: "Arial", family: 'Arial, "Helvetica Neue", sans-serif' },
  { id: "tahoma", label: "Tahoma", family: 'Tahoma, "Segoe UI", sans-serif' },
  { id: "verdana", label: "Verdana", family: 'Verdana, Geneva, sans-serif' },
  { id: "trebuchet", label: "Trebuchet MS", family: '"Trebuchet MS", Arial, sans-serif' },
  { id: "calibri", label: "Calibri", family: 'Calibri, Carlito, "Segoe UI", sans-serif' },
  { id: "aptos", label: "Aptos", family: 'Aptos, Calibri, "Segoe UI", sans-serif' },
  { id: "sans", label: "Không chân (hệ thống)", family: 'Inter, "Segoe UI", Arial, sans-serif' },
  { id: "cambria", label: "Cambria", family: 'Cambria, Georgia, serif' },
  { id: "georgia", label: "Georgia", family: 'Georgia, "Times New Roman", serif' },
  { id: "palatino", label: "Palatino Linotype", family: '"Palatino Linotype", Palatino, serif' },
  { id: "serif", label: "Có chân (hệ thống)", family: 'Georgia, "Times New Roman", serif' },
  { id: "courier", label: "Courier New", family: '"Courier New", Courier, monospace' },
  { id: "cascadia", label: "Cascadia Mono", family: '"Cascadia Mono", Consolas, monospace' },
  { id: "mono", label: "Đơn cách (hệ thống)", family: '"Courier New", monospace' },
  { id: "handwriting", label: "Viết tay", family: '"Segoe Print", "Bradley Hand", cursive' },
];

const INK_COLORS = ["#2465a8", "#c94b50", "#111111", "#16836f", "#f6d96b"];
const TEXT_BACKGROUND_COLORS = ["transparent", "#fff2a8", "#ccebf3", "#d8f1dc", "#f7d5dd"];
const SYMBOL_GROUPS = [
  { label: "Toán", symbols: ["±", "×", "÷", "≈", "≠", "≤", "≥", "∞", "√", "∑", "∫", "∆"] },
  { label: "Hy Lạp", symbols: ["α", "β", "γ", "δ", "θ", "λ", "μ", "π", "σ", "φ", "Ω"] },
  { label: "Y học", symbols: ["°", "‰", "µ", "→", "←", "↔", "↑", "↓", "♂", "♀", "®", "©"] },
];
const EQUATION_PRESETS = ["x² + y² = z²", "x₁ + x₂", "a⁄b", "√x", "∑ᵢ₌₁ⁿ xᵢ", "∫ₐᵇ f(x)dx", "Δx⁄Δt", "μ ± σ"];

function cssColorToHex(color: string) {
  if (color.startsWith("#")) return color;
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return "#111111";
  return `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

function cssBackgroundColor(color: string) {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)" ? "transparent" : cssColorToHex(color);
}

function closestElementFromNode(node: Node | null) {
  return node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement ?? null;
}

function closestWithin<T extends Element>(node: Node | null, selector: string, editor: HTMLElement) {
  const element = closestElementFromNode(node)?.closest<T>(selector) ?? null;
  return element && editor.contains(element) ? element : null;
}

function normalizedLineHeight(style: CSSStyleDeclaration): TextLineHeight {
  const fontSize = Number.parseFloat(style.fontSize) || DEFAULT_TEXT.size;
  const raw = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(raw)) return "1.15";
  const ratio = style.lineHeight.endsWith("px") ? raw / fontSize : raw;
  return (["1", "1.15", "1.5", "1.8", "2"] as TextLineHeight[]).reduce((nearest, option) => Math.abs(Number(option) - ratio) < Math.abs(Number(nearest) - ratio) ? option : nearest, "1.15");
}

function normalizedBulletStyle(value: string): BulletStyle {
  if (value === "circle" || value === "square") return value;
  if (value.includes("–") || value.includes("-") || value === "none") return "dash";
  return "disc";
}

function textFontFromFamily(family: string): TextFont {
  const normalized = family.toLocaleLowerCase().replace(/["']/g, "");
  return TEXT_FONTS.find((font) => normalized.includes(font.family.split(",")[0].replace(/["']/g, "").toLocaleLowerCase()))?.id ?? "times";
}

function textSettingsAtRange(editor: HTMLElement, range: Range | null): TextToolbarState {
  const anchor = range?.startContainer ?? editor;
  const element = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
  const style = window.getComputedStyle(element ?? editor);
  const weight = Number(style.fontWeight);
  const align: TextAlign = style.textAlign === "center" ? "center" : style.textAlign === "right" ? "right" : style.textAlign === "justify" ? "justify" : "left";
  const list = closestWithin<HTMLUListElement>(anchor, "ul", editor);
  return {
    font: textFontFromFamily(style.fontFamily),
    size: Math.max(8, Math.min(96, Math.round(Number.parseFloat(style.fontSize) || DEFAULT_TEXT.size))),
    color: cssColorToHex(style.color),
    bold: document.queryCommandState("bold") || weight >= 600 || style.fontWeight === "bold",
    italic: document.queryCommandState("italic") || style.fontStyle === "italic",
    underline: document.queryCommandState("underline") || style.textDecorationLine.includes("underline"),
    align,
    strike: document.queryCommandState("strikeThrough") || style.textDecorationLine.includes("line-through"),
    unordered: document.queryCommandState("insertUnorderedList"),
    ordered: document.queryCommandState("insertOrderedList"),
    backgroundColor: cssBackgroundColor(style.backgroundColor),
    lineHeight: normalizedLineHeight(style),
    bulletStyle: normalizedBulletStyle(list ? window.getComputedStyle(list).listStyleType : "disc"),
  };
}

const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "pointer", label: "Chọn", icon: MousePointer2 },
  { id: "pen", label: "Bút", icon: PenTool },
  { id: "highlight", label: "Tô sáng", icon: Highlighter },
  { id: "eraser", label: "Tẩy chính xác", icon: Eraser },
  { id: "lasso", label: "Khoanh chọn", icon: Lasso },
  { id: "shape", label: "Hình học", icon: Shapes },
  { id: "text", label: "Nhập chữ", icon: TextCursorInput },
  { id: "textbox", label: "Tạo hộp chữ", icon: ScanText },
];

const PDF_TOOLS: { id: PdfTool; label: string; shortLabel: string; icon: typeof MousePointer2 }[] = [
  { id: "pan", label: "Bàn tay — kéo trang", shortLabel: "Kéo", icon: Hand },
  { id: "select", label: "Chọn và sao chép chữ", shortLabel: "Chọn chữ", icon: TextSelect },
  { id: "highlight", label: "Tô sáng chữ", shortLabel: "Tô sáng", icon: Highlighter },
  { id: "underline", label: "Gạch chân chữ", shortLabel: "Gạch chân", icon: Underline },
  { id: "strikeout", label: "Gạch ngang chữ", shortLabel: "Gạch ngang", icon: Strikethrough },
  { id: "pen", label: "Viết trên PDF", shortLabel: "Bút", icon: PenTool },
  { id: "eraser", label: "Tẩy nét bút trên PDF", shortLabel: "Tẩy", icon: Eraser },
  { id: "crop", label: "Cắt hình hoặc bảng sang note", shortLabel: "Cắt", icon: Crop },
];

const starterStrokes: Stroke[] = [
  {
    id: "starter-red-underline",
    tool: "pen",
    color: "#c94b50",
    width: 2.4,
    points: Array.from({ length: 18 }, (_, index) => ({
      x: 0.19 + index * 0.035,
      y: 0.135 + Math.sin(index / 2.6) * 0.002,
      pressure: 0.55,
    })),
  },
  {
    id: "starter-blue-note",
    tool: "pen",
    color: "#2465a8",
    width: 2.2,
    points: [
      { x: 0.7, y: 0.55, pressure: 0.5 },
      { x: 0.75, y: 0.54, pressure: 0.5 },
      { x: 0.79, y: 0.56, pressure: 0.5 },
      { x: 0.83, y: 0.53, pressure: 0.5 },
    ],
  },
];

const initialPages: NotePage[] = [
  {
    id: "note-1",
    title: "BỆNH THẦN KINH ĐÁI THÁO ĐƯỜNG",
    body:
      "CƠ CHẾ BỆNH SINH\n\n• Tăng đường huyết mạn tính.\n• Hoạt hóa con đường polyol → tích lũy sorbitol.\n• Sản phẩm glycat hóa nâng cao (AGEs) → tổn thương thần kinh.\n• Stress oxy hóa → tổn thương ty thể và tế bào Schwann.\n• Thiếu máu vi mạch nuôi thần kinh.\n\nĐIỂM CẦN NHỚ\n\n• Thần kinh ngoại biên thường gặp nhất: đa dây thần kinh đối xứng.\n• Biểu hiện: tê bì, kiến bò, đau rát, giảm cảm giác.\n• Đánh giá: monofilament 10 g, âm thoa 128 Hz.\n• Điều trị: kiểm soát đường huyết, giảm đau và chăm sóc bàn chân.",
    citationPage: 126,
    strokes: starterStrokes,
    paper: DEFAULT_PAPER,
    text: DEFAULT_TEXT,
    excerpts: [],
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function normalizePaper(paper?: Partial<PaperSettings>): PaperSettings {
  return { ...DEFAULT_PAPER, ...paper };
}

function normalizeText(text?: Partial<TextSettings>): TextSettings {
  return { ...DEFAULT_TEXT, ...text };
}

function defaultExcerptLayout(index: number, kind: NoteExcerpt["kind"]): ExcerptLayout {
  const column = index % 2;
  const row = Math.floor(index / 2) % 3;
  return {
    x: .07 + column * .47,
    y: Math.min(.69, .52 + row * .08),
    width: kind === "image" ? .4 : .38,
    height: kind === "image" ? .3 : .25,
    contentScale: 1,
  };
}

function normalizeExcerptLayout(layout: Partial<ExcerptLayout> | undefined, index: number, kind: NoteExcerpt["kind"]): ExcerptLayout {
  const fallback = defaultExcerptLayout(index, kind);
  const width = Math.min(.72, Math.max(.2, layout?.width ?? fallback.width));
  const height = Math.min(.62, Math.max(.16, layout?.height ?? fallback.height));
  return {
    x: Math.min(1 - width, Math.max(0, layout?.x ?? fallback.x)),
    y: Math.min(1 - height, Math.max(0, layout?.y ?? fallback.y)),
    width,
    height,
    contentScale: Math.min(2.4, Math.max(.65, layout?.contentScale ?? 1)),
  };
}

function normalizePage(page: NotePage): NotePage {
  const normalizedText = normalizeText(page.text);
  return {
    ...page,
    body: page.body ?? "",
    bodyHtml: sanitizeRichTextHtml(page.bodyHtml ?? plainTextToRichHtml(page.body ?? "")),
    strokes: Array.isArray(page.strokes) ? page.strokes : [],
    paper: normalizePaper(page.paper),
    text: page.bodyHtml == null && normalizedText.font === "handwriting" ? { ...normalizedText, font: "times" } : normalizedText,
    excerpts: Array.isArray(page.excerpts)
      ? page.excerpts.map((excerpt, index) => ({
          ...excerpt,
          sourceKind: excerpt.sourceKind ?? "pdf",
          richText: excerpt.kind === "text" ? sanitizeRichTextHtml(excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")) : undefined,
          layout: normalizeExcerptLayout(excerpt.layout, index, excerpt.kind),
        }))
      : [],
  };
}

function normalizeReader(reader?: Partial<ReaderState>): ReaderState {
  return {
    ...DEFAULT_READER,
    ...reader,
    bookmarks: Array.isArray(reader?.bookmarks) ? reader.bookmarks : [],
    annotations: Array.isArray(reader?.annotations) ? reader.annotations : [],
  };
}

function normalizeWorkspace(workspace: WorkspaceItem): WorkspaceItem {
  return {
    ...workspace,
    documents: workspace.documents.map((document) => ({ ...document, reader: normalizeReader(document.reader) })),
    notebooks: workspace.notebooks.map((notebook) => ({
      ...notebook,
      pages: notebook.pages.map(normalizePage),
    })),
  };
}

function createBlankPage(citationPage = 1, index = 1, paper: PaperSettings = DEFAULT_PAPER, text: TextSettings = DEFAULT_TEXT): NotePage {
  return {
    id: uid("page"),
    title: `GHI CHÚ ${index}`,
    body: "",
    bodyHtml: "",
    citationPage,
    strokes: [],
    paper: { ...paper },
    text: { ...text },
    excerpts: [],
  };
}

function createNotebook(title: string, citationPage = 1): Notebook {
  const page = createBlankPage(citationPage);
  return {
    id: uid("notebook"),
    title,
    pages: [page],
    activePageId: page.id,
    createdAt: Date.now(),
  };
}

function createDemoWorkspace(pages: NotePage[] = initialPages): WorkspaceItem {
  const notebook: Notebook = {
    id: "demo-notebook",
    title: "Ghi chú mẫu",
    pages,
    activePageId: pages[0].id,
    createdAt: 0,
  };
  return {
    id: "demo-workspace",
    kind: "demo",
    name: "Diabetic Neuropathy — Chapter 3",
    documents: [],
    activeDocumentId: null,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 126,
  };
}

function createEmptyWorkspace(): WorkspaceItem {
  const notebook = createNotebook("Ghi chú mới");
  return {
    id: "empty-workspace",
    kind: "empty",
    name: "Chưa có tài liệu",
    documents: [],
    activeDocumentId: null,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  };
}

function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalPdf(blob: Blob, document: LibraryDocument) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put({ blob, name: document.name }, `pdf:${document.id}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readLocalPdf(documentId: string) {
  const db = await openLocalDb();
  const result = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(`pdf:${documentId}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function deleteLocalPdf(documentId: string) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(`pdf:${documentId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function deleteLocalAsset(assetId: string) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(`asset:${assetId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function saveLocalAsset(assetId: string, blob: Blob) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put({ blob }, `asset:${assetId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readLocalAsset(assetId: string) {
  const db = await openLocalDb();
  const result = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(`asset:${assetId}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result?.blob;
}

async function loadStoredPdfDocument(documentId: string) {
  const stored = await readLocalPdf(documentId);
  if (!stored) return null;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const buffer = await stored.blob.arrayBuffer();
  return pdfjs.getDocument(pdfDocumentOptions(new Uint8Array(buffer))).promise;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function plainTextToRichHtml(value: string) {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

function sanitizeRichTextHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD"]);
  const allowedStyles = ["fontFamily", "fontSize", "color", "backgroundColor", "fontWeight", "fontStyle", "textDecoration", "textAlign", "lineHeight", "listStyleType", "borderCollapse", "borderColor", "borderStyle", "borderWidth", "width", "minWidth", "padding", "verticalAlign"] as const;
  Array.from(template.content.querySelectorAll<HTMLElement>("*")).forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(element.tagName)) {
        element.remove();
        return;
      }
      const parent = element.parentNode;
      while (parent && element.firstChild) parent.insertBefore(element.firstChild, element);
      element.remove();
      return;
    }
    const styles = Object.fromEntries(allowedStyles.map((property) => [property, element.style[property]]));
    const face = element.tagName === "FONT" ? element.getAttribute("face") : null;
    const color = element.tagName === "FONT" ? element.getAttribute("color") : null;
    const size = element.tagName === "FONT" ? element.getAttribute("size") : null;
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
    allowedStyles.forEach((property) => {
      const styleValue = styles[property];
      if (styleValue) element.style[property] = styleValue;
    });
    if (face) element.setAttribute("face", face);
    if (color) element.setAttribute("color", color);
    if (size && /^[1-7]$/.test(size)) element.setAttribute("size", size);
  });
  return template.innerHTML;
}

function rangeBelongsToEditor(range: Range, editor: HTMLElement) {
  const container = range.commonAncestorContainer;
  return container === editor || editor.contains(container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode);
}

type RichTextEditorProps = {
  editorId: string;
  className: string;
  html: string;
  editable: boolean;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onChange: (html: string, text: string) => void;
  onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeInput: (editorId: string, editor: HTMLElement) => void;
};

function RichTextEditor({ editorId, className, html, editable, placeholder, ariaLabel, autoFocus = false, onChange, onActivate, onNormalizeInput }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.innerHTML === html || document.activeElement === editor) return;
    editor.innerHTML = html;
  }, [html]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editable || !autoFocus || !editor) return;
    const frame = window.requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (!selection) return;
      const currentRange = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (currentRange && rangeBelongsToEditor(currentRange, editor)) {
        onActivate(editorId, editor, currentRange.cloneRange());
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      onActivate(editorId, editor, range);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, editable, editorId, onActivate]);

  const captureSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    onActivate(editorId, editor!, range && rangeBelongsToEditor(range, editor!) ? range.cloneRange() : null);
  };

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onNormalizeInput(editorId, editor);
    onChange(sanitizeRichTextHtml(editor.innerHTML), editor.innerText.replace(/\u00a0/g, " "));
    captureSelection();
  };

  return (
    <div
      ref={editorRef}
      className={`${className} rich-text-editor`}
      data-rich-editor-id={editorId}
      data-placeholder={placeholder}
      contentEditable={editable}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      spellCheck={false}
      onFocus={captureSelection}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      onInput={emitChange}
      onPaste={(event) => {
        if (!editable) return;
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      }}
      onDrop={(event) => {
        if (!editable) return;
        event.preventDefault();
        document.execCommand("insertText", false, event.dataTransfer.getData("text/plain"));
      }}
    />
  );
}

function StoredAssetImage({ assetId, alt }: { assetId: string; alt: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    void readLocalAsset(assetId).then((blob) => {
      if (!blob || disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  return source ? <img src={source} alt={alt} /> : <span className="excerpt-image-loading">Đang mở ảnh…</span>;
}

type DraggableExcerptProps = {
  excerpt: NoteExcerpt;
  index: number;
  selected: boolean;
  selectable: boolean;
  movable: boolean;
  editable: boolean;
  onSelect: (excerptId: string) => void;
  onMove: (excerptId: string, layout: ExcerptLayout) => void;
  onEdit: (excerptId: string, changes: Partial<NoteExcerpt>) => void;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
  onOpenSource: (excerpt: NoteExcerpt) => void;
  onDelete: (excerptId: string) => void;
};

function DraggableExcerpt({ excerpt, index, selected, selectable, movable, editable, onSelect, onMove, onEdit, onTextActivate, onNormalizeTextInput, onOpenSource, onDelete }: DraggableExcerptProps) {
  const articleRef = useRef<HTMLElement>(null);
  const savedLayout = normalizeExcerptLayout(excerpt.layout, index, excerpt.kind);
  const [layout, setLayout] = useState(savedLayout);
  const interactionRef = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    origin: ExcerptLayout;
    hostWidth: number;
    hostHeight: number;
    moved: boolean;
    current: ExcerptLayout;
  } | null>(null);

  useEffect(() => {
    if (!interactionRef.current) setLayout(savedLayout);
  }, [savedLayout.contentScale, savedLayout.height, savedLayout.width, savedLayout.x, savedLayout.y]);

  const startInteraction = (event: React.PointerEvent<HTMLButtonElement>, mode: "move" | "resize") => {
    if (!movable) return;
    const host = articleRef.current?.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: layout,
      hostWidth: Math.max(1, rect.width),
      hostHeight: Math.max(1, rect.height),
      moved: false,
      current: layout,
    };
  };

  const updateInteraction = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.startX) / state.hostWidth;
    const dy = (event.clientY - state.startY) / state.hostHeight;
    if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
    state.current = state.mode === "move"
      ? {
          ...state.origin,
          x: Math.min(1 - state.origin.width, Math.max(0, state.origin.x + dx)),
          y: Math.min(1 - state.origin.height, Math.max(0, state.origin.y + dy)),
        }
      : {
          ...state.origin,
          width: Math.min(1 - state.origin.x, Math.max(.18, state.origin.width + dx)),
          height: Math.min(1 - state.origin.y, Math.max(.14, state.origin.height + dy)),
        };
    setLayout(state.current);
  };

  const finishInteraction = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    if (state.moved) onMove(excerpt.id, state.current);
  };

  const changeContentScale = (step: number) => {
    const next = { ...layout, contentScale: Math.min(2.4, Math.max(.65, Number((layout.contentScale + step).toFixed(2)))) };
    setLayout(next);
    onMove(excerpt.id, next);
  };

  return (
    <article
      ref={articleRef}
      className={`note-excerpt excerpt-${excerpt.kind} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}
      style={{ left: `${layout.x * 100}%`, top: `${layout.y * 100}%`, width: `${layout.width * 100}%`, height: `${layout.height * 100}%`, zIndex: index + 1, "--excerpt-content-scale": layout.contentScale } as React.CSSProperties}
      onPointerDown={(event) => {
        if (!selectable) return;
        event.stopPropagation();
        onSelect(excerpt.id);
      }}
      aria-selected={selected}
    >
      {selected && (movable || editable) && (
        <div className="excerpt-object-controls">
          <button
            className="excerpt-drag-handle"
            disabled={!movable}
            onPointerDown={(event) => startInteraction(event, "move")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
            aria-label="Kéo để di chuyển khung"
            title={movable ? "Kéo để di chuyển" : "Dùng công cụ Chọn để di chuyển"}
          ><Move size={13} /></button>
          <span className="excerpt-scale-controls" aria-label="Kích thước nội dung">
            <button onClick={() => changeContentScale(-.12)} disabled={!movable || layout.contentScale <= .65} title="Thu nhỏ nội dung" aria-label="Thu nhỏ nội dung"><Minus size={12} /></button>
            <b>{Math.round(layout.contentScale * 100)}%</b>
            <button onClick={() => changeContentScale(.12)} disabled={!movable || layout.contentScale >= 2.4} title="Phóng to nội dung" aria-label="Phóng to nội dung"><Plus size={12} /></button>
          </span>
          {excerpt.kind === "text" && <span className="excerpt-edit-indicator"><Pencil size={11} />{editable ? "Đang sửa" : "Chữ"}</span>}
          <button className="excerpt-delete-control" onClick={() => onDelete(excerpt.id)} aria-label="Xóa khung" title="Xóa khung"><Trash2 size={12} /></button>
        </div>
      )}
      <div className="excerpt-content">
        {excerpt.kind === "text" ? (
          <RichTextEditor
            editorId={`excerpt:${excerpt.id}`}
            className="excerpt-rich-editor"
            html={excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")}
            editable={editable}
            autoFocus={editable}
            placeholder={excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}
            ariaLabel={excerpt.sourceKind === "manual" ? "Nội dung hộp chữ" : "Nội dung đoạn chữ đưa từ PDF"}
            onChange={(richText, text) => onEdit(excerpt.id, { richText, text })}
            onActivate={onTextActivate}
            onNormalizeInput={onNormalizeTextInput}
          />
        ) : excerpt.assetId ? (
          <div className="excerpt-image-viewport"><div style={{ transform: `scale(${layout.contentScale})` }}><StoredAssetImage assetId={excerpt.assetId} alt={`Hình từ ${excerpt.documentName ?? "PDF"}, trang ${excerpt.page ?? 1}`} /></div></div>
        ) : <span>Không tìm thấy ảnh</span>}
      </div>
      {excerpt.sourceKind !== "manual" && excerpt.documentId && excerpt.page && <div className="excerpt-source"><button onClick={() => onOpenSource(excerpt)} title="Quay lại đúng vị trí nguồn">{excerpt.kind === "image" ? <Image size={13} /> : <BookOpen size={13} />}<span>{excerpt.documentName} · trang {excerpt.page}</span></button></div>}
      {selected && movable && <button
        className="excerpt-resize-handle"
        onPointerDown={(event) => startInteraction(event, "resize")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo để đổi kích thước khung"
        title="Kéo để đổi kích thước khung"
      ><Maximize2 size={11} /></button>}
    </article>
  );
}

async function readLegacyPdf() {
  const db = await openLocalDb();
  const result = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("current-pdf");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function DemoDocument({ page }: { page: number }) {
  return (
    <article className="document-paper">
      <div className="page-meta"><strong>{page}</strong><em>Diabetes Mellitus: A Clinical Textbook, 5th Edition</em></div>
      <h1>3.4&nbsp;&nbsp; DIABETIC NEUROPATHY</h1>
      <div className="document-columns">
        <section>
          <h2>3.4.1&nbsp;&nbsp; Introduction</h2>
          <p>Diabetic neuropathy is the most common chronic complication of diabetes mellitus and a leading cause of morbidity. It may involve the peripheral and autonomic nervous systems.</p>
          <h2>3.4.3&nbsp;&nbsp; Clinical Features</h2>
          <p>Peripheral neuropathy typically presents with distal symmetrical sensory loss and neuropathic pain.</p>
          <ul><li>Numbness, tingling and burning pain</li><li>Loss of vibration and temperature sensation</li><li>Reduced ankle reflexes</li></ul>
          <div className="figure-card">
            <div className="mechanism-row"><span>Hyperglycemia</span><b>→</b><span>Polyol pathway</span><b>→</b><span>Nerve damage</span></div>
            <div className="nerve-illustration"><i /><i /><i /><i /><i /></div>
            <small>Figure 3.7. Proposed mechanisms in diabetic peripheral neuropathy.</small>
          </div>
        </section>
        <section>
          <h2>3.4.2&nbsp;&nbsp; Pathophysiology</h2>
          <p>The pathogenesis is multifactorial, involving metabolic, vascular and neurotrophic mechanisms.</p>
          <ul><li>Chronic hyperglycemia → polyol pathway activation</li><li>Advanced glycation end products (AGEs)</li><li>Oxidative stress and inflammation</li><li>Microvascular ischemia</li><li>Neurotrophic factor deficiency</li></ul>
          <h2>3.4.4&nbsp;&nbsp; Diagnosis</h2>
          <p>Diagnosis is primarily clinical and based on history and physical examination.</p>
          <ul><li>10-g monofilament test</li><li>Vibration perception (128-Hz tuning fork)</li><li>Nerve conduction studies when needed</li></ul>
          <h2>3.4.5&nbsp;&nbsp; Management</h2>
          <ul><li>Optimal glycemic control</li><li>Pain management</li><li>Foot care and ulcer prevention</li></ul>
        </section>
      </div>
    </article>
  );
}

function PdfPageCanvas({ document, page, zoom }: { document: PDFDocumentProxy; page: number; zoom: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let renderTask: PDFRenderTask | null = null;
    let requestNumber = 0;
    let rendering = false;
    const wrapper = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const drainRenderQueue = async () => {
      if (rendering) return;
      rendering = true;
      while (!disposed) {
        const currentRequest = requestNumber;
        const pdfPage = await document.getPage(page);
        if (disposed) break;
        if (currentRequest !== requestNumber) continue;
        const base = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(260, wrapper.clientWidth - 2);
        const scale = (available / base.width) * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) break;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        try {
          await renderTask.promise;
        } catch (error) {
          if (!disposed && (error as Error).name !== "RenderingCancelledException") throw error;
        } finally {
          renderTask = null;
        }
        if (currentRequest === requestNumber) {
          if (!disposed) setLoading(false);
          break;
        }
      }
      rendering = false;
    };

    const requestRender = () => {
      requestNumber += 1;
      renderTask?.cancel();
      void drainRenderQueue();
    };

    const observer = new ResizeObserver(requestRender);
    observer.observe(wrapper);
    return () => {
      disposed = true;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [document, page, zoom]);

  return <div className="pdf-canvas-wrap" ref={wrapRef}>{loading && <div className="pdf-loading">Đang dựng trang…</div>}<canvas ref={canvasRef} /></div>;
}

function PdfThumbnail({ document, page, active, onClick }: { document: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(page <= 4);
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const root = button.closest(".pdf-thumbnails");
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible(true);
    }, { root, rootMargin: "500px 0px" });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let task: PDFRenderTask | null = null;
    void document.getPage(page).then((pdfPage) => {
      if (disposed || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: 72 / base.width });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * 1.5);
      canvas.height = Math.floor(viewport.height * 1.5);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(1.5, 0, 0, 1.5, 0, 0);
      task = pdfPage.render({ canvas, canvasContext: context, viewport });
      return task.promise;
    }).catch(() => undefined);
    return () => { disposed = true; task?.cancel(); };
  }, [document, page, visible]);
  return <button ref={buttonRef} className={`pdf-thumb ${active ? "active" : ""}`} onClick={onClick}><span className="mini-paper pdf-mini">{visible ? <canvas ref={canvasRef} /> : <i className="thumb-placeholder" />}</span><span>{page}</span></button>;
}

function drawStroke(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stroke: Stroke) {
  if (!stroke.points.length) return;
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  const first = stroke.points[0];
  const last = stroke.points.at(-1)!;
  const startX = first.x * canvasWidth;
  const startY = first.y * canvasHeight;
  const endX = last.x * canvasWidth;
  const endY = last.y * canvasHeight;
  context.save();
  const penStyle = stroke.penStyle ?? "ballpoint";
  context.globalAlpha = stroke.tool === "highlight" ? 0.3 : penStyle === "pencil" ? 0.58 : 1;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.tool === "shape") {
    context.beginPath();
    if (stroke.shape === "rectangle") {
      context.rect(startX, startY, endX - startX, endY - startY);
    } else if (stroke.shape === "ellipse" || stroke.shape === "circle") {
      context.ellipse((startX + endX) / 2, (startY + endY) / 2, Math.abs(endX - startX) / 2, Math.abs(endY - startY) / 2, 0, 0, Math.PI * 2);
    } else {
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
    }
    context.stroke();
    if (stroke.shape === "arrow") {
      const angle = Math.atan2(endY - startY, endX - startX);
      const head = Math.max(10, stroke.width * 4.5);
      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(endX - head * Math.cos(angle - Math.PI / 7), endY - head * Math.sin(angle - Math.PI / 7));
      context.moveTo(endX, endY);
      context.lineTo(endX - head * Math.cos(angle + Math.PI / 7), endY - head * Math.sin(angle + Math.PI / 7));
      context.stroke();
    }
    context.restore();
    return;
  }

  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(startX, startY, Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  const widthForPoint = (point: Point) => {
    if (stroke.tool === "highlight") return stroke.width;
    if (penStyle === "fountain") return stroke.width * (0.48 + point.pressure * 1.02);
    if (penStyle === "brush") return stroke.width * (0.35 + point.pressure * 1.5);
    if (penStyle === "pencil") return stroke.width * (0.72 + point.pressure * 0.28);
    return stroke.width * (0.9 + point.pressure * 0.18);
  };
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    const previous = stroke.points[index - 1];
    context.beginPath();
    context.moveTo(previous.x * canvasWidth, previous.y * canvasHeight);
    context.lineWidth = widthForPoint(point);
    context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    context.stroke();
  }
  context.restore();
}

function pointsForStroke(stroke: Stroke): Point[] {
  if (stroke.tool !== "shape" || stroke.points.length < 2) return stroke.points;
  const start = stroke.points[0];
  const end = stroke.points.at(-1)!;
  if (stroke.shape === "rectangle") {
    return [start, { x: end.x, y: start.y, pressure: .5 }, end, { x: start.x, y: end.y, pressure: .5 }, start];
  }
  if (stroke.shape === "ellipse" || stroke.shape === "circle") {
    return Array.from({ length: 41 }, (_, index) => {
      const angle = (index / 40) * Math.PI * 2;
      return {
        x: (start.x + end.x) / 2 + Math.cos(angle) * Math.abs(end.x - start.x) / 2,
        y: (start.y + end.y) / 2 + Math.sin(angle) * Math.abs(end.y - start.y) / 2,
        pressure: .5,
      };
    });
  }
  return [start, end];
}

function boundsForStrokes(strokes: Stroke[]) {
  const points = strokes.flatMap(pointsForStroke);
  if (!points.length) return null;
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegmentPixels(point: Point, start: Point, end: Point, canvas: HTMLCanvasElement) {
  const px = point.x * canvas.clientWidth;
  const py = point.y * canvas.clientHeight;
  const ax = start.x * canvas.clientWidth;
  const ay = start.y * canvas.clientHeight;
  const bx = end.x * canvas.clientWidth;
  const by = end.y * canvas.clientHeight;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

function eraseStrokeAtPoint(stroke: Stroke, point: Point, canvas: HTMLCanvasElement, radius: number): Stroke[] {
  const samples = pointsForStroke(stroke);
  if (stroke.tool === "shape") {
    const hit = samples.length === 1
      ? Math.hypot((samples[0].x - point.x) * canvas.clientWidth, (samples[0].y - point.y) * canvas.clientHeight) <= radius
      : samples.slice(1).some((sample, index) => distanceToSegmentPixels(point, samples[index], sample, canvas) <= radius + stroke.width / 2);
    return hit ? [] : [stroke];
  }
  if (stroke.points.length === 1) {
    return Math.hypot((stroke.points[0].x - point.x) * canvas.clientWidth, (stroke.points[0].y - point.y) * canvas.clientHeight) <= radius ? [] : [stroke];
  }

  const parts: Point[][] = [];
  let currentPart: Point[] = [];
  let touched = false;
  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    const start = stroke.points[index];
    const end = stroke.points[index + 1];
    if (distanceToSegmentPixels(point, start, end, canvas) <= radius + stroke.width / 2) {
      touched = true;
      if (currentPart.length > 1) parts.push(currentPart);
      currentPart = [];
    } else {
      if (!currentPart.length) currentPart.push(start);
      currentPart.push(end);
    }
  }
  if (currentPart.length > 1) parts.push(currentPart);
  if (!touched) return [stroke];
  return parts.map((points, index) => ({ ...stroke, id: index === 0 ? stroke.id : uid("stroke-part"), points }));
}

type InkCanvasProps = {
  tool: Tool;
  color: string;
  width: number;
  penStyle: PenStyle;
  shape: ShapeKind;
  strokes: Stroke[];
  onCommit: (next: Stroke[], previous: Stroke[]) => void;
};

function InkCanvas({ tool, color, width, penStyle, shape, strokes, onCommit }: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const workingStrokes = useRef(strokes);
  const currentStroke = useRef<Stroke | null>(null);
  const beforeStrokes = useRef<Stroke[]>(strokes);
  const lassoPath = useRef<Point[]>([]);
  const interaction = useRef<"idle" | "draw" | "erase" | "lasso" | "move" | "resize">("idle");
  const gestureStart = useRef<Point | null>(null);
  const lastEraserPoint = useRef<Point | null>(null);
  const baseSelectionBounds = useRef<ReturnType<typeof boundsForStrokes>>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);

  const renderCanvas = useCallback((displayStrokes: Stroke[] = workingStrokes.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(canvas.clientWidth * ratio) || canvas.height !== Math.floor(canvas.clientHeight * ratio)) {
      canvas.width = Math.floor(canvas.clientWidth * ratio);
      canvas.height = Math.floor(canvas.clientHeight * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    displayStrokes.forEach((stroke) => drawStroke(context, canvas, stroke));

    const selected = displayStrokes.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
    const bounds = boundsForStrokes(selected);
    if (bounds) {
      const left = bounds.left * canvas.clientWidth;
      const top = bounds.top * canvas.clientHeight;
      const boxWidth = Math.max(12, (bounds.right - bounds.left) * canvas.clientWidth);
      const boxHeight = Math.max(12, (bounds.bottom - bounds.top) * canvas.clientHeight);
      context.save();
      context.strokeStyle = "#0e6b70";
      context.fillStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.strokeRect(left - 5, top - 5, boxWidth + 10, boxHeight + 10);
      context.setLineDash([]);
      context.fillRect(left + boxWidth + 1, top + boxHeight + 1, 9, 9);
      context.strokeRect(left + boxWidth + 1, top + boxHeight + 1, 9, 9);
      context.restore();
    }

    if (lassoPath.current.length > 1) {
      context.save();
      context.strokeStyle = "#0e6b70";
      context.fillStyle = "rgba(14,107,112,.06)";
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.beginPath();
      context.moveTo(lassoPath.current[0].x * canvas.clientWidth, lassoPath.current[0].y * canvas.clientHeight);
      lassoPath.current.slice(1).forEach((point) => context.lineTo(point.x * canvas.clientWidth, point.y * canvas.clientHeight));
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }
  }, []);

  useEffect(() => {
    strokesRef.current = strokes;
    workingStrokes.current = strokes;
    selectedIdsRef.current = selectedIdsRef.current.filter((id) => strokes.some((stroke) => stroke.id === id));
    if (selectedIdsRef.current.length !== selectedIds.length) setSelectedIds(selectedIdsRef.current);
    renderCanvas(strokes);
  }, [renderCanvas, selectedIds.length, strokes]);

  useEffect(() => {
    if (tool !== "lasso" && selectedIdsRef.current.length) {
      selectedIdsRef.current = [];
      setSelectedIds([]);
      renderCanvas();
    }
  }, [renderCanvas, tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas();
    const observer = new ResizeObserver(() => renderCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderCanvas]);

  const pointFromClient = (clientX: number, clientY: number, pressure = .5): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      pressure: pressure || .5,
    };
  };

  const replaceSelection = (ids: string[]) => {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  };

  const eraseBetween = (from: Point, to: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const distance = Math.hypot((to.x - from.x) * canvas.clientWidth, (to.y - from.y) * canvas.clientHeight);
    const steps = Math.max(1, Math.ceil(distance / 6));
    for (let step = 1; step <= steps; step += 1) {
      const sample: Point = {
        x: from.x + (to.x - from.x) * step / steps,
        y: from.y + (to.y - from.y) * step / steps,
        pressure: .5,
      };
      workingStrokes.current = workingStrokes.current.flatMap((stroke) => eraseStrokeAtPoint(stroke, sample, canvas, 13));
    }
    renderCanvas(workingStrokes.current);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!["pen", "highlight", "eraser", "lasso", "shape"].includes(tool)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromClient(event.clientX, event.clientY, event.pressure);
    beforeStrokes.current = strokesRef.current;
    workingStrokes.current = strokesRef.current;
    gestureStart.current = point;

    if (tool === "eraser") {
      interaction.current = "erase";
      lastEraserPoint.current = point;
      eraseBetween(point, point);
      return;
    }

    if (tool === "lasso") {
      const selected = strokesRef.current.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
      const bounds = boundsForStrokes(selected);
      if (bounds && canvasRef.current) {
        const handleDistance = Math.hypot((point.x - bounds.right) * canvasRef.current.clientWidth, (point.y - bounds.bottom) * canvasRef.current.clientHeight);
        if (handleDistance <= 22) {
          interaction.current = "resize";
          baseSelectionBounds.current = bounds;
          return;
        }
        const paddingX = 10 / canvasRef.current.clientWidth;
        const paddingY = 10 / canvasRef.current.clientHeight;
        if (point.x >= bounds.left - paddingX && point.x <= bounds.right + paddingX && point.y >= bounds.top - paddingY && point.y <= bounds.bottom + paddingY) {
          interaction.current = "move";
          baseSelectionBounds.current = bounds;
          return;
        }
      }
      interaction.current = "lasso";
      replaceSelection([]);
      lassoPath.current = [point];
      renderCanvas();
      return;
    }

    interaction.current = "draw";
    currentStroke.current = {
      id: uid("stroke"),
      tool: tool === "shape" ? "shape" : tool === "highlight" ? "highlight" : "pen",
      penStyle: tool === "pen" ? penStyle : undefined,
      shape: tool === "shape" ? shape : undefined,
      color,
      width: tool === "highlight" ? width * 4 : width,
      points: [point],
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (interaction.current === "idle") return;
    event.preventDefault();
    let point = pointFromClient(event.clientX, event.clientY, event.pressure);

    if (interaction.current === "erase") {
      const previous = lastEraserPoint.current ?? point;
      eraseBetween(previous, point);
      lastEraserPoint.current = point;
      return;
    }

    if (interaction.current === "lasso") {
      lassoPath.current.push(point);
      renderCanvas();
      return;
    }

    if (interaction.current === "move" && gestureStart.current && baseSelectionBounds.current) {
      const bounds = baseSelectionBounds.current;
      const dx = Math.max(-bounds.left, Math.min(1 - bounds.right, point.x - gestureStart.current.x));
      const dy = Math.max(-bounds.top, Math.min(1 - bounds.bottom, point.y - gestureStart.current.y));
      workingStrokes.current = beforeStrokes.current.map((stroke) => selectedIdsRef.current.includes(stroke.id)
        ? { ...stroke, points: stroke.points.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy })) }
        : stroke);
      renderCanvas(workingStrokes.current);
      return;
    }

    if (interaction.current === "resize" && baseSelectionBounds.current) {
      const bounds = baseSelectionBounds.current;
      const baseDistance = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) || .01;
      const nextDistance = Math.hypot(point.x - bounds.left, point.y - bounds.top);
      const maxScaleX = (1 - bounds.left) / Math.max(.001, bounds.right - bounds.left);
      const maxScaleY = (1 - bounds.top) / Math.max(.001, bounds.bottom - bounds.top);
      const scale = Math.max(.2, Math.min(4, maxScaleX, maxScaleY, nextDistance / baseDistance));
      workingStrokes.current = beforeStrokes.current.map((stroke) => selectedIdsRef.current.includes(stroke.id)
        ? { ...stroke, points: stroke.points.map((item) => ({ ...item, x: bounds.left + (item.x - bounds.left) * scale, y: bounds.top + (item.y - bounds.top) * scale })) }
        : stroke);
      renderCanvas(workingStrokes.current);
      return;
    }

    if (!currentStroke.current) return;
    if (currentStroke.current.tool === "shape") {
      if (currentStroke.current.shape === "circle" && canvasRef.current) {
        const start = currentStroke.current.points[0];
        const dx = (point.x - start.x) * canvasRef.current.clientWidth;
        const dy = (point.y - start.y) * canvasRef.current.clientHeight;
        const side = Math.min(Math.abs(dx), Math.abs(dy));
        point = {
          ...point,
          x: start.x + Math.sign(dx || 1) * side / canvasRef.current.clientWidth,
          y: start.y + Math.sign(dy || 1) * side / canvasRef.current.clientHeight,
        };
      }
      currentStroke.current.points = [currentStroke.current.points[0], point];
    } else {
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      coalesced.forEach((sample) => currentStroke.current?.points.push(pointFromClient(sample.clientX, sample.clientY, sample.pressure)));
    }
    renderCanvas([...beforeStrokes.current, currentStroke.current]);
  };

  const finishInteraction = () => {
    const mode = interaction.current;
    interaction.current = "idle";
    if (mode === "draw" && currentStroke.current) {
      const minimumPoints = currentStroke.current.tool === "shape" ? 2 : 1;
      if (currentStroke.current.points.length >= minimumPoints) {
        const next = [...beforeStrokes.current, currentStroke.current];
        strokesRef.current = next;
        workingStrokes.current = next;
        onCommit(next, beforeStrokes.current);
      }
      currentStroke.current = null;
    } else if (mode === "erase" || mode === "move" || mode === "resize") {
      const next = workingStrokes.current;
      if (next !== beforeStrokes.current) {
        strokesRef.current = next;
        onCommit(next, beforeStrokes.current);
      }
    } else if (mode === "lasso") {
      const polygon = lassoPath.current;
      const ids = polygon.length > 2
        ? strokesRef.current.filter((stroke) => pointsForStroke(stroke).some((point) => pointInPolygon(point, polygon))).map((stroke) => stroke.id)
        : [];
      lassoPath.current = [];
      replaceSelection(ids);
      workingStrokes.current = strokesRef.current;
      renderCanvas();
    }
    lastEraserPoint.current = null;
    gestureStart.current = null;
    baseSelectionBounds.current = null;
    renderCanvas();
  };

  const selectionBounds = useMemo(() => boundsForStrokes(strokes.filter((stroke) => selectedIds.includes(stroke.id))), [selectedIds, strokes]);

  const duplicateSelection = () => {
    const selected = strokesRef.current.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
    if (!selected.length) return;
    const copies = selected.map((stroke) => ({
      ...stroke,
      id: uid("stroke-copy"),
      points: stroke.points.map((point) => ({ ...point, x: Math.min(1, point.x + .025), y: Math.min(1, point.y + .025) })),
    }));
    const next = [...strokesRef.current, ...copies];
    onCommit(next, strokesRef.current);
    strokesRef.current = next;
    workingStrokes.current = next;
    replaceSelection(copies.map((stroke) => stroke.id));
    renderCanvas(next);
  };

  const deleteSelection = () => {
    if (!selectedIdsRef.current.length) return;
    const previous = strokesRef.current;
    const next = previous.filter((stroke) => !selectedIdsRef.current.includes(stroke.id));
    onCommit(next, previous);
    strokesRef.current = next;
    workingStrokes.current = next;
    replaceSelection([]);
    renderCanvas(next);
  };

  return (
    <div className={`ink-surface tool-${tool}`}>
      <canvas
        ref={canvasRef}
        className="ink-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Lớp viết tay"
      />
      {tool === "lasso" && selectionBounds && (
        <div className="lasso-menu" style={{ left: `${Math.min(.82, Math.max(.18, (selectionBounds.left + selectionBounds.right) / 2)) * 100}%`, top: `${Math.max(.1, selectionBounds.top) * 100}%` }}>
          <span>Kéo để di chuyển · nút vuông để đổi cỡ</span>
          <button onPointerDown={(event) => event.stopPropagation()} onClick={duplicateSelection}><Copy size={14} /> Nhân đôi</button>
          <button className="danger" onPointerDown={(event) => event.stopPropagation()} onClick={deleteSelection}><Trash2 size={14} /> Xóa</button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const documentStageRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pointer");
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState("#2465a8");
  const [inkWidth, setInkWidth] = useState(2);
  const [highlighterWidth, setHighlighterWidth] = useState(14);
  const [penStyle, setPenStyle] = useState<PenStyle>("ballpoint");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [demoReader, setDemoReader] = useState<ReaderState>({ ...DEFAULT_READER, page: 126 });
  const [pdfTool, setPdfTool] = useState<PdfTool>("pan");
  const [pdfHistory, setPdfHistory] = useState<PdfHistory>({});
  const [pdfSelection, setPdfSelection] = useState<PdfSelection | null>(null);
  const [dictionaryLookup, setDictionaryLookup] = useState<DictionaryLookupState>({ status: "idle", sourceText: "", result: null, error: null });
  const dictionaryAbortRef = useRef<AbortController | null>(null);
  const [pdfRailTab, setPdfRailTab] = useState<PdfRailTab>("pages");
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [searchWholeCollection, setSearchWholeCollection] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [readerFocus, setReaderFocus] = useState(false);
  const [sourceFocus, setSourceFocus] = useState<{ documentId: string; page: number; rect: PdfRect } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createDemoWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("demo-workspace");
  const [strokeHistory, setStrokeHistory] = useState<StrokeHistory>({});
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfiumDocument, setPdfiumDocument] = useState<PDFiumDocument | null>(null);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const [readerShare, setReaderShare] = useState(50);
  const [toast, setToast] = useState("Đã tự lưu");
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showPdfRail, setShowPdfRail] = useState(true);
  const [notePanel, setNotePanel] = useState<NotePanel>(null);
  const [textToolbar, setTextToolbar] = useState<TextToolbarState>({ ...DEFAULT_TEXT, strike: false, unordered: false, ordered: false, backgroundColor: "transparent", lineHeight: "1.8", bulletStyle: "disc" });
  const [textInsertPopover, setTextInsertPopover] = useState<TextInsertPopover>(null);
  const [equationDraft, setEquationDraft] = useState("y = ax² + b");
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableBorder, setTableBorder] = useState<TableBorderSettings>({ style: "solid", width: 1, color: "#60737d" });
  const activeTextEditorRef = useRef<{ id: string; editor: HTMLElement } | null>(null);
  const savedTextRangeRef = useRef<Range | null>(null);
  const pendingFontSizeRef = useRef(new Map<string, number>());
  const [pdfPanel, setPdfPanel] = useState<PdfPanel>(null);
  const [drivePanelOpen, setDrivePanelOpen] = useState(false);
  const [desktopGoogleClientId, setDesktopGoogleClientId] = useState(() => {
    if (!IS_DESKTOP_APP) return "";
    try { return localStorage.getItem(DESKTOP_GOOGLE_CLIENT_ID_KEY)?.trim() ?? ""; } catch { return ""; }
  });
  const [desktopGoogleClientSecret, setDesktopGoogleClientSecret] = useState("");
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [driveStatus, setDriveStatus] = useState<"disconnected" | "connecting" | "connected" | "syncing" | "error">("disconnected");
  const [driveReady, setDriveReady] = useState(false);
  const [driveAutoSync, setDriveAutoSync] = useState(true);
  const [driveLastSyncedAt, setDriveLastSyncedAt] = useState<number | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const localSavedAtRef = useRef(Date.now());
  const driveSyncingRef = useRef(false);

  useEffect(() => {
    if (notePanel !== "text") setTextInsertPopover(null);
  }, [notePanel]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeNotebook = activeWorkspace.notebooks.find((notebook) => notebook.id === activeWorkspace.activeNotebookId) ?? activeWorkspace.notebooks[0];
  const notePages = activeNotebook.pages;
  const activeNote = notePages.find((page) => page.id === activeNotebook.activePageId) ?? notePages[0];
  const selectedExcerptIndex = activeNote.excerpts.findIndex((excerpt) => excerpt.id === selectedExcerptId);
  const selectedExcerpt = selectedExcerptIndex >= 0 ? activeNote.excerpts[selectedExcerptIndex] : null;
  const activeDocument = activeWorkspace.documents.find((document) => document.id === activeWorkspace.activeDocumentId) ?? activeWorkspace.documents[0] ?? null;
  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;

  const activateTextEditor = useCallback((editorId: string, editor: HTMLElement, range: Range | null) => {
    activeTextEditorRef.current = { id: editorId, editor };
    savedTextRangeRef.current = range && rangeBelongsToEditor(range, editor) ? range.cloneRange() : null;
    setTextToolbar(textSettingsAtRange(editor, range));
    const table = closestWithin<HTMLTableElement>(range?.startContainer ?? null, "table", editor);
    const cell = table?.querySelector<HTMLElement>("th,td");
    if (cell) {
      const style = window.getComputedStyle(cell);
      const borderStyle = (["solid", "dashed", "dotted", "double"] as TableBorderStyle[]).includes(style.borderTopStyle as TableBorderStyle) ? style.borderTopStyle as TableBorderStyle : "solid";
      setTableBorder({ style: borderStyle, width: Math.max(1, Math.min(6, Math.round(Number.parseFloat(style.borderTopWidth) || 1))), color: cssColorToHex(style.borderTopColor) });
    }
  }, []);

  const normalizeTextEditorInput = useCallback((editorId: string, editor: HTMLElement) => {
    const fontSize = pendingFontSizeRef.current.get(editorId);
    if (!fontSize) return;
    editor.querySelectorAll<HTMLElement>('font[size="7"]').forEach((font) => {
      font.style.fontSize = `${fontSize}px`;
      font.removeAttribute("size");
    });
    editor.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
      if (element.style.fontSize === "xxx-large") element.style.fontSize = `${fontSize}px`;
    });
  }, []);

  const restoreTextSelection = useCallback(() => {
    const target = activeTextEditorRef.current;
    if (!target?.editor.isConnected) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    let range = savedTextRangeRef.current;
    if (!range || !rangeBelongsToEditor(range, target.editor)) {
      range = document.createRange();
      range.selectNodeContents(target.editor);
      range.collapse(false);
    }
    target.editor.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);
    return target;
  }, []);

  const finishTextCommand = useCallback((target: { id: string; editor: HTMLElement }, message: string) => {
    target.editor.dispatchEvent(new Event("input", { bubbles: true }));
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    activateTextEditor(target.id, target.editor, range);
    setToast(message);
  }, [activateTextEditor]);

  const applyTextCommand = useCallback((command: "font" | "size" | "color" | "background" | "bold" | "italic" | "underline" | "strike" | "left" | "center" | "right" | "justify" | "bullets" | "numbering" | "clear", value?: string | number) => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào nội dung hoặc bôi chọn chữ trước khi định dạng");
      return;
    }
    document.execCommand("styleWithCSS", false, "true");
    if (command === "font") {
      const font = TEXT_FONTS.find((option) => option.id === value) ?? TEXT_FONTS[0];
      document.execCommand("fontName", false, font.family);
    } else if (command === "size") {
      const size = Number(value);
      pendingFontSizeRef.current.set(target.id, size);
      document.execCommand("fontSize", false, "7");
      normalizeTextEditorInput(target.id, target.editor);
    } else if (command === "color") {
      document.execCommand("foreColor", false, String(value));
    } else if (command === "background") {
      document.execCommand("backColor", false, String(value));
    } else {
      const browserCommand = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
        strike: "strikeThrough",
        left: "justifyLeft",
        center: "justifyCenter",
        right: "justifyRight",
        justify: "justifyFull",
        bullets: "insertUnorderedList",
        numbering: "insertOrderedList",
        clear: "removeFormat",
      }[command];
      document.execCommand(browserCommand, false);
    }
    finishTextCommand(target, "Đã định dạng phần chữ đang chọn");
  }, [finishTextCommand, normalizeTextEditorInput, restoreTextSelection]);

  const applyTextLineHeight = useCallback((lineHeight: TextLineHeight) => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào đoạn văn trước khi chỉnh giãn dòng");
      return;
    }
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    const blocks = Array.from(target.editor.querySelectorAll<HTMLElement>("div,p,li,td,th")).filter((element) => {
      try { return range!.intersectsNode(element); } catch { return false; }
    });
    if (!blocks.length) {
      document.execCommand("formatBlock", false, "div");
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const block = closestWithin<HTMLElement>(range?.startContainer ?? null, "div,p,li,td,th", target.editor);
      if (block) blocks.push(block);
    }
    blocks.forEach((block) => { block.style.lineHeight = lineHeight; });
    finishTextCommand(target, `Đã đặt giãn dòng ${lineHeight}`);
  }, [finishTextCommand, restoreTextSelection]);

  const applyBulletStyle = useCallback((bulletStyle: BulletStyle) => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào đoạn văn trước khi tạo danh sách");
      return;
    }
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let lists = range ? [closestWithin<HTMLUListElement>(range.startContainer, "ul", target.editor)].filter(Boolean) as HTMLUListElement[] : [];
    if (!lists.length) {
      document.execCommand("insertUnorderedList", false);
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const list = range ? closestWithin<HTMLUListElement>(range.startContainer, "ul", target.editor) : null;
      if (list) lists = [list];
    }
    if (range) {
      target.editor.querySelectorAll<HTMLUListElement>("ul").forEach((list) => {
        try { if (range!.intersectsNode(list) && !lists.includes(list)) lists.push(list); } catch { /* ignore detached nodes */ }
      });
    }
    lists.forEach((list) => { list.style.listStyleType = bulletStyle === "dash" ? '"–  "' : bulletStyle; });
    finishTextCommand(target, "Đã đổi kiểu dấu đầu dòng");
  }, [finishTextCommand, restoreTextSelection]);

  const insertTextAtSelection = useCallback((text: string, message = "Đã chèn ký hiệu") => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào vị trí cần chèn trước");
      return;
    }
    document.execCommand("insertText", false, text);
    finishTextCommand(target, message);
  }, [finishTextCommand, restoreTextSelection]);

  const insertEquation = useCallback((equation = equationDraft) => {
    const target = restoreTextSelection();
    const trimmed = equation.trim();
    if (!target || !trimmed) {
      setToast(target ? "Nhập công thức trước khi chèn" : "Bấm vào vị trí cần chèn công thức trước");
      return;
    }
    document.execCommand("insertHTML", false, `<span style="font-family:Cambria Math,STIX Two Math,Times New Roman,serif;font-style:normal">${escapeHtml(trimmed)}</span>&nbsp;`);
    finishTextCommand(target, "Đã chèn công thức");
    setTextInsertPopover(null);
  }, [equationDraft, finishTextCommand, restoreTextSelection]);

  const insertTable = useCallback(() => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào vị trí cần chèn bảng trước");
      return;
    }
    const cellStyle = `border-style:${tableBorder.style};border-width:${tableBorder.width}px;border-color:${tableBorder.color};padding:6px;min-width:44px;vertical-align:top`;
    const rows = Array.from({ length: tableRows }, () => `<tr>${Array.from({ length: tableColumns }, () => `<td style="${cellStyle}">&nbsp;</td>`).join("")}</tr>`).join("");
    document.execCommand("insertHTML", false, `<table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table><div><br></div>`);
    finishTextCommand(target, `Đã chèn bảng ${tableRows} × ${tableColumns}`);
    setTextInsertPopover(null);
  }, [finishTextCommand, restoreTextSelection, tableBorder, tableColumns, tableRows]);

  const updateTableBorder = useCallback((changes: Partial<TableBorderSettings>) => {
    const next = { ...tableBorder, ...changes };
    setTableBorder(next);
    const target = restoreTextSelection();
    if (!target) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const table = closestWithin<HTMLTableElement>(range?.startContainer ?? null, "table", target.editor);
    if (!table) {
      setToast("Thiết lập đường kẻ sẽ dùng cho bảng mới");
      return;
    }
    table.querySelectorAll<HTMLElement>("th,td").forEach((cell) => {
      cell.style.borderStyle = next.style;
      cell.style.borderWidth = `${next.width}px`;
      cell.style.borderColor = next.color;
    });
    finishTextCommand(target, "Đã cập nhật đường kẻ bảng");
  }, [finishTextCommand, restoreTextSelection, tableBorder]);

  const focusTypeEditor = useCallback((editorId: string) => {
    const existing = activeTextEditorRef.current;
    if (existing?.id === editorId && existing.editor.isConnected) {
      restoreTextSelection();
      activateTextEditor(existing.id, existing.editor, savedTextRangeRef.current);
      return;
    }
    const editor = Array.from(document.querySelectorAll<HTMLElement>("[data-rich-editor-id]")).find((candidate) => candidate.dataset.richEditorId === editorId);
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    activateTextEditor(editorId, editor, range);
  }, [activateTextEditor, restoreTextSelection]);
  const activeReader = activeDocument?.reader ?? demoReader;
  const sourcePage = activeDocument?.reader.page ?? demoReader.page;
  const sourceZoom = activeReader.zoom;
  const fitMode = activeReader.fitMode;
  const rotation = activeReader.rotation;
  const viewMode = activeReader.viewMode;
  const bookmarks = activeReader.bookmarks;
  const pdfAnnotations = activeReader.annotations;
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

  const updateActiveNotebook = (updater: (notebook: Notebook) => Notebook) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      notebooks: workspace.notebooks.map((notebook) => notebook.id === workspace.activeNotebookId ? updater(notebook) : notebook),
    }));
  };

  const setSourcePage = (value: number | ((page: number) => number)) => {
    const next = Math.max(1, Math.min(totalPages, typeof value === "function" ? value(sourcePage) : value));
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
    updateReader((reader) => ({ ...reader, zoom: Math.max(.55, Math.min(2.5, typeof value === "function" ? value(reader.zoom) : value)) }));
  };

  const goToPage = (page: number, smooth = true) => {
    const next = Math.max(1, Math.min(totalPages, page));
    setSourcePage(next);
    if (viewMode === "continuous") {
      window.requestAnimationFrame(() => {
        documentStageRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
      });
    }
  };

  const switchDocument = (documentId: string, page?: number, rect?: PdfRect) => {
    const target = activeWorkspace.documents.find((document) => document.id === documentId);
    if (!target) return;
    const nextPage = Math.max(1, page ?? target.reader.page ?? 1);
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

  const setActiveNoteId = (pageId: string) => {
    updateActiveNotebook((notebook) => ({ ...notebook, activePageId: pageId }));
  };

  const sourcePages = useMemo(() => {
    if (!currentPdfDocument) return activeDocument ? [sourcePage] : activeWorkspace.kind === "demo" ? DEMO_PAGES : [];
    return Array.from({ length: currentPdfDocument.numPages }, (_, index) => index + 1);
  }, [activeDocument, activeWorkspace.kind, currentPdfDocument, sourcePage]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedLibrary;
          if (parsed.workspaces?.length && !cancelled) {
            const normalized = parsed.workspaces.map(normalizeWorkspace);
            setWorkspaces(normalized);
            setActiveWorkspaceId(parsed.activeWorkspaceId || parsed.workspaces[0].id);
            setReaderShare(parsed.readerShare || 50);
            localSavedAtRef.current = parsed.savedAt || Date.now();
            setReady(true);
            return;
          }
        }
      } catch { /* migrate the previous single-notebook format */ }

      let legacy: LegacyNotebookState | null = null;
      try {
        const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored) legacy = JSON.parse(stored) as LegacyNotebookState;
      } catch { /* keep demo data */ }

      const legacyPages = (legacy?.pages?.length ? legacy.pages : initialPages).map(normalizePage);
      let restoredWorkspace = createDemoWorkspace(legacyPages);
      restoredWorkspace.notebooks[0].activePageId = legacyPages.some((page) => page.id === legacy?.activeNoteId)
        ? legacy!.activeNoteId!
        : legacyPages[0].id;

      try {
        const storedPdf = await readLegacyPdf();
        if (storedPdf) {
          const document: LibraryDocument = {
            id: `doc-${stableId(`${storedPdf.name}:${storedPdf.blob.size}:legacy`)}`,
            name: storedPdf.name,
            size: storedPdf.blob.size,
            lastModified: 0,
            reader: { ...DEFAULT_READER },
          };
          await saveLocalPdf(storedPdf.blob, document);
          const notebook: Notebook = {
            id: uid("notebook"),
            title: `Ghi chú — ${storedPdf.name.replace(/\.pdf$/i, "")}`,
            pages: legacyPages,
            activePageId: restoredWorkspace.notebooks[0].activePageId,
            createdAt: Date.now(),
          };
          restoredWorkspace = {
            id: `workspace-${document.id}`,
            kind: "document",
            name: storedPdf.name.replace(/\.pdf$/i, ""),
            documents: [document],
            activeDocumentId: document.id,
            notebooks: [notebook],
            activeNotebookId: notebook.id,
            sourcePage: 1,
          };
        }
      } catch { /* IndexedDB may be unavailable */ }

      if (!cancelled) {
        setWorkspaces([restoredWorkspace]);
        setActiveWorkspaceId(restoredWorkspace.id);
        setReaderShare(legacy?.readerShare || 50);
        setReady(true);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      const savedAt = Date.now();
      localSavedAtRef.current = savedAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, activeWorkspaceId, readerShare, savedAt } satisfies PersistedLibrary));
    } catch { /* storage may be unavailable in private browsing */ }
  }, [workspaces, activeWorkspaceId, readerShare, ready]);

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
    void readLocalPdf(activeDocument.id).then((stored) => {
      if (cancelled) return;
      if (!stored) {
        setPdfStatus("error");
        return;
      }
      setPdfSource({ blob: stored.blob, documentId: activeDocument.id });
    }).catch(() => !cancelled && setPdfStatus("error"));
    return () => { cancelled = true; };
  }, [activeDocument?.id, ready]);

  useEffect(() => {
    if (!pdfSource) return undefined;
    let disposed = false;
    let document: PDFDocumentProxy | null = null;
    let highFidelityDocument: PDFiumDocument | null = null;
    void pdfSource.blob.arrayBuffer().then(async (buffer) => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const bytes = new Uint8Array(buffer);
      const task = pdfjs.getDocument(pdfDocumentOptions(bytes.slice()));
      const [pdfjsResult, pdfiumResult] = await Promise.allSettled([
        task.promise,
        loadPdfiumDocument(bytes),
      ]);
      if (pdfjsResult.status === "rejected") throw pdfjsResult.reason;
      document = pdfjsResult.value;
      highFidelityDocument = pdfiumResult.status === "fulfilled" ? pdfiumResult.value : null;
      if (disposed) {
        void document.destroy();
        highFidelityDocument?.destroy();
      } else {
        setPdfDocument(document);
        setPdfiumDocument(highFidelityDocument);
        setLoadedDocumentId(pdfSource.documentId);
        setWorkspaces((items) => items.map((workspace) => ({
          ...workspace,
          sourcePage: workspace.id === activeWorkspaceId
            ? Math.min(Math.max(1, workspace.documents.find((item) => item.id === pdfSource.documentId)?.reader.page ?? workspace.sourcePage), document!.numPages)
            : workspace.sourcePage,
          documents: workspace.documents.map((item) => item.id === pdfSource.documentId
            ? { ...item, reader: { ...normalizeReader(item.reader), page: Math.min(Math.max(1, item.reader?.page ?? 1), document!.numPages) } }
            : item),
        })));
        setPdfStatus("idle");
        setToast(`Đã mở ${document.numPages} trang`);
      }
    }).catch(() => {
      if (!disposed) {
        setPdfStatus("error");
        setToast("Không thể mở PDF này");
      }
    });
    return () => {
      disposed = true;
      void document?.destroy();
      // A PDFium render already in flight cannot be cancelled. Delay disposal
      // slightly so a page being unmounted can finish its current bitmap pass.
      if (highFidelityDocument) window.setTimeout(() => highFidelityDocument?.destroy(), 500);
    };
  }, [pdfSource]);

  useEffect(() => {
    if (!currentPdfDocument) {
      setOutline(activeDocument || activeWorkspace.kind !== "demo" ? [] : [
        { title: "3.4 Diabetic Neuropathy", page: 123, depth: 0 },
        { title: "Introduction", page: 123, depth: 1 },
        { title: "Pathophysiology", page: 126, depth: 1 },
        { title: "Clinical features", page: 127, depth: 1 },
      ]);
      return;
    }
    let disposed = false;
    type RawOutlineItem = { title?: string; dest?: string | unknown[] | null; items?: RawOutlineItem[] };
    const resolvePage = async (dest: RawOutlineItem["dest"]) => {
      if (!dest) return null;
      let explicit: string | unknown[] | null | undefined = dest;
      if (typeof explicit === "string") explicit = await currentPdfDocument.getDestination(explicit) as unknown[] | null;
      if (!Array.isArray(explicit) || !explicit.length) return null;
      const reference = explicit[0] as number | { num: number; gen: number };
      if (typeof reference === "number") return reference + 1;
      try { return await currentPdfDocument.getPageIndex(reference) + 1; } catch { return null; }
    };
    void currentPdfDocument.getOutline().then(async (items) => {
      const entries: PdfOutlineEntry[] = [];
      const visit = async (nodes: RawOutlineItem[], depth: number) => {
        for (const item of nodes) {
          entries.push({ title: item.title?.trim() || "Mục không tên", page: await resolvePage(item.dest), depth });
          if (item.items?.length) await visit(item.items, depth + 1);
        }
      };
      await visit((items ?? []) as RawOutlineItem[], 0);
      if (!disposed) setOutline(entries);
    }).catch(() => !disposed && setOutline([]));
    return () => { disposed = true; };
  }, [activeDocument, activeWorkspace.kind, currentPdfDocument]);

  useEffect(() => {
    if (!toast || toast === "Đã tự lưu") return;
    const timer = window.setTimeout(() => setToast("Đã tự lưu"), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setSelectedExcerptId(null);
    activeTextEditorRef.current = null;
    savedTextRangeRef.current = null;
    setTextToolbar({ ...normalizeText(activeNote.text), strike: false, unordered: false, ordered: false, backgroundColor: "transparent", lineHeight: "1.8", bulletStyle: "disc" });
    setTextInsertPopover(null);
  }, [activeNote.id, activeNotebook.id, activeWorkspace.id]);

  const updateActiveNote = (changes: Partial<NotePage>) => {
    updateActiveNotebook((notebook) => ({
      ...notebook,
      pages: notebook.pages.map((page) => page.id === notebook.activePageId ? { ...page, ...changes } : page),
    }));
  };

  const chooseNoteTool = (tool: Tool) => {
    setActiveTool(tool);
    if (tool !== "pointer" && tool !== "text") setSelectedExcerptId(null);
    if (tool === "pen" || tool === "highlight") {
      setNotePanel((panel) => panel === "ink" && activeTool === tool ? null : "ink");
    } else if (tool === "shape") {
      setNotePanel((panel) => panel === "shape" && activeTool === tool ? null : "shape");
    } else if (tool === "text" || tool === "textbox") {
      setNotePanel((panel) => panel === "text" && activeTool === tool ? null : "text");
      if (tool === "text") {
        const editorId = selectedExcerpt?.kind === "text" ? `excerpt:${selectedExcerpt.id}` : `body:${activeNote.id}`;
        window.requestAnimationFrame(() => focusTypeEditor(editorId));
      }
    } else {
      setNotePanel(null);
    }
  };

  const choosePdfTool = (tool: PdfTool) => {
    setPdfTool(tool);
    if (["pen", "highlight", "underline", "strikeout"].includes(tool)) {
      setPdfPanel((panel) => panel === "ink" && pdfTool === tool ? null : "ink");
    } else {
      setPdfPanel(null);
    }
  };

  const pdfHistoryKey = activeDocument?.id ?? "demo";

  const commitPdfAnnotations = (next: PdfAnnotation[], previous = pdfAnnotations) => {
    const unchanged = next.length === previous.length && next.every((annotation, index) => annotation === previous[index]);
    if (unchanged) return;
    setPdfHistory((state) => {
      const history = state[pdfHistoryKey] ?? { undo: [], redo: [] };
      return { ...state, [pdfHistoryKey]: { undo: [...history.undo, previous].slice(-60), redo: [] } };
    });
    updateReader((reader) => ({ ...reader, annotations: next }));
  };

  const addPdfMarkup = (kind: PdfMarkupAnnotation["kind"], selection: PdfSelection | null = pdfSelection) => {
    if (!selection || !activeDocument) return;
    const color = kind === "highlight" ? "#f6d96b" : kind === "underline" ? inkColor : "#c94b50";
    const annotation: PdfMarkupAnnotation = {
      id: uid(`pdf-${kind}`),
      kind,
      page: selection.page,
      color,
      rects: selection.rects,
      text: selection.text,
      createdAt: Date.now(),
    };
    commitPdfAnnotations([...pdfAnnotations, annotation]);
    window.getSelection()?.removeAllRanges();
    setPdfSelection(null);
    setToast(kind === "highlight" ? "Đã tô sáng" : kind === "underline" ? "Đã gạch chân" : "Đã gạch ngang");
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

  const handlePdfSelection = (selection: PdfSelection) => {
    if (pdfTool === "highlight" || pdfTool === "underline" || pdfTool === "strikeout") {
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

  const commitPdfInk = (page: number, nextPage: PdfInkAnnotation[], previousPage: PdfInkAnnotation[]) => {
    const other = pdfAnnotations.filter((annotation) => annotation.kind !== "ink" || annotation.page !== page);
    const previous = [...other, ...previousPage];
    const next = [...other, ...nextPage.map((annotation) => ({ ...annotation, page }))];
    commitPdfAnnotations(next, previous);
  };

  const undoPdf = () => {
    const history = pdfHistory[pdfHistoryKey];
    const previous = history?.undo.at(-1);
    if (!previous) return;
    updateReader((reader) => ({ ...reader, annotations: previous }));
    setPdfHistory((state) => ({
      ...state,
      [pdfHistoryKey]: { undo: history.undo.slice(0, -1), redo: [...history.redo, pdfAnnotations].slice(-60) },
    }));
    setToast("Đã hoàn tác chú thích PDF");
  };

  const redoPdf = () => {
    const history = pdfHistory[pdfHistoryKey];
    const next = history?.redo.at(-1);
    if (!next) return;
    updateReader((reader) => ({ ...reader, annotations: next }));
    setPdfHistory((state) => ({
      ...state,
      [pdfHistoryKey]: { undo: [...history.undo, pdfAnnotations].slice(-60), redo: history.redo.slice(0, -1) },
    }));
    setToast("Đã làm lại chú thích PDF");
  };

  const removePdfAnnotation = (annotationId: string) => {
    commitPdfAnnotations(pdfAnnotations.filter((annotation) => annotation.id !== annotationId));
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

  const addTextExcerpt = (selection: PdfSelection | null = pdfSelection, textOverride?: string) => {
    if (!selection || !activeDocument) return;
    const excerpt: NoteExcerpt = {
      id: uid("excerpt"),
      kind: "text",
      sourceKind: "pdf",
      text: textOverride ?? selection.text,
      richText: plainTextToRichHtml(textOverride ?? selection.text),
      documentId: activeDocument.id,
      documentName: activeDocument.name,
      page: selection.page,
      rect: selection.rects[0],
      createdAt: Date.now(),
      layout: defaultExcerptLayout(activeNote.excerpts.length, "text"),
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt], citationPage: selection.page });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("pointer");
    setNotePanel(null);
    window.getSelection()?.removeAllRanges();
    setPdfSelection(null);
    setToast("Đã đưa đoạn trích sang note");
  };

  const addTranslationExcerpt = () => {
    const translation = dictionaryLookup.result?.translation;
    if (!pdfSelection || !translation) return;
    addTextExcerpt(pdfSelection, `${pdfSelection.text}\n\nBản dịch đề xuất:\n${translation}`);
  };

  const addImageExcerpt = async (result: PdfCropResult) => {
    if (!activeDocument) return;
    const assetId = uid("crop");
    try {
      await saveLocalAsset(assetId, result.blob);
      const excerpt: NoteExcerpt = {
        id: uid("excerpt"),
        kind: "image",
        sourceKind: "pdf",
        assetId,
        documentId: activeDocument.id,
        documentName: activeDocument.name,
        page: result.page,
        rect: result.rect,
        createdAt: Date.now(),
        layout: defaultExcerptLayout(activeNote.excerpts.length, "image"),
      };
      updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt], citationPage: result.page });
      setSelectedExcerptId(excerpt.id);
      setActiveTool("pointer");
      setNotePanel(null);
      setPdfTool("pan");
      setToast("Đã cắt hình và đưa sang note");
    } catch {
      setToast("Không thể lưu hình cắt trên thiết bị này");
    }
  };

  const deleteExcerpt = (excerptId: string) => {
    updateActiveNote({ excerpts: activeNote.excerpts.filter((excerpt) => excerpt.id !== excerptId) });
    if (selectedExcerptId === excerptId) setSelectedExcerptId(null);
    setToast("Đã xóa trích dẫn khỏi note");
  };

  const moveExcerpt = (excerptId: string, layout: ExcerptLayout) => {
    updateActiveNote({ excerpts: activeNote.excerpts.map((excerpt) => excerpt.id === excerptId ? { ...excerpt, layout } : excerpt) });
    setToast("Đã lưu vị trí trích dẫn");
  };

  const editExcerpt = (excerptId: string, changes: Partial<NoteExcerpt>) => {
    updateActiveNote({ excerpts: activeNote.excerpts.map((excerpt) => excerpt.id === excerptId ? { ...excerpt, ...changes } : excerpt) });
  };

  const addTextBoxAt = (event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget.querySelector<HTMLElement>(".typed-layer");
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = .36;
    const height = .18;
    const x = Math.min(1 - width, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1 - height, Math.max(.065, (event.clientY - rect.top) / rect.height));
    const excerpt: NoteExcerpt = {
      id: uid("textbox"),
      kind: "text",
      sourceKind: "manual",
      text: "",
      richText: "",
      createdAt: Date.now(),
      layout: { x, y, width, height, contentScale: 1 },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    setToast("Đã tạo hộp chữ — nhập nội dung ngay");
  };

  const shiftExcerptLayer = (direction: "forward" | "backward") => {
    if (!selectedExcerpt || selectedExcerptIndex < 0) return;
    const targetIndex = selectedExcerptIndex + (direction === "forward" ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= activeNote.excerpts.length) return;
    const next = [...activeNote.excerpts];
    [next[selectedExcerptIndex], next[targetIndex]] = [next[targetIndex], next[selectedExcerptIndex]];
    updateActiveNote({ excerpts: next });
    setToast(direction === "forward" ? "Đã đưa đối tượng lên một lớp" : "Đã đưa đối tượng xuống một lớp");
  };

  const openExcerptSource = (excerpt: NoteExcerpt) => {
    if (excerpt.sourceKind === "manual" || !excerpt.documentId || !excerpt.page) return;
    if (!activeWorkspace.documents.some((document) => document.id === excerpt.documentId)) {
      setToast("Tài liệu nguồn đã bị xóa khỏi cụm");
      return;
    }
    if (activeDocument?.id === excerpt.documentId) {
      goToPage(excerpt.page);
      if (excerpt.rect) {
        setSourceFocus({ documentId: excerpt.documentId, page: excerpt.page, rect: excerpt.rect });
        window.setTimeout(() => setSourceFocus((focus) => focus && focus.documentId === excerpt.documentId && focus.page === excerpt.page ? null : focus), 3600);
      }
    } else {
      switchDocument(excerpt.documentId, excerpt.page, excerpt.rect);
    }
    setReaderFocus(false);
    setToast(`Đã quay lại ${excerpt.documentName} · trang ${excerpt.page}`);
  };

  const hasMeaningfulLocalData = () => workspaces.some((workspace) => {
    if (workspace.kind === "document" || workspace.kind === "collection") return true;
    if (workspace.kind === "demo") return false;
    return workspace.notebooks.some((notebook) => notebook.pages.some((page) => page.body.trim() || page.excerpts.length || page.strokes.length));
  });

  const syncToDrive = async (token = driveToken, silent = false) => {
    if (!token || driveSyncingRef.current) return false;
    driveSyncingRef.current = true;
    setDriveStatus("syncing");
    setDriveError(null);
    if (!silent) setToast("Đang lưu toàn bộ dữ liệu lên Google Drive…");
    try {
      const remoteFiles = await listDriveAppFiles(token);
      const remoteByMednoteId = new Map(remoteFiles.flatMap((file) => file.appProperties?.mednoteId ? [[file.appProperties.mednoteId, file] as const] : []));
      const documents = new Map<string, LibraryDocument>();
      workspaces.forEach((workspace) => workspace.documents.forEach((document) => documents.set(document.id, document)));

      for (const document of documents.values()) {
        const mednoteId = `pdf:${document.id}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const stored = await readLocalPdf(document.id);
        if (!stored) continue;
        const uploaded = await upsertDriveFile(token, {
          name: `${document.id}__${document.name}`,
          mimeType: "application/pdf",
          mednoteId,
          blob: stored.blob,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
      }

      const assetIds = new Set(workspaces.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : [])))));
      for (const assetId of assetIds) {
        const mednoteId = `asset:${assetId}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const blob = await readLocalAsset(assetId);
        if (!blob) continue;
        const uploaded = await upsertDriveFile(token, {
          name: `${assetId}.png`,
          mimeType: blob.type || "image/png",
          mednoteId,
          blob,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
      }

      const savedAt = localSavedAtRef.current || Date.now();
      const snapshot: PersistedLibrary = { workspaces, activeWorkspaceId, readerShare, savedAt };
      const existingManifest = remoteByMednoteId.get(DRIVE_MANIFEST_ID);
      await upsertDriveFile(token, {
        name: "MedNote Workspace.json",
        mimeType: "application/json",
        mednoteId: DRIVE_MANIFEST_ID,
        blob: new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
        existingId: existingManifest?.id,
      });
      setDriveReady(true);
      setDriveLastSyncedAt(savedAt);
      setDriveStatus("connected");
      if (!silent) setToast("Đã đồng bộ đầy đủ lên Google Drive");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đồng bộ Google Drive";
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Lỗi Drive: ${message}`);
      return false;
    } finally {
      driveSyncingRef.current = false;
    }
  };

  const restoreFromDrive = async (token = driveToken, askBeforeReplace = true) => {
    if (!token || driveSyncingRef.current) return false;
    if (askBeforeReplace && hasMeaningfulLocalData() && !window.confirm("Tải dữ liệu từ Google Drive sẽ thay thế workspace đang có trên thiết bị này. Tiếp tục?")) return false;
    driveSyncingRef.current = true;
    setDriveStatus("syncing");
    setDriveError(null);
    setToast("Đang tải dữ liệu từ Google Drive…");
    try {
      const remoteFiles = await listDriveAppFiles(token);
      const remoteByMednoteId = new Map<string, DriveAppFile>(remoteFiles.flatMap((file) => file.appProperties?.mednoteId ? [[file.appProperties.mednoteId, file]] : []));
      const manifestFile = remoteByMednoteId.get(DRIVE_MANIFEST_ID);
      if (!manifestFile) throw new Error("Google Drive chưa có bản lưu MedNote");
      const manifestBlob = await downloadDriveFile(token, manifestFile.id);
      const parsed = JSON.parse(await manifestBlob.text()) as PersistedLibrary;
      if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) throw new Error("Bản lưu Drive không hợp lệ");
      const normalized = parsed.workspaces.map(normalizeWorkspace);
      let missingFiles = 0;

      for (const workspace of normalized) {
        for (const document of workspace.documents) {
          const remote = remoteByMednoteId.get(`pdf:${document.id}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          await saveLocalPdf(await downloadDriveFile(token, remote.id), document);
        }
      }

      const assetIds = new Set(normalized.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : [])))));
      for (const assetId of assetIds) {
        const remote = remoteByMednoteId.get(`asset:${assetId}`);
        if (!remote) {
          missingFiles += 1;
          continue;
        }
        await saveLocalAsset(assetId, await downloadDriveFile(token, remote.id));
      }

      const savedAt = parsed.savedAt || (manifestFile.modifiedTime ? Date.parse(manifestFile.modifiedTime) : Date.now());
      localSavedAtRef.current = savedAt;
      setWorkspaces(normalized);
      setActiveWorkspaceId(normalized.some((workspace) => workspace.id === parsed.activeWorkspaceId) ? parsed.activeWorkspaceId : normalized[0].id);
      setReaderShare(parsed.readerShare || 50);
      setDriveReady(true);
      setDriveLastSyncedAt(savedAt);
      setDriveStatus("connected");
      setToast(missingFiles ? `Đã khôi phục; thiếu ${missingFiles} tệp trên Drive` : "Đã khôi phục đầy đủ từ Google Drive");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể tải dữ liệu từ Google Drive";
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Lỗi Drive: ${message}`);
      return false;
    } finally {
      driveSyncingRef.current = false;
    }
  };

  const connectDrive = async () => {
    setDrivePanelOpen(true);
    const clientId = IS_DESKTOP_APP ? desktopGoogleClientId.trim() : GOOGLE_CLIENT_ID;
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
      setDriveStatus("error");
      setDriveError(IS_DESKTOP_APP ? "Nhập OAuth Client ID loại Desktop app để kết nối Drive" : "Bản triển khai chưa có Google Client ID");
      setToast("Cần cấu hình Google Client ID để bật Drive");
      return;
    }
    if (IS_DESKTOP_APP) {
      try { localStorage.setItem(DESKTOP_GOOGLE_CLIENT_ID_KEY, clientId); } catch { /* keep the public client ID in memory */ }
    }
    setDriveStatus("connecting");
    setDriveError(null);
    try {
      const token = await requestDriveToken(clientId, IS_DESKTOP_APP ? desktopGoogleClientSecret.trim() : "");
      if (IS_DESKTOP_APP) setDesktopGoogleClientSecret("");
      const [user, files] = await Promise.all([getDriveUser(token), listDriveAppFiles(token)]);
      setDriveToken(token);
      setDriveUser(user);
      setDriveStatus("connected");
      const remoteExists = files.some((file) => file.appProperties?.mednoteId === DRIVE_MANIFEST_ID);
      if (remoteExists && !hasMeaningfulLocalData()) {
        await restoreFromDrive(token, false);
      } else if (!remoteExists) {
        await syncToDrive(token);
      } else {
        setDriveReady(false);
        setToast("Drive đã có dữ liệu — chọn tải lên hoặc khôi phục");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kết nối Google Drive";
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Không thể kết nối Drive: ${message}`);
    }
  };

  const disconnectDrive = () => {
    if (driveToken) revokeDriveToken(driveToken);
    setDriveToken(null);
    setDriveUser(null);
    setDriveReady(false);
    setDriveStatus("disconnected");
    setDriveError(null);
    setDrivePanelOpen(false);
    setToast("Đã ngắt Google Drive; dữ liệu cục bộ vẫn được giữ");
  };

  useEffect(() => {
    if (!ready || !driveToken || !driveReady || !driveAutoSync) return;
    const timer = window.setTimeout(() => { void syncToDrive(driveToken, true); }, 2200);
    return () => window.clearTimeout(timer);
  }, [activeWorkspaceId, driveAutoSync, driveReady, driveToken, readerShare, ready, workspaces]);

  const performSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setActiveSearchQuery("");
      return;
    }
    setSearching(true);
    setActiveSearchQuery(query);
    setSearchResults([]);
    const normalizedQuery = query.toLocaleLowerCase();
    if (!activeWorkspace.documents.length) {
      if (activeWorkspace.kind !== "demo") {
        setSearchResults([]);
        setSearching(false);
        setToast("Chưa có PDF để tìm kiếm");
        return;
      }
      const demoText = "Diabetic neuropathy pathophysiology hyperglycemia polyol pathway clinical features diagnosis management peripheral autonomic neuropathy";
      const matches = demoText.toLocaleLowerCase().includes(normalizedQuery)
        ? [{ documentId: null, documentName: "Tài liệu mẫu", page: 126, snippet: demoText, occurrences: 1 }]
        : [];
      setSearchResults(matches);
      setSearching(false);
      return;
    }
    const targets = searchWholeCollection ? activeWorkspace.documents : activeDocument ? [activeDocument] : [];
    const found: SearchResult[] = [];
    for (const target of targets) {
      let proxy: PDFDocumentProxy | null = target.id === loadedDocumentId ? currentPdfDocument : null;
      const temporary = !proxy;
      try {
        if (!proxy) proxy = await loadStoredPdfDocument(target.id);
        if (!proxy) continue;
        for (let pageNumber = 1; pageNumber <= proxy.numPages && found.length < 300; pageNumber += 1) {
          const page = await proxy.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
          const lower = text.toLocaleLowerCase();
          if (pageNumber % 12 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
          let index = lower.indexOf(normalizedQuery);
          if (index < 0) continue;
          let occurrences = 0;
          while (index >= 0) {
            occurrences += 1;
            index = lower.indexOf(normalizedQuery, index + Math.max(1, normalizedQuery.length));
          }
          const first = lower.indexOf(normalizedQuery);
          const start = Math.max(0, first - 70);
          const end = Math.min(text.length, first + query.length + 110);
          found.push({
            documentId: target.id,
            documentName: target.name,
            page: pageNumber,
            snippet: `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
            occurrences,
          });
        }
      } catch { /* keep results from the remaining documents */ }
      finally { if (temporary) void proxy?.destroy(); }
    }
    setSearchResults(found);
    setSearching(false);
    setToast(found.length ? `Tìm thấy ở ${found.length} trang` : "Không tìm thấy kết quả");
  };

  const openSearchResult = (result: SearchResult) => {
    if (result.documentId && result.documentId !== activeDocument?.id) switchDocument(result.documentId, result.page);
    else goToPage(result.page);
    setPdfRailTab("search");
  };

  const exportNotebook = async () => {
    setToast("Đang tạo tệp note…");
    const pagesHtml: string[] = [];
    for (const [index, page] of activeNotebook.pages.entries()) {
      const text = normalizeText(page.text);
      const font = TEXT_FONTS.find((option) => option.id === text.font) ?? TEXT_FONTS[0];
      const textStyle = `font-family:${font.family};font-size:${text.size}px;color:${text.color === "auto" ? "#24343c" : text.color};font-weight:${text.bold ? 700 : 400};font-style:${text.italic ? "italic" : "normal"};text-decoration:${text.underline ? "underline" : "none"};text-align:${text.align}`;
      const excerptsHtml: string[] = [];
      for (const excerpt of page.excerpts) {
        let content = excerpt.kind === "text" ? `<blockquote>${excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")}</blockquote>` : "";
        if (excerpt.kind === "image" && excerpt.assetId) {
          const blob = await readLocalAsset(excerpt.assetId);
          if (blob) content = `<img src="${await blobToDataUrl(blob)}" alt="Hình trích từ PDF">`;
        }
        const caption = excerpt.sourceKind === "manual"
          ? "Hộp chữ"
          : `${escapeHtml(excerpt.documentName ?? "PDF")} — trang ${excerpt.page ?? 1}`;
        excerptsHtml.push(`<figure>${content}<figcaption>${caption}</figcaption></figure>`);
      }
      pagesHtml.push(`<section><h2>${index + 1}. ${escapeHtml(page.title)}</h2><div class="body" style="${textStyle}">${page.bodyHtml ?? plainTextToRichHtml(page.body)}</div>${excerptsHtml.join("")}</section>`);
    }
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(activeNotebook.title)}</title><style>body{max-width:820px;margin:40px auto;padding:0 24px;color:#24343c;font:16px/1.6 system-ui}h1{color:#0e6b70}section{padding:24px 0;border-top:1px solid #d8e1e5}.body{white-space:normal}figure{margin:20px 0;padding:14px;border-left:4px solid #0e6b70;background:#f4f8f8}blockquote{margin:0;font-style:italic}img{max-width:100%;height:auto}figcaption{margin-top:8px;color:#60737d;font-size:13px}</style></head><body><h1>${escapeHtml(activeNotebook.title)}</h1>${pagesHtml.join("")}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeNotebook.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "MedNote"}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Đã xuất note kèm nguồn");
  };

  const handleReaderScroll = () => {
    if (viewMode !== "continuous" || !documentStageRef.current) return;
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const stage = documentStageRef.current!;
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
  }, [activeNote.id, activeNotebook.id, activeWorkspace.id]);

  useEffect(() => {
    setPdfPanel(null);
  }, [activeDocument?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        setShowPdfRail(true);
        setPdfRailTab("search");
        window.setTimeout(() => document.getElementById("pdf-search-input")?.focus(), 0);
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
        setReaderFocus(false);
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const handlePdfFiles = async (selection: FileList | null) => {
    const files = Array.from(selection ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      setToast("Vui lòng chọn tệp PDF");
      return;
    }
    const documents: LibraryDocument[] = files.map((file) => ({
      id: `doc-${stableId(`${file.name}:${file.size}:${file.lastModified}`)}`,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      reader: { ...DEFAULT_READER },
    }));
    try {
      await Promise.all(files.map((file, index) => saveLocalPdf(file, documents[index])));
    } catch {
      setToast("PDF mở được nhưng chưa lưu trên thiết bị");
    }

    const workspaceId = files.length === 1
      ? `workspace-${documents[0].id}`
      : `collection-${stableId(documents.map((document) => document.id).sort().join(":"))}`;
    const existing = workspaces.find((workspace) => workspace.id === workspaceId);
    if (existing) {
      setActiveWorkspaceId(existing.id);
      setLibraryOpen(false);
      setActiveTool("text");
      setToast("Đã mở lại ghi chú đã lưu");
      return;
    }

    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${files[0].name.replace(/\.pdf$/i, "")} +${files.length - 1}`;
    const notebook = createNotebook(`Ghi chú — ${name}`);
    const workspace: WorkspaceItem = {
      id: workspaceId,
      kind: files.length === 1 ? "document" : "collection",
      name,
      documents,
      activeDocumentId: documents[0].id,
      notebooks: [notebook],
      activeNotebookId: notebook.id,
      sourcePage: 1,
    };
    setWorkspaces((items) => [workspace, ...items.filter((item) => item.kind !== "empty")]);
    setActiveWorkspaceId(workspace.id);
    setActiveTool("text");
    setLibraryOpen(false);
    setToast(files.length === 1 ? "Đã tạo sổ ghi chú cho tài liệu" : "Đã tạo ghi chú cho cụm tài liệu");
  };

  const addNotePage = () => {
    const next = createBlankPage(sourcePage, activeNotebook.pages.length + 1, activeNote.paper, activeNote.text);
    updateActiveNotebook((notebook) => ({ ...notebook, pages: [...notebook.pages, next], activePageId: next.id }));
    setActiveTool("text");
    setToast(`Đã thêm trang ${PAPER_SIZES[next.paper.size].label}`);
  };

  const addNotebook = () => {
    const notebook = createNotebook(`Sổ ${activeWorkspace.notebooks.length + 1} — ${activeWorkspace.name}`, sourcePage);
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      notebooks: [...workspace.notebooks, notebook],
      activeNotebookId: notebook.id,
    }));
    setActiveTool("text");
    setToast("Đã tạo sổ ghi chú mới");
  };

  const deleteNotePage = async () => {
    if (!window.confirm(`Xóa trang note “${activeNote.title}”? Thao tác này không thể hoàn tác.`)) return;
    const deletedPageId = activeNote.id;
    const assetIds = activeNote.excerpts.filter((excerpt) => excerpt.kind === "image" && excerpt.assetId).map((excerpt) => excerpt.assetId!);
    await Promise.allSettled(assetIds.map(deleteLocalAsset));
    if (notePages.length === 1) {
      const replacement = createBlankPage(sourcePage, 1, activeNote.paper, activeNote.text);
      updateActiveNotebook((notebook) => ({ ...notebook, pages: [replacement], activePageId: replacement.id }));
      setStrokeHistory((history) => {
        const next = { ...history };
        delete next[deletedPageId];
        return next;
      });
      setActiveTool("text");
      setToast("Đã xóa trang và tạo một trang trống");
      return;
    }
    const index = notePages.findIndex((page) => page.id === activeNote.id);
    const nextPages = notePages.filter((page) => page.id !== activeNote.id);
    const nextActiveId = nextPages[Math.min(index, nextPages.length - 1)].id;
    updateActiveNotebook((notebook) => ({ ...notebook, pages: nextPages, activePageId: nextActiveId }));
    setStrokeHistory((history) => {
      const next = { ...history };
      delete next[deletedPageId];
      return next;
    });
    setToast("Đã xóa trang note");
  };

  const deleteNotebook = async () => {
    const pageCount = activeNotebook.pages.length;
    const lastNotebook = activeWorkspace.notebooks.length === 1;
    const warning = lastNotebook
      ? `Xóa sổ note “${activeNotebook.title}” cùng ${pageCount} trang? Sau đó app sẽ tạo một sổ trống mới cho tài liệu này.`
      : `Xóa sổ note “${activeNotebook.title}” cùng ${pageCount} trang? Thao tác này không thể hoàn tác.`;
    if (!window.confirm(warning)) return;
    const deletedPageIds = new Set(activeNotebook.pages.map((page) => page.id));
    const assetIds = activeNotebook.pages.flatMap((page) => page.excerpts.filter((excerpt) => excerpt.kind === "image" && excerpt.assetId).map((excerpt) => excerpt.assetId!));
    await Promise.allSettled(assetIds.map(deleteLocalAsset));
    if (lastNotebook) {
      const replacement = createNotebook(`Ghi chú — ${activeWorkspace.name}`, sourcePage);
      updateActiveWorkspace((workspace) => ({ ...workspace, notebooks: [replacement], activeNotebookId: replacement.id }));
    } else {
      const index = activeWorkspace.notebooks.findIndex((notebook) => notebook.id === activeNotebook.id);
      const nextNotebooks = activeWorkspace.notebooks.filter((notebook) => notebook.id !== activeNotebook.id);
      const nextActiveId = nextNotebooks[Math.min(index, nextNotebooks.length - 1)].id;
      updateActiveWorkspace((workspace) => ({ ...workspace, notebooks: nextNotebooks, activeNotebookId: nextActiveId }));
    }
    setStrokeHistory((history) => Object.fromEntries(Object.entries(history).filter(([pageId]) => !deletedPageIds.has(pageId))));
    setNotePanel(null);
    setActiveTool("text");
    setToast(lastNotebook ? "Đã xóa sổ note và tạo sổ trống" : "Đã xóa sổ note");
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const pageCount = target.notebooks.reduce((sum, notebook) => sum + notebook.pages.length, 0);
    const targetLabel = target.kind === "collection" ? "cụm tài liệu" : target.kind === "demo" ? "tài liệu mẫu" : "tài liệu";
    if (!window.confirm(`Xóa ${targetLabel} “${target.name}” cùng ${target.notebooks.length} sổ và ${pageCount} trang note? Thao tác này không thể hoàn tác.`)) return;
    const assetIds = target.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.filter((excerpt) => excerpt.kind === "image" && excerpt.assetId).map((excerpt) => excerpt.assetId!)));
    await Promise.allSettled([...target.documents.map((document) => deleteLocalPdf(document.id)), ...assetIds.map(deleteLocalAsset)]);
    const deletedPageIds = new Set(target.notebooks.flatMap((notebook) => notebook.pages.map((page) => page.id)));
    const deletedDocumentIds = new Set(target.documents.map((document) => document.id));
    const targetIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
    const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId);
    const nextWorkspaces = remaining.length ? remaining : [createEmptyWorkspace()];
    setWorkspaces(nextWorkspaces);
    if (activeWorkspaceId === workspaceId) setActiveWorkspaceId(nextWorkspaces[Math.min(targetIndex, nextWorkspaces.length - 1)].id);
    setStrokeHistory((history) => Object.fromEntries(Object.entries(history).filter(([pageId]) => !deletedPageIds.has(pageId))));
    setPdfHistory((history) => Object.fromEntries(Object.entries(history).filter(([documentId]) => !deletedDocumentIds.has(documentId))));
    setNotePanel(null);
    setToast(`Đã xóa ${targetLabel} và note liên quan`);
  };

  const deleteActiveDocument = async () => {
    if (!activeDocument) return;
    if (activeWorkspace.documents.length === 1) {
      await deleteWorkspace(activeWorkspace.id);
      return;
    }
    if (!window.confirm(`Xóa tài liệu “${activeDocument.name}” khỏi cụm? Các sổ note chung của cụm sẽ được giữ lại.`)) return;
    await Promise.allSettled([deleteLocalPdf(activeDocument.id)]);
    const index = activeWorkspace.documents.findIndex((document) => document.id === activeDocument.id);
    const nextDocuments = activeWorkspace.documents.filter((document) => document.id !== activeDocument.id);
    const nextActiveDocument = nextDocuments[Math.min(index, nextDocuments.length - 1)];
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      documents: nextDocuments,
      activeDocumentId: nextActiveDocument.id,
      sourcePage: nextActiveDocument.reader.page,
    }));
    setPdfHistory((history) => {
      const next = { ...history };
      delete next[activeDocument.id];
      return next;
    });
    setToast("Đã xóa tài liệu khỏi cụm; note vẫn được giữ lại");
  };

  const commitStrokes = (next: Stroke[], previous: Stroke[]) => {
    const unchanged = next.length === previous.length && next.every((stroke, index) => stroke === previous[index]);
    if (unchanged) return;
    setStrokeHistory((state) => {
      const history = state[activeNote.id] ?? { undo: [], redo: [] };
      return { ...state, [activeNote.id]: { undo: [...history.undo, previous].slice(-60), redo: [] } };
    });
    updateActiveNote({ strokes: next });
  };

  const undo = () => {
    const history = strokeHistory[activeNote.id];
    const previous = history?.undo.at(-1);
    if (!previous) return;
    updateActiveNote({ strokes: previous });
    setStrokeHistory((state) => ({
      ...state,
      [activeNote.id]: { undo: history.undo.slice(0, -1), redo: [...history.redo, activeNote.strokes].slice(-60) },
    }));
  };

  const redo = () => {
    const history = strokeHistory[activeNote.id];
    const next = history?.redo.at(-1);
    if (!next) return;
    updateActiveNote({ strokes: next });
    setStrokeHistory((state) => ({
      ...state,
      [activeNote.id]: { undo: [...history.undo, activeNote.strokes].slice(-60), redo: history.redo.slice(0, -1) },
    }));
  };

  const updatePaper = (changes: Partial<PaperSettings>) => {
    updateActiveNote({ paper: { ...activeNote.paper, ...changes } });
    setToast("Đã lưu mẫu giấy cho trang này");
  };

  const updateText = (changes: Partial<TextSettings>) => {
    updateActiveNote({ text: { ...activeNote.text, ...changes } });
    setToast("Đã lưu định dạng chữ cho trang này");
  };

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
  const selectedPaperSize = PAPER_SIZES[activeNote.paper.size];
  const paperWidth = activeNote.paper.orientation === "portrait" ? selectedPaperSize.width : selectedPaperSize.height;
  const paperHeight = activeNote.paper.orientation === "portrait" ? selectedPaperSize.height : selectedPaperSize.width;
  const lineStep = activeNote.paper.template === "ruled-dense" ? 5 : 8;
  const defaultTextFont = TEXT_FONTS.find((font) => font.id === activeNote.text.font) ?? TEXT_FONTS[0];
  const selectedToolbarFont = TEXT_FONTS.find((font) => font.id === textToolbar.font) ?? TEXT_FONTS[0];
  const paperStyle = {
    "--paper-ratio": `${paperWidth} / ${paperHeight}`,
    "--paper-max-width": `${activeNote.paper.orientation === "portrait" ? selectedPaperSize.maxWidth : Math.min(920, selectedPaperSize.maxWidth * 1.32)}px`,
    "--paper-line-step": `${(lineStep / paperHeight) * 100}%`,
    "--paper-cell-x": `${(8 / paperWidth) * 100}%`,
    "--paper-cell-y": `${(8 / paperHeight) * 100}%`,
    "--cornell-header": `${(40 / paperHeight) * 100}%`,
  } as React.CSSProperties;
  const textLayerStyle = {
    "--text-font": defaultTextFont.family,
    "--text-size": `${activeNote.text.size}px`,
    "--text-color": activeNote.text.color === "auto" ? "var(--paper-ink)" : activeNote.text.color,
    "--text-weight": activeNote.text.bold ? 700 : 400,
    "--text-style": activeNote.text.italic ? "italic" : "normal",
    "--text-decoration": activeNote.text.underline ? "underline" : "none",
    "--text-align": activeNote.text.align,
  } as React.CSSProperties;

  return (
    <main className="app-shell">
      <input ref={fileInputRef} className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files); event.currentTarget.value = ""; }} />
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button menu-button" aria-label="Mở thư viện" onClick={() => setLibraryOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark">M</div><span className="brand-name">MedNote</span><span className="top-divider" />
          <button className="document-title" onClick={() => setLibraryOpen(true)}><span>{documentName}</span><ChevronDown size={15} /></button>
        </div>
        <div className="top-actions">
          <span className="autosave-status"><i />{toast}</span>
          <button
            className={`drive-button ${driveToken ? "connected" : ""} ${driveStatus === "syncing" || driveStatus === "connecting" ? "busy" : ""}`}
            onClick={() => driveToken ? setDrivePanelOpen((open) => !open) : void connectDrive()}
            aria-label={driveToken ? "Mở đồng bộ Google Drive" : "Kết nối Google Drive"}
            title="Lưu và đồng bộ bằng Google Drive"
          >
            {driveStatus === "syncing" || driveStatus === "connecting" ? <RefreshCw size={16} /> : driveToken ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span>{driveStatus === "syncing" ? "Đang đồng bộ" : driveToken ? "Drive" : "Kết nối Drive"}</span>
          </button>
          <button className="primary-button" onClick={() => fileInputRef.current?.click()}><FolderOpen size={16} /> Thêm tài liệu</button>
        </div>
      </header>

      {drivePanelOpen && (
        <aside className="drive-panel" aria-label="Google Drive">
          <div className="drive-panel-header">
            <div><strong>Google Drive</strong><span>JSON, PDF gốc và hình cắt</span></div>
            <button className="icon-button compact" onClick={() => setDrivePanelOpen(false)} aria-label="Đóng"><X size={17} /></button>
          </div>
          {driveUser ? (
            <>
              <div className="drive-account">
                {driveUser.photoLink ? <img src={driveUser.photoLink} alt="" /> : <span>{driveUser.displayName.slice(0, 1).toUpperCase()}</span>}
                <div><strong>{driveUser.displayName}</strong><small>{driveUser.emailAddress}</small></div>
                <i className={driveStatus === "error" ? "error" : ""} />
              </div>
              {!driveReady && <div className="drive-conflict"><strong>Chọn bản dữ liệu muốn dùng</strong><span>Drive và thiết bị này đều đang có workspace. MedNote sẽ không tự ghi đè khi chưa chọn.</span></div>}
              <div className="drive-actions">
                <button onClick={() => { void syncToDrive(); }} disabled={driveStatus === "syncing"}><UploadCloud size={17} /><span><strong>Lưu bản này lên Drive</strong><small>Cập nhật Drive từ thiết bị hiện tại</small></span></button>
                <button onClick={() => { void restoreFromDrive(); }} disabled={driveStatus === "syncing"}><DownloadCloud size={17} /><span><strong>Tải bản từ Drive</strong><small>Khôi phục workspace và các tệp</small></span></button>
              </div>
              <label className="drive-auto-sync"><input type="checkbox" checked={driveAutoSync} disabled={!driveReady} onChange={(event) => setDriveAutoSync(event.target.checked)} /><span><strong>Tự động đồng bộ</strong><small>Vẫn luôn lưu một bản cục bộ trên thiết bị</small></span></label>
              <div className="drive-panel-footer">
                <span>{driveError || (driveLastSyncedAt ? `Lần cuối: ${new Date(driveLastSyncedAt).toLocaleString("vi-VN")}` : "Đã kết nối, chưa đồng bộ")}</span>
                <div>{driveStatus === "error" && <button onClick={() => { void connectDrive(); }}>Kết nối lại</button>}<button onClick={disconnectDrive}>Ngắt kết nối</button></div>
              </div>
            </>
          ) : (
            <div className={`drive-empty ${driveError ? "error" : ""}`}>
              {driveStatus === "connecting" ? <RefreshCw className="spin" size={28} /> : <CloudOff size={28} />}
              <strong>{driveStatus === "connecting" ? "Đang kết nối…" : "Chưa thể dùng Google Drive"}</strong>
              <span>{driveError || "Đăng nhập để lưu workspace trên Drive."}</span>
              {IS_DESKTOP_APP && driveStatus !== "connecting" && <>
                <label className="drive-client-id"><span>OAuth Client ID (Desktop)</span><input value={desktopGoogleClientId} onChange={(event) => { setDesktopGoogleClientId(event.target.value.trim()); setDriveError(null); }} placeholder="…apps.googleusercontent.com" spellCheck={false} /><small>Dùng Client ID loại Desktop app.</small></label>
                <label className="drive-client-id"><span>Client Secret (nếu Google cấp)</span><input type="password" value={desktopGoogleClientSecret} onChange={(event) => { setDesktopGoogleClientSecret(event.target.value.trim()); setDriveError(null); }} placeholder="GOCSPX-…" autoComplete="off" spellCheck={false} /><small>Lấy cùng Client ID trong tệp JSON của OAuth Desktop; được lưu mã hóa sau khi kết nối.</small></label>
              </>}
              {driveStatus !== "connecting" && <button onClick={() => { void connectDrive(); }}>Kết nối</button>}
            </div>
          )}
        </aside>
      )}

      {libraryOpen && (
        <div className="library-backdrop" onPointerDown={() => setLibraryOpen(false)}>
          <aside className="library-panel" aria-label="Thư viện tài liệu" onPointerDown={(event) => event.stopPropagation()}>
            <div className="library-header"><div><strong>Thư viện</strong><span>Mỗi mục có sổ ghi chú riêng</span></div><button className="icon-button" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={19} /></button></div>
            <button className="library-import" onClick={() => fileInputRef.current?.click()}><FolderOpen size={18} /><span><strong>Thêm PDF hoặc cụm tài liệu</strong><small>Chọn nhiều PDF cùng lúc để tạo một cụm</small></span></button>
            <div className="library-list">
              {workspaces.map((workspace) => {
                const pageCount = workspace.notebooks.reduce((sum, notebook) => sum + notebook.pages.length, 0);
                return (
                  <div className="library-row" key={workspace.id}>
                    <button className={`library-item ${workspace.id === activeWorkspace.id ? "active" : ""}`} onClick={() => { setActiveWorkspaceId(workspace.id); setLibraryOpen(false); }}>
                      <span className="library-icon"><FileText size={19} /></span>
                      <span><strong>{workspace.name}</strong><small>{workspace.kind === "collection" ? `${workspace.documents.length} tài liệu` : workspace.kind === "demo" ? "Tài liệu mẫu" : workspace.kind === "empty" ? "Chưa có PDF" : "1 tài liệu"} · {workspace.notebooks.length} sổ · {pageCount} trang note</small></span>
                    </button>
                    {workspace.kind !== "empty" && <button className="library-delete" onClick={() => { void deleteWorkspace(workspace.id); }} aria-label={`Xóa ${workspace.name}`} title="Xóa tài liệu và note liên quan"><Trash2 size={17} /></button>}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {pdfSelection && (
        <div className={`pdf-selection-menu placement-${pdfSelection.menuPlacement} ${dictionaryLookup.status === "idle" ? "compact" : "translation-open"}`} style={{ left: pdfSelection.menuX, top: pdfSelection.menuY, maxHeight: pdfSelection.menuMaxHeight }} role="dialog" aria-label="Tra từ và thao tác với đoạn chữ đã chọn">
          <div className="pdf-selection-actions" role="toolbar" aria-label="Thao tác với đoạn chữ">
            <button onClick={() => { void copyPdfSelection(); }} aria-label="Sao chép" title="Sao chép"><Copy size={14} /> Chép</button>
            <button onClick={requestDictionaryLookup} disabled={dictionaryLookup.status === "loading"} aria-label="Dịch Anh sang Việt" title="Dịch Anh sang Việt"><Languages size={14} /> Dịch</button>
            <button onClick={() => addPdfMarkup("highlight")} aria-label="Tô sáng" title="Tô sáng"><Highlighter size={14} /> Tô</button>
            <button onClick={() => addPdfMarkup("underline")} aria-label="Gạch chân" title="Gạch chân"><Underline size={14} /> Chân</button>
            <button onClick={() => addPdfMarkup("strikeout")} aria-label="Gạch ngang" title="Gạch ngang"><Strikethrough size={14} /> Ngang</button>
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

      <section className={`workspace ${showPdfRail ? "" : "pdf-rail-collapsed"} ${pdfRailTab === "pages" ? "" : "pdf-rail-wide"} ${readerFocus ? "reader-focus" : ""}`} ref={workspaceRef} style={gridStyle}>
        <aside className={`pdf-thumbnails pdf-panel-${pdfRailTab}`} aria-label="Điều hướng tài liệu">
          <div className="pdf-rail-tabs">
            <button className={pdfRailTab === "pages" ? "active" : ""} onClick={() => setPdfRailTab("pages")} title="Trang" aria-label="Hình thu nhỏ các trang"><ScanText size={17} /></button>
            <button className={pdfRailTab === "outline" ? "active" : ""} onClick={() => setPdfRailTab("outline")} title="Mục lục" aria-label="Mục lục PDF"><ListTree size={17} /></button>
            <button className={pdfRailTab === "search" ? "active" : ""} onClick={() => setPdfRailTab("search")} title="Tìm kiếm" aria-label="Tìm kiếm"><Search size={17} /></button>
            <button className={pdfRailTab === "marks" ? "active" : ""} onClick={() => setPdfRailTab("marks")} title="Đánh dấu" aria-label="Bookmark và chú thích"><Bookmark size={17} /></button>
            <button onClick={() => setShowPdfRail(false)} title="Thu gọn" aria-label="Thu gọn bảng điều hướng"><ChevronLeft size={17} /></button>
          </div>

          {pdfRailTab === "pages" && (
            <div className="thumb-list">
              {sourcePages.map((page) => currentPdfDocument ? (
                <PdfThumbnail key={`${activeDocument?.id}-${page}`} document={currentPdfDocument} page={page} active={page === sourcePage} onClick={() => goToPage(page)} />
              ) : (
                <button className={`pdf-thumb ${page === sourcePage ? "active" : ""}`} key={page} onClick={() => goToPage(page)}><span className="mini-paper"><i /><i /><i /><i className="wide" /><b /></span><span>{page}</span></button>
              ))}
            </div>
          )}

          {pdfRailTab === "outline" && (
            <div className="pdf-rail-content">
              <h3>Mục lục</h3>
              {outline.length ? outline.map((entry, index) => (
                <button key={`${entry.title}-${index}`} className="outline-entry" style={{ paddingLeft: 10 + Math.min(entry.depth, 4) * 13 }} disabled={!entry.page} onClick={() => entry.page && goToPage(entry.page)}>
                  <span>{entry.title}</span>{entry.page && <b>{entry.page}</b>}
                </button>
              )) : <div className="rail-empty"><ListTree size={25} /><span>PDF này không có mục lục nhúng.</span></div>}
            </div>
          )}

          {pdfRailTab === "search" && (
            <div className="pdf-rail-content search-panel">
              <h3>Tìm trong tài liệu</h3>
              <form onSubmit={(event) => { event.preventDefault(); void performSearch(); }}>
                <div className="rail-search-box"><Search size={15} /><input id="pdf-search-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nhập từ cần tìm…" /><button type="submit">Tìm</button></div>
                {activeWorkspace.documents.length > 1 && <label className="collection-search"><input type="checkbox" checked={searchWholeCollection} onChange={(event) => setSearchWholeCollection(event.target.checked)} /> Tìm trong cả {activeWorkspace.documents.length} tài liệu</label>}
              </form>
              <div className="search-summary">{searching ? "Đang đọc lớp chữ của PDF…" : activeSearchQuery ? `${searchResults.length} trang có kết quả` : "Ctrl+F để mở nhanh"}</div>
              <div className="search-results">
                {searchResults.map((result, index) => <button key={`${result.documentId}-${result.page}-${index}`} onClick={() => openSearchResult(result)}><span><b>{result.documentName}</b><em>Trang {result.page} · {result.occurrences} kết quả</em></span><p>{result.snippet}</p></button>)}
                {!searching && activeSearchQuery && !searchResults.length && <div className="rail-empty"><Search size={24} /><span>Không tìm thấy “{activeSearchQuery}”. PDF scan cần OCR.</span></div>}
              </div>
            </div>
          )}

          {pdfRailTab === "marks" && (
            <div className="pdf-rail-content marks-panel">
              <h3>Đánh dấu trang</h3>
              {bookmarks.length ? bookmarks.map((page) => <div className="mark-row" key={`bookmark-${page}`}><button onClick={() => goToPage(page)}><BookmarkCheck size={15} /><span>Trang {page}</span></button><button aria-label={`Bỏ đánh dấu trang ${page}`} onClick={() => updateReader((reader) => ({ ...reader, bookmarks: reader.bookmarks.filter((item) => item !== page) }))}><X size={14} /></button></div>) : <p className="marks-empty">Chưa có trang được đánh dấu.</p>}
              <h3>Chú thích</h3>
              {pdfAnnotations.length ? [...pdfAnnotations].sort((a, b) => a.page - b.page).map((annotation) => <div className="annotation-row" key={annotation.id}><button onClick={() => goToPage(annotation.page)}><span className={`annotation-kind kind-${annotation.kind}`}>{annotation.kind === "highlight" ? "Tô" : annotation.kind === "underline" ? "Gạch chân" : annotation.kind === "strikeout" ? "Gạch ngang" : "Nét bút"}</span><b>Trang {annotation.page}</b><p>{annotation.kind === "ink" ? `${annotation.points.length} điểm bút` : annotation.text}</p></button><button className="delete-mark" onClick={() => removePdfAnnotation(annotation.id)} aria-label="Xóa chú thích"><Trash2 size={14} /></button></div>) : <div className="rail-empty"><Highlighter size={24} /><span>Highlight và nét bút sẽ xuất hiện tại đây.</span></div>}
            </div>
          )}
        </aside>

        <section className="reader-pane">
          <div className="pane-toolbar pdf-toolbar two-row-toolbar" role="toolbar" aria-label="Công cụ PDF">
            <div className="toolbar-row toolbar-row-primary">
              {!showPdfRail && <button className="pdf-toolbar-button" aria-label="Hiện bảng điều hướng" title="Hiện bảng điều hướng" onClick={() => setShowPdfRail(true)}><PanelLeftOpen size={17} /></button>}
              {activeWorkspace.documents.length > 1 ? (
                <select className="document-switcher" value={activeDocument?.id ?? ""} onChange={(event) => switchDocument(event.target.value)} aria-label="Tài liệu trong cụm">
                  {activeWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
                </select>
              ) : <span className="current-document-label">{activeDocument?.name ?? "Tài liệu mẫu"}</span>}
              {activeDocument && <button className="pdf-toolbar-button danger-icon" aria-label="Xóa tài liệu" title="Xóa tài liệu" onClick={() => { void deleteActiveDocument(); }}><Trash2 size={17} /></button>}
              <span className="toolbar-divider" />
              {activeWorkspace.kind !== "empty" && <div className="page-control"><button aria-label="Trang trước" disabled={sourcePage <= 1} onClick={() => goToPage(sourcePage - 1)}><ChevronLeft size={14} /></button><label><input key={`${activeDocument?.id}-${sourcePage}`} defaultValue={sourcePage} inputMode="numeric" aria-label="Số trang" onKeyDown={(event) => { if (event.key === "Enter") goToPage(Number(event.currentTarget.value)); }} onBlur={(event) => goToPage(Number(event.currentTarget.value))} /><span>/ {totalPages}</span></label><button aria-label="Trang sau" disabled={sourcePage >= totalPages} onClick={() => goToPage(sourcePage + 1)}><ChevronRight size={14} /></button></div>}
              <div className="zoom-control"><button aria-label="Thu nhỏ" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom - .1)}><Minus size={15} /></button><span>{Math.round(sourceZoom * 100)}%</span><button aria-label="Phóng to" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom + .1)}><Plus size={15} /></button></div>
              <span className="toolbar-spacer" />
              <button className={`pdf-toolbar-button ${bookmarks.includes(sourcePage) ? "active" : ""}`} disabled={!currentPdfDocument} onClick={toggleBookmark} title="Đánh dấu trang">{bookmarks.includes(sourcePage) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
              <button className={`pdf-toolbar-button menu-trigger ${pdfPanel === "view" ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => setPdfPanel((panel) => panel === "view" ? null : "view")} title="Tùy chọn hiển thị" aria-expanded={pdfPanel === "view"}><Settings2 size={17} /><span>Hiển thị</span><ChevronDown size={12} /></button>
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster" aria-label="Công cụ thao tác PDF">
                {PDF_TOOLS.map(({ id, label, shortLabel, icon: Icon }) => <button key={id} className={`pdf-toolbar-button pdf-mode-button ${pdfTool === id ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => choosePdfTool(id)} title={label} aria-label={label}><Icon size={18} />{pdfTool === id && <span>{shortLabel}</span>}{["pen", "highlight", "underline", "strikeout"].includes(id) && <ChevronDown className="tool-chevron" size={11} />}</button>)}
              </div>
              <span className="toolbar-spacer" />
              <button className="pdf-toolbar-button" disabled={!(pdfHistory[pdfHistoryKey]?.undo.length)} onClick={undoPdf} title="Hoàn tác chú thích"><Undo2 size={17} /></button>
              <button className="pdf-toolbar-button" disabled={!(pdfHistory[pdfHistoryKey]?.redo.length)} onClick={redoPdf} title="Làm lại chú thích"><Redo2 size={17} /></button>
            </div>
          </div>

          {pdfPanel === "view" && (
            <div className="floating-tool-panel pdf-view-panel" role="dialog" aria-label="Tùy chọn hiển thị PDF">
              <div className="tool-panel-heading"><div><strong>Hiển thị PDF</strong><span>Thu phóng và bố cục trang</span></div><button className="icon-button compact" onClick={() => setPdfPanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <div className="option-tile-grid">
                <button className={fitMode === "width" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, fitMode: "width", zoom: 1 }))}><Rows3 size={18} /><span>Vừa chiều rộng</span></button>
                <button className={fitMode === "page" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, fitMode: "page", zoom: 1 }))}><Square size={18} /><span>Vừa toàn trang</span></button>
                <button onClick={() => updateReader((reader) => ({ ...reader, rotation: (reader.rotation + 90) % 360 }))}><RotateCw size={18} /><span>Xoay 90°</span></button>
                <button className={viewMode === "continuous" ? "selected" : ""} onClick={() => updateReader((reader) => ({ ...reader, viewMode: reader.viewMode === "single" ? "continuous" : "single", fitMode: reader.viewMode === "single" ? "width" : "page", zoom: 1 }))}>{viewMode === "single" ? <Rows3 size={18} /> : <Square size={18} />}<span>{viewMode === "single" ? "Cuộn liên tục" : "Từng trang"}</span></button>
                <button className={readerFocus ? "selected" : ""} onClick={() => setReaderFocus((focus) => !focus)}><Maximize2 size={18} /><span>{readerFocus ? "Trở lại chia đôi" : "Tập trung đọc"}</span></button>
              </div>
            </div>
          )}

          {pdfPanel === "ink" && (
            <div className="floating-tool-panel pdf-ink-panel" role="dialog" aria-label="Cài đặt công cụ PDF">
              <div className="tool-panel-heading"><div><strong>{pdfTool === "pen" ? "Bút viết PDF" : "Màu chú thích"}</strong><span>Chọn màu không làm đổi công cụ</span></div><button className="icon-button compact" onClick={() => setPdfPanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <div className="panel-setting"><label>Màu</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /><span>+</span></label></div></div>
              {pdfTool === "pen" && <div className="panel-setting"><label>Độ dày</label><div className="width-options">{[1, 2, 3, 5].map((width) => <button key={width} className={inkWidth === width ? "selected" : ""} onClick={() => setInkWidth(width)}><i style={{ height: width }} />{width}</button>)}</div></div>}
            </div>
          )}

          <div className={`document-stage workspace-frame pdf-view-${viewMode}`} ref={documentStageRef} onScroll={handleReaderScroll}>
            {currentPdfDocument && viewMode === "single" ? <PdfPageView key={`${activeDocument?.id}-${sourcePage}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={sourcePage} zoom={sourceZoom} fitMode={fitMode} rotation={rotation} tool={pdfTool} inkColor={inkColor} inkWidth={inkWidth} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus?.documentId === activeDocument?.id && sourceFocus.page === sourcePage ? sourceFocus.rect : null} onSelection={handlePdfSelection} onInkCommit={(next, previous) => commitPdfInk(sourcePage, next, previous)} onCrop={addImageExcerpt} /> : currentPdfDocument ? (
              <div className="continuous-pages">
                {sourcePages.map((page) => <LazyPdfPageView key={`${activeDocument?.id}-${page}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={page} zoom={sourceZoom} fitMode="width" rotation={rotation} tool={pdfTool} inkColor={inkColor} inkWidth={inkWidth} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus?.documentId === activeDocument?.id && sourceFocus.page === page ? sourceFocus.rect : null} onSelection={handlePdfSelection} onInkCommit={(next, previous) => commitPdfInk(page, next, previous)} onCrop={addImageExcerpt} />)}
              </div>
            ) : activeDocument ? (
              <div className="empty-document"><FileText size={34} /><strong>{pdfStatus === "error" ? "Không tìm thấy bản PDF đã lưu" : "Đang mở tài liệu…"}</strong>{pdfStatus === "error" && <button className="primary-button" onClick={() => fileInputRef.current?.click()}>Chọn lại PDF</button>}</div>
            ) : activeWorkspace.kind === "demo" ? <><div className="demo-reader-hint"><BookOpen size={16} /><span>Đây là tài liệu minh họa. Thêm một PDF để dùng chọn chữ, chú thích và cắt hình.</span></div><DemoDocument page={sourcePage} /></> : (
              <div className="empty-document"><FolderOpen size={34} /><strong>Chưa có tài liệu</strong><span>Thêm PDF để đọc và tạo ghi chú đi kèm.</span><button className="primary-button" onClick={() => fileInputRef.current?.click()}>Thêm tài liệu</button></div>
            )}
          </div>
        </section>

        <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>

        <section className="notes-pane">
          <div className={`note-toolbar two-row-toolbar ${notePanel === "text" ? "text-tools-open" : ""}`} role="toolbar" aria-label="Công cụ ghi chú">
            <div className="toolbar-row toolbar-row-primary">
              <div className="toolbar-cluster note-file-actions">
                <button className="note-create-button primary icon-only" onClick={addNotePage} aria-label="Thêm trang" title="Thêm trang"><Plus size={18} /></button>
                <button className="note-create-button" onClick={addNotebook}><FileText size={16} /><span>Sổ mới</span></button>
                <button className="note-create-button danger" onClick={() => { void deleteNotebook(); }}><Trash2 size={15} /><span>Xóa sổ</span></button>
                <button className="note-create-button" onClick={() => { void exportNotebook(); }}><Download size={16} /><span>Xuất note</span></button>
              </div>
              <span className="toolbar-spacer" />
              <div className="toolbar-cluster history-cluster">
                <button className="icon-button compact" aria-label="Hoàn tác" onClick={undo} disabled={!(strokeHistory[activeNote.id]?.undo.length)}><Undo2 size={19} /></button>
                <button className="icon-button compact" aria-label="Làm lại" onClick={redo} disabled={!(strokeHistory[activeNote.id]?.redo.length)}><Redo2 size={19} /></button>
                <button className="icon-button compact delete-tool" aria-label="Xóa trang note" title="Xóa trang" onClick={() => { void deleteNotePage(); }}><Trash2 size={18} /></button>
              </div>
              <button className={`paper-button ${notePanel === "paper" ? "active" : ""}`} onClick={() => setNotePanel((panel) => panel === "paper" ? null : "paper")} aria-expanded={notePanel === "paper"}><NotebookTabs size={17} /><span>Giấy</span><ChevronDown size={11} /></button>
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster note-tool-cluster">
                {tools.map(({ id, label, icon: Icon }) => {
                  const hasPanel = ["pen", "highlight", "shape", "text", "textbox"].includes(id);
                  const shortLabel = id === "text" ? "Type" : id === "textbox" ? "Text box" : label;
                  return <button key={id} className={`tool-button ${hasPanel ? "expandable" : ""} ${activeTool === id ? "active show-label" : ""}`} onClick={() => chooseNoteTool(id)} aria-label={label} title={label} aria-expanded={hasPanel ? ((id === "pen" || id === "highlight") ? notePanel === "ink" : (id === "text" || id === "textbox") ? notePanel === "text" : notePanel === id) : undefined}><Icon size={20} />{activeTool === id && <span className="tool-label">{shortLabel}</span>}{hasPanel && <ChevronDown className="tool-chevron" size={11} />}</button>;
                })}
              </div>
              <span className="toolbar-spacer" />
              <div className={`toolbar-cluster object-layer-cluster ${selectedExcerpt ? "has-selection" : ""}`} aria-label="Sắp xếp lớp đối tượng">
                <span className="layer-control-label" title={selectedExcerpt ? "Đối tượng đang chọn" : "Chọn một khung chữ hoặc ảnh để sắp xếp lớp"}><Layers2 size={16} /><span>Lớp</span></span>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === 0} onClick={() => shiftExcerptLayer("backward")} aria-label="Đưa đối tượng xuống một lớp" title="Đưa xuống một lớp"><ChevronDown size={18} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === activeNote.excerpts.length - 1} onClick={() => shiftExcerptLayer("forward")} aria-label="Đưa đối tượng lên một lớp" title="Đưa lên một lớp"><ChevronUp size={18} /></button>
              </div>
            </div>
            {notePanel === "text" && <>
              <div className="toolbar-row text-command-row text-character-row" aria-label="Định dạng ký tự">
                <span className="type-row-label">Type</span>
                <select className="word-font-select" value={textToolbar.font} style={{ fontFamily: selectedToolbarFont.family }} onChange={(event) => applyTextCommand("font", event.target.value)} aria-label="Font chữ">{TEXT_FONTS.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.label}</option>)}</select>
                <select className="word-size-select" value={textToolbar.size} onChange={(event) => applyTextCommand("size", Number(event.target.value))} aria-label="Cỡ chữ">{[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72].map((size) => <option key={size} value={size}>{size}</option>)}</select>
                <div className="text-style-buttons compact-style-buttons" aria-label="Kiểu chữ"><button className={textToolbar.bold ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("bold")} title="Đậm"><Bold size={16} /></button><button className={textToolbar.italic ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("italic")} title="Nghiêng"><Italic size={16} /></button><button className={textToolbar.underline ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("underline")} title="Gạch chân"><Underline size={16} /></button><button className={textToolbar.strike ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("strike")} title="Gạch ngang"><Strikethrough size={16} /></button></div>
                <span className="toolbar-mini-divider" />
                <button className="word-command-button auto-text-color" onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("color", activeNote.paper.color === "dark" ? "#edf3f4" : "#26343a")} title="Màu chữ tự động"><span>A</span><i /></button>
                <label className="word-color-picker" title="Màu chữ tùy chỉnh"><span className="color-letter" style={{ borderBottomColor: textToolbar.color }}>A</span><input type="color" value={textToolbar.color === "auto" ? "#26343a" : textToolbar.color} onChange={(event) => applyTextCommand("color", event.target.value)} /></label>
                <div className="inline-swatch-group" aria-label="Màu nền chữ">
                  <PaintBucket size={15} />
                  {TEXT_BACKGROUND_COLORS.map((color) => <button key={color} className={`inline-color-swatch ${textToolbar.backgroundColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("background", color)} title={color === "transparent" ? "Bỏ màu nền chữ" : `Màu nền ${color}`} />)}
                  <label className="inline-custom-color" title="Màu nền chữ tùy chỉnh"><input type="color" value={textToolbar.backgroundColor === "transparent" ? "#fff2a8" : textToolbar.backgroundColor} onChange={(event) => applyTextCommand("background", event.target.value)} /><span>+</span></label>
                </div>
                <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("clear")} title="Xóa định dạng"><RemoveFormatting size={16} /></button>
              </div>
              <div className="toolbar-row text-command-row text-paragraph-row" aria-label="Định dạng đoạn, ký hiệu và bảng">
                <div className="text-style-buttons compact-style-buttons" aria-label="Căn chữ"><button className={textToolbar.align === "left" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("left")} title="Căn trái"><AlignLeft size={16} /></button><button className={textToolbar.align === "center" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("center")} title="Căn giữa"><AlignCenter size={16} /></button><button className={textToolbar.align === "right" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("right")} title="Căn phải"><AlignRight size={16} /></button><button className={textToolbar.align === "justify" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("justify")} title="Căn đều hai bên"><AlignJustify size={16} /></button></div>
                <label className="word-select-with-icon" title="Khoảng cách dòng"><Rows3 size={15} /><select value={textToolbar.lineHeight} onChange={(event) => applyTextLineHeight(event.target.value as TextLineHeight)} aria-label="Khoảng cách dòng"><option value="1">1,0</option><option value="1.15">1,15</option><option value="1.5">1,5</option><option value="1.8">1,8</option><option value="2">2,0</option></select></label>
                <label className="word-select-with-icon bullet-style-select" title="Kiểu dấu đầu dòng"><List size={15} /><select value={textToolbar.bulletStyle} onChange={(event) => applyBulletStyle(event.target.value as BulletStyle)} aria-label="Kiểu dấu đầu dòng"><option value="disc">• Tròn đặc</option><option value="circle">○ Tròn rỗng</option><option value="square">▪ Hình vuông</option><option value="dash">– Gạch ngang</option></select></label>
                <button className={`word-command-button ${textToolbar.ordered ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("numbering")} title="Danh sách đánh số"><ListOrdered size={16} /></button>
                <span className="toolbar-mini-divider" />
                <button className={`word-command-button labeled ${textInsertPopover === "symbols" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => setTextInsertPopover((current) => current === "symbols" ? null : "symbols")} title="Chèn ký hiệu"><Omega size={16} /><span>Ký hiệu</span></button>
                <button className={`word-command-button labeled ${textInsertPopover === "equation" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => setTextInsertPopover((current) => current === "equation" ? null : "equation")} title="Chèn công thức"><Sigma size={16} /><span>Công thức</span></button>
                <button className={`word-command-button labeled ${textInsertPopover === "table" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => setTextInsertPopover((current) => current === "table" ? null : "table")} title="Chèn bảng"><Table2 size={16} /><span>Bảng</span></button>
                <span className="toolbar-mini-divider" />
                <span className="table-border-label">Đường kẻ</span>
                <select className="border-style-select" value={tableBorder.style} onChange={(event) => updateTableBorder({ style: event.target.value as TableBorderStyle })} aria-label="Loại đường kẻ bảng"><option value="solid">Liền</option><option value="dashed">Gạch</option><option value="dotted">Chấm</option><option value="double">Đôi</option></select>
                <select className="border-width-select" value={tableBorder.width} onChange={(event) => updateTableBorder({ width: Number(event.target.value) })} aria-label="Độ dày đường kẻ bảng">{[1, 2, 3, 4, 6].map((width) => <option key={width} value={width}>{width}px</option>)}</select>
                <label className="table-border-color" title="Màu đường kẻ bảng"><span style={{ background: tableBorder.color }} /><input type="color" value={tableBorder.color} onChange={(event) => updateTableBorder({ color: event.target.value })} /></label>
                <span className="selection-format-hint">Bôi chọn chữ để định dạng cục bộ</span>
              </div>
            </>}
          </div>

          {notePanel === "text" && textInsertPopover === "symbols" && <div className="text-insert-popover symbol-popover" role="dialog" aria-label="Chèn ký hiệu"><header><strong>Ký hiệu</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>{SYMBOL_GROUPS.map((group) => <section key={group.label}><label>{group.label}</label><div>{group.symbols.map((symbol) => <button key={symbol} onPointerDown={(event) => event.preventDefault()} onClick={() => insertTextAtSelection(symbol)}>{symbol}</button>)}</div></section>)}</div>}

          {notePanel === "text" && textInsertPopover === "equation" && <div className="text-insert-popover equation-popover" role="dialog" aria-label="Chèn công thức"><header><strong>Công thức</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header><label className="equation-input-label">Nhập công thức bằng ký hiệu Unicode<input value={equationDraft} onChange={(event) => setEquationDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") insertEquation(); }} autoFocus /></label><div className="equation-presets">{EQUATION_PRESETS.map((equation) => <button key={equation} onClick={() => setEquationDraft(equation)}>{equation}</button>)}</div><button className="insert-confirm-button" onClick={() => insertEquation()}><Sigma size={15} /> Chèn công thức</button></div>}

          {notePanel === "text" && textInsertPopover === "table" && <div className="text-insert-popover table-popover" role="dialog" aria-label="Chèn bảng"><header><strong>Chèn bảng</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header><div className="table-size-controls"><label>Hàng<input type="number" min="1" max="12" value={tableRows} onChange={(event) => setTableRows(Math.max(1, Math.min(12, Number(event.target.value))))} /></label><span>×</span><label>Cột<input type="number" min="1" max="10" value={tableColumns} onChange={(event) => setTableColumns(Math.max(1, Math.min(10, Number(event.target.value))))} /></label></div><div className="table-preview-grid" style={{ gridTemplateColumns: `repeat(${tableColumns}, 12px)` }} aria-hidden="true">{Array.from({ length: tableRows * tableColumns }, (_, index) => <i key={index} style={{ borderStyle: tableBorder.style, borderWidth: `${Math.min(tableBorder.width, 3)}px`, borderColor: tableBorder.color }} />)}</div><button className="insert-confirm-button" onClick={insertTable}><Table2 size={15} /> Chèn bảng {tableRows} × {tableColumns}</button></div>}

          {notePanel === "ink" && (
            <div className="floating-tool-panel note-ink-panel" role="dialog" aria-label="Cài đặt bút">
              <div className="tool-panel-heading"><div><strong>{activeTool === "highlight" ? "Bút tô sáng" : "Bút viết"}</strong><span>Chọn màu không làm đổi loại bút</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              {activeTool === "pen" && <div className="panel-setting"><label>Loại bút</label><div className="pen-style-grid">{PEN_STYLES.map(({ id, label, icon: Icon }) => <button key={id} className={penStyle === id ? "selected" : ""} onClick={() => setPenStyle(id)}><Icon size={22} /><span>{label}</span>{penStyle === id && <Check size={13} />}</button>)}</div></div>}
              <div className="panel-setting"><label>Màu mực</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /><span>+</span></label></div></div>
              <div className="panel-setting"><label>Độ dày</label><div className="width-options">{(activeTool === "highlight" ? [8, 14, 20, 28] : [1, 2, 3, 5]).map((width) => { const selected = activeTool === "highlight" ? highlighterWidth === width : inkWidth === width; return <button key={width} className={selected ? "selected" : ""} onClick={() => activeTool === "highlight" ? setHighlighterWidth(width) : setInkWidth(width)}><i style={{ height: Math.min(width, 8) }} />{width}</button>; })}</div></div>
            </div>
          )}

          {notePanel === "shape" && (
            <div className="floating-tool-panel note-shape-panel" role="dialog" aria-label="Cài đặt hình học">
              <div className="tool-panel-heading"><div><strong>Hình học</strong><span>Chọn hình, màu và độ dày nét</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <div className="shape-option-grid">
                {([['line', 'Đường thẳng'], ['arrow', 'Mũi tên'], ['rectangle', 'Chữ nhật'], ['ellipse', 'Bầu dục'], ['circle', 'Hình tròn']] as [ShapeKind, string][]).map(([id, label]) => <button key={id} className={shapeKind === id ? "selected" : ""} onClick={() => setShapeKind(id)}><span className={`shape-sample shape-${id}`} /><b>{label}</b></button>)}
              </div>
              <div className="panel-setting"><label>Màu nét</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /><span>+</span></label></div></div>
              <div className="panel-setting"><label>Độ dày</label><div className="width-options">{[1, 2, 3, 5].map((width) => <button key={width} className={inkWidth === width ? "selected" : ""} onClick={() => setInkWidth(width)}><i style={{ height: width }} />{width}</button>)}</div></div>
            </div>
          )}

          {notePanel === "paper" && (
            <div className="paper-panel" role="dialog" aria-label="Cài đặt giấy">
              <div className="paper-panel-heading"><div><strong>Mẫu giấy</strong><span>Áp dụng riêng cho trang hiện tại</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <section>
                <label>Khổ giấy</label>
                <div className="paper-size-grid">
                  {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => {
                    const option = PAPER_SIZES[size];
                    return <button key={size} className={activeNote.paper.size === size ? "selected" : ""} onClick={() => updatePaper({ size })}><b>{option.label}</b><small>{option.dimensions}</small>{activeNote.paper.size === size && <Check size={14} />}</button>;
                  })}
                </div>
              </section>
              <section>
                <label>Hướng giấy</label>
                <div className="segmented-control"><button className={activeNote.paper.orientation === "portrait" ? "selected" : ""} onClick={() => updatePaper({ orientation: "portrait" })}>Dọc</button><button className={activeNote.paper.orientation === "landscape" ? "selected" : ""} onClick={() => updatePaper({ orientation: "landscape" })}>Ngang</button></div>
              </section>
              <section>
                <label>Dòng kẻ</label>
                <div className="template-grid">
                  {PAPER_TEMPLATES.map((template) => <button key={template.id} className={activeNote.paper.template === template.id ? "selected" : ""} onClick={() => updatePaper({ template: template.id })}><span className={`template-preview template-${template.id}`} /><b>{template.label}</b></button>)}
                </div>
              </section>
              <section>
                <label>Màu giấy</label>
                <div className="paper-color-row">
                  {PAPER_COLORS.map((paperColor) => <button key={paperColor.id} className={activeNote.paper.color === paperColor.id ? "selected" : ""} onClick={() => updatePaper({ color: paperColor.id })} title={paperColor.label} aria-label={paperColor.label}><span style={{ background: paperColor.swatch }} />{activeNote.paper.color === paperColor.id && <Check size={13} />}</button>)}
                </div>
              </section>
            </div>
          )}

          <div className="note-stage workspace-frame">
            <article className={`note-paper interactive ${activeTool === "text" ? "typing" : ""} ${activeTool === "pointer" || activeTool === "text" || activeTool === "textbox" ? "object-mode" : ""} paper-${activeNote.paper.color} template-${activeNote.paper.template}`} style={paperStyle} onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".note-excerpt")) return;
              setSelectedExcerptId(null);
              if (!(event.target as HTMLElement).closest("[data-rich-editor-id]")) {
                activeTextEditorRef.current = null;
                savedTextRangeRef.current = null;
              }
              if (activeTool === "textbox") addTextBoxAt(event);
            }}>
              <div className="paper-background" />
              <div className={`typed-layer ${activeNote.excerpts.length ? "has-excerpts" : ""}`} style={textLayerStyle}>
                <input className="note-title-input" value={activeNote.title} onChange={(event) => updateActiveNote({ title: event.target.value })} readOnly={activeTool !== "text"} aria-label="Tiêu đề ghi chú" />
                <RichTextEditor editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />
                <div className="note-excerpts" aria-label="Khung chữ và ảnh trên trang note">
                  {activeNote.excerpts.map((excerpt, index) => {
                    const selected = excerpt.id === selectedExcerptId;
                    return <DraggableExcerpt key={excerpt.id} excerpt={excerpt} index={index} selected={selected} selectable={activeTool === "pointer" || activeTool === "text"} movable={activeTool === "pointer" && selected} editable={activeTool === "text" && selected && excerpt.kind === "text"} onSelect={setSelectedExcerptId} onMove={moveExcerpt} onEdit={editExcerpt} onTextActivate={activateTextEditor} onNormalizeTextInput={normalizeTextEditorInput} onOpenSource={openExcerptSource} onDelete={deleteExcerpt} />;
                  })}
                </div>
                {activeNote.citationPage && !activeNote.excerpts.length && <button className="citation-chip" onClick={() => { goToPage(activeNote.citationPage!); setToast(`Đã quay lại trang ${activeNote.citationPage}`); }}>Trang {activeNote.citationPage}</button>}
              </div>
              <InkCanvas key={activeNote.id} tool={activeTool} color={inkColor} width={activeTool === "highlight" ? highlighterWidth : inkWidth} penStyle={penStyle} shape={shapeKind} strokes={activeNote.strokes} onCommit={commitStrokes} />
              {activeTool === "text" && <div className="mode-hint">Nhập chữ hoặc sửa đoạn trích</div>}
              {activeTool === "textbox" && <div className="mode-hint">Bấm vị trí muốn đặt hộp chữ</div>}
              {activeTool === "pointer" && activeNote.excerpts.length > 0 && <div className="mode-hint">Kéo để di chuyển · kéo góc để đổi khung</div>}
            </article>
            <div className="paper-size">{selectedPaperSize.label} ({selectedPaperSize.dimensions}) · {activeNote.paper.orientation === "portrait" ? "Dọc" : "Ngang"} · {activeTool === "pointer" ? "Kéo khung để di chuyển, kéo góc dưới phải để đổi kích thước" : activeTool === "text" ? "Nhập nội dung trang hoặc sửa trực tiếp đoạn chữ từ PDF" : activeTool === "textbox" ? "Bấm trên trang để tạo hộp chữ" : activeTool === "lasso" ? "Khoanh quanh nét cần chọn" : activeTool === "eraser" ? "Lướt để tẩy đúng phần nét chạm vào" : "Dùng chuột hoặc bút cảm ứng để viết"}</div>
          </div>
        </section>

        <aside className="note-thumbnails" aria-label="Trang ghi chú">
          <div className="notes-heading"><select value={activeNotebook.id} onChange={(event) => updateActiveWorkspace((workspace) => ({ ...workspace, activeNotebookId: event.target.value }))} aria-label="Chọn sổ ghi chú">{activeWorkspace.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}</select><button className="round-delete" aria-label="Xóa sổ note" title="Xóa sổ note" onClick={() => { void deleteNotebook(); }}><Trash2 size={14} /></button><button className="round-add" aria-label="Thêm trang" onClick={addNotePage}><Plus size={18} /></button></div>
          {notePages.map((page, index) => {
            const paperColor = PAPER_COLORS.find((color) => color.id === page.paper.color)?.swatch;
            return <div className="note-thumb-wrap" key={page.id}><button className={`note-thumb ${page.id === activeNote.id ? "active" : ""}`} onClick={() => setActiveNoteId(page.id)}><span className={`mini-note template-${page.paper.template}`} style={{ backgroundColor: paperColor }}><strong>{page.title.slice(0, 15)}</strong><i /><i /><i /></span><b>{index + 1}</b></button>{page.id === activeNote.id && <button className="note-thumb-delete" aria-label={`Xóa trang ${index + 1}`} title="Xóa trang note" onClick={() => { void deleteNotePage(); }}><Trash2 size={13} /></button>}</div>;
          })}
          <button className="new-page" onClick={addNotePage} aria-label="Thêm trang" title="Thêm trang"><Plus size={19} /></button>
        </aside>
      </section>
    </main>
  );
}
