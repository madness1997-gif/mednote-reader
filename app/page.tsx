"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Blend,
  BookOpen,
  Bold,
  Bookmark,
  BookmarkCheck,
  BringToFront,
  Brush,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  CloudOff,
  Columns2,
  Copy,
  Crop,
  Download,
  DownloadCloud,
  Eraser,
  FileText,
  FolderOpen,
  Hand,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Lasso,
  Layers2,
  Languages,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  Menu,
  MessageSquareText,
  Minus,
  MousePointer2,
  Move,
  NotebookTabs,
  Omega,
  PaintBucket,
  PanelLeftOpen,
  PanelRightOpen,
  Pencil,
  PenLine,
  PenTool,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Rows3,
  ScanText,
  Search,
  Signature,
  SendToBack,
  Settings2,
  Shapes,
  Sigma,
  Square,
  Stamp,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextSelect,
  TextCursorInput,
  Type,
  Trash2,
  Underline,
  Undo2,
  UploadCloud,
  Volume2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LazyPdfPageView,
  PdfPageView,
  type PdfAnnotation,
  type PdfCropResult,
  type PdfFitMode,
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
import { createDriveBackup, stageDriveBackup, type DriveLibrary } from "./drive-backup";
import { resolveDocumentSource, type ResolvedDocumentSource } from "./note-document-source";
import {
  lookupEnglishVietnamese,
  oxfordLookupUrl,
  type EnglishVietnameseLookup,
} from "./dictionary";
import { loadPdfDocument } from "./pdf-document-loader";
import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";
import { localBinaryStorage } from "./local-binary-storage";
import { bootstrapMedNote, type BootstrapResult } from "./app-bootstrap";
import { persistentDocumentWorkspaces, saveDocumentRuntimeSnapshot } from "./document-runtime-storage";
import { requestNoteDestination, type NoteDestination } from "./mednote-dialog";
import NoteSidebar from "./note-sidebar";
import PageTitleEditor from "./page-title-editor";
import { noteStore, useNoteStoreSnapshot } from "./note-store";
import { ordered, type NoteStructure, type SheetContent, type SheetContentMap } from "./note-domain";
import {
  DEFAULT_CALLOUT_APPEARANCE, DEFAULT_NEW_NOTE_PAPER, DEFAULT_PAPER, DEFAULT_TEXT, DEFAULT_TEXT_BOX_APPEARANCE,
  FIRST_AID_TEMPLATE_HTML, FIRST_AID_TEMPLATE_TEXT, createBlankPage, defaultExcerptLayout, escapeHtml,
  normalizeCalloutSettings, normalizeExcerptAppearance, normalizeExcerptLayout, normalizePaper, normalizeText,
  notePageFromSheet, notePageToSheetContent, notebookFromStructure, plainTextToRichHtml, sanitizeRichTextHtml,
  type CalloutSettings, type ExcerptAppearance, type ExcerptLayout, type InkTool, type NoteExcerpt, type Notebook,
  type NotePage, type NotePageContentPatch, type PaperColor, type PaperOrientation, type PaperSettings, type PaperSize,
  type PaperTemplate, type PenStyle, type Point, type ShapeKind, type Stroke, type TableBorderStyle, type TextAlign,
  type TextFont, type TextSettings,
} from "./note-runtime-adapter";
import {
  DEFAULT_READER, createDemoWorkspace, createEmptyWorkspace, createReaderPlaceholder, documentRuntimeWorkspace,
  documentWorkspaceInput, isReaderPlaceholder, normalizeReader, normalizeWorkspace,
  workspacesFromLibraryV6, type LibraryDocument, type LinkedNoteTarget, type PersistedLibrary, type ReaderState,
  type WorkspaceItem, type WorkspaceMode,
} from "./document-runtime-adapter";

type Tool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";
type TextLineHeight = "1" | "1.15" | "1.5" | "1.8" | "2";
type BulletStyle = "none" | "disc" | "circle" | "square" | "diamond" | "arrow" | "check" | "dash";
type NumberingStyle = "decimal" | "decimal-leading-zero" | "lower-alpha" | "upper-alpha" | "lower-roman" | "upper-roman" | "lower-greek" | "cjk-decimal";
type TextToolbarState = TextSettings & {
  strike: boolean;
  subscript: boolean;
  superscript: boolean;
  unordered: boolean;
  ordered: boolean;
  backgroundColor: string;
  lineHeight: TextLineHeight;
  bulletStyle: BulletStyle;
  numberingStyle: NumberingStyle;
};
type TableBorderSettings = { style: TableBorderStyle; width: number; color: string };
type TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | null;
type EquationTemplate = "plain" | "fraction" | "root" | "power" | "subscript" | "sum" | "integral" | "matrix";
type FirstAidCropPlacement = { x: number; y: number; width: number };
type FirstAidCropTarget = { noteId: string; blockId: string; placement: FirstAidCropPlacement };
type FirstAidCropResult = { token: string; blockId: string; excerptId: string; imageName: string; aspectRatio: number };

type PdfOutlineEntry = { title: string; page: number | null; depth: number };
type PdfRailTab = "pages" | "outline" | "search" | "marks";
type NoteSheetViewMode = "single" | "continuous";
type NotePanel = "ink" | "shape" | "text" | "paper" | null;
type PdfPanel = "view" | "ink" | null;
type SearchResult = { documentId: string | null; documentName: string; page: number; snippet: string; occurrences: number };
type DictionaryLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  sourceText: string;
  result: EnglishVietnameseLookup | null;
  error: string | null;
};

type StrokeHistory = Record<string, { undo: Stroke[][]; redo: Stroke[][] }>;
type PdfHistory = Record<string, { undo: PdfAnnotation[][]; redo: PdfAnnotation[][] }>;

const DRIVE_MANIFEST_ID = "manifest:v2";
const DRIVE_LEGACY_MANIFEST_ID = "manifest:v1";
const GOOGLE_CLIENT_ID = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const DESKTOP_GOOGLE_CLIENT_ID_KEY = "mednote-google-desktop-client-id";
const IS_DESKTOP_APP = typeof window !== "undefined" && Boolean(window.mednoteDesktop?.isDesktop);
const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const NOTE_SHEET_VIEW_KEY = "mednote-note-sheet-view-v1";
const NOTE_ZOOM_PRESETS = [50, 60, 70, 75, 80, 85, 90, 100, 110, 120, 125, 130, 140, 150, 175, 200];

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
const TEXT_COLORS = ["#26343a", "#000000", "#c00000", "#ff0000", "#ed7d31", "#ffc000", "#70ad47", "#00b0f0", "#4472c4", "#7030a0", "#7f7f7f", "#ffffff"];
const TEXT_BACKGROUND_COLORS = ["transparent", "#fff2a8", "#ffe699", "#ccebf3", "#d8f1dc", "#f7d5dd", "#e4d8f3", "#d9e2f3", "#ffffff"];
const TEXT_BOX_BACKGROUND_COLORS = ["transparent", "#ffffff", "#fff2a8", "#d8f1dc", "#ccebf3", "#f7d5dd", "#e4d8f3"];
const BORDER_COLORS = ["transparent", "#60737d", "#111111", "#2465a8", "#c94b50", "#16836f"];
const TABLE_BORDER_STYLES: { id: TableBorderStyle; label: string }[] = [
  { id: "solid", label: "Nét liền" },
  { id: "dashed", label: "Nét gạch" },
  { id: "dotted", label: "Nét chấm" },
  { id: "double", label: "Nét đôi" },
];
const BULLET_STYLES: { id: BulletStyle; glyph: string; label: string }[] = [
  { id: "none", glyph: "∅", label: "Không dùng dấu đầu dòng" },
  { id: "disc", glyph: "●", label: "Chấm tròn đặc" },
  { id: "circle", glyph: "○", label: "Chấm tròn rỗng" },
  { id: "square", glyph: "▪", label: "Hình vuông" },
  { id: "diamond", glyph: "◆", label: "Hình thoi" },
  { id: "arrow", glyph: "➤", label: "Mũi tên" },
  { id: "check", glyph: "✓", label: "Dấu kiểm" },
  { id: "dash", glyph: "–", label: "Gạch ngang" },
];
const NUMBERING_STYLES: { id: NumberingStyle; sample: string; label: string }[] = [
  { id: "decimal", sample: "1.  2.  3.", label: "Số thường" },
  { id: "decimal-leading-zero", sample: "01.  02.  03.", label: "Số có số không đầu" },
  { id: "lower-alpha", sample: "a.  b.  c.", label: "Chữ thường" },
  { id: "upper-alpha", sample: "A.  B.  C.", label: "Chữ hoa" },
  { id: "lower-roman", sample: "i.  ii.  iii.", label: "La Mã thường" },
  { id: "upper-roman", sample: "I.  II.  III.", label: "La Mã hoa" },
  { id: "lower-greek", sample: "α.  β.  γ.", label: "Chữ Hy Lạp" },
  { id: "cjk-decimal", sample: "一.  二.  三.", label: "Số Hán" },
];
const LINE_PRESETS: { id: string; style: TableBorderStyle; width: number; label: string }[] = [
  { id: "none", style: "solid", width: 0, label: "Không đường kẻ" },
  { id: "hairline", style: "solid", width: 1, label: "Nét liền mảnh" },
  { id: "solid-medium", style: "solid", width: 2, label: "Nét liền vừa" },
  { id: "solid-heavy", style: "solid", width: 4, label: "Nét liền đậm" },
  { id: "dotted", style: "dotted", width: 2, label: "Nét chấm" },
  { id: "dotted-heavy", style: "dotted", width: 3, label: "Nét chấm đậm" },
  { id: "dashed", style: "dashed", width: 2, label: "Nét gạch" },
  { id: "dashed-heavy", style: "dashed", width: 3, label: "Nét gạch đậm" },
  { id: "double", style: "double", width: 3, label: "Nét đôi" },
  { id: "double-heavy", style: "double", width: 5, label: "Nét đôi đậm" },
];
const SYMBOL_GROUPS = [
  { label: "Toán", symbols: ["±", "×", "÷", "≈", "≠", "≤", "≥", "∞", "√", "∑", "∫", "∆"] },
  { label: "Hy Lạp", symbols: ["α", "β", "γ", "δ", "θ", "λ", "μ", "π", "σ", "φ", "Ω"] },
  { label: "Y học", symbols: ["°", "‰", "µ", "→", "←", "↔", "↑", "↓", "♂", "♀", "®", "©"] },
];
const EQUATION_PRESETS = ["x² + y² = z²", "eGFR = 142 × min(Scr/κ,1)ᵅ × max(Scr/κ,1)⁻¹·²⁰⁰ × 0.9938ᴬᵍᵉ", "BMI = kg/m²", "Δx/Δt", "μ ± σ"];
const EQUATION_TEMPLATES: { id: EquationTemplate; label: string; sample: string; fields: string[]; defaults: string[] }[] = [
  { id: "plain", label: "Tự nhập", sample: "x + y", fields: ["Công thức"], defaults: ["y = ax² + b"] },
  { id: "fraction", label: "Phân số", sample: "a⁄b", fields: ["Tử số", "Mẫu số"], defaults: ["a", "b"] },
  { id: "root", label: "Căn", sample: "ⁿ√x", fields: ["Biểu thức dưới căn", "Bậc căn (để trống = 2)"], defaults: ["x", ""] },
  { id: "power", label: "Lũy thừa", sample: "xⁿ", fields: ["Cơ số", "Số mũ"], defaults: ["x", "n"] },
  { id: "subscript", label: "Chỉ số dưới", sample: "xᵢ", fields: ["Ký hiệu", "Chỉ số"], defaults: ["x", "i"] },
  { id: "sum", label: "Tổng", sample: "∑", fields: ["Biểu thức", "Cận dưới", "Cận trên"], defaults: ["xᵢ", "i = 1", "n"] },
  { id: "integral", label: "Tích phân", sample: "∫", fields: ["Hàm số", "Cận dưới", "Cận trên", "Biến"], defaults: ["f(x)", "a", "b", "x"] },
  { id: "matrix", label: "Ma trận 2×2", sample: "[ ]", fields: ["Hàng 1 · cột 1", "Hàng 1 · cột 2", "Hàng 2 · cột 1", "Hàng 2 · cột 2"], defaults: ["a", "b", "c", "d"] },
];

function equationTemplateById(template: EquationTemplate) {
  return EQUATION_TEMPLATES.find((option) => option.id === template) ?? EQUATION_TEMPLATES[0];
}

function equationMarkup(template: EquationTemplate, parts: string[]) {
  const values = parts.map((part) => escapeHtml(part.trim() || "□"));
  const math = "font-family:Cambria Math,STIX Two Math,Times New Roman,serif;font-style:normal";
  if (template === "plain") return `<span style="${math}">${values[0] ?? ""}</span>`;
  if (template === "fraction") return `<span style="${math};display:inline-block;vertical-align:middle;text-align:center;line-height:1.05;white-space:nowrap"><span style="display:block;padding:0 4px;border-bottom:1px solid currentColor">${values[0]}</span><span style="display:block;padding:0 4px">${values[1]}</span></span>`;
  if (template === "root") return `<span style="${math};white-space:nowrap">${parts[1]?.trim() ? `<sup>${values[1]}</sup>` : ""}√<span style="border-top:1px solid currentColor;padding:0 2px">${values[0]}</span></span>`;
  if (template === "power") return `<span style="${math};white-space:nowrap">${values[0]}<sup>${values[1]}</sup></span>`;
  if (template === "subscript") return `<span style="${math};white-space:nowrap">${values[0]}<sub>${values[1]}</sub></span>`;
  if (template === "sum") return `<span style="${math};white-space:nowrap">∑<sub>${values[1]}</sub><sup>${values[2]}</sup>&nbsp;${values[0]}</span>`;
  if (template === "integral") return `<span style="${math};white-space:nowrap">∫<sub>${values[1]}</sub><sup>${values[2]}</sup>&nbsp;${values[0]} d${values[3]}</span>`;
  return `<span style="${math};display:inline-flex;align-items:center;vertical-align:middle;white-space:nowrap"><b>[</b><span style="display:inline-grid;grid-template-columns:auto auto;column-gap:10px;row-gap:2px;margin:0 4px;text-align:center"><span>${values[0]}</span><span>${values[1]}</span><span>${values[2]}</span><span>${values[3]}</span></span><b>]</b></span>`;
}

function pdfAnnotationLabel(annotation: PdfAnnotation) {
  const labels: Record<PdfAnnotation["kind"], string> = {
    highlight: "Tô sáng",
    "area-highlight": "Tô vùng",
    underline: "Gạch chân",
    strikeout: "Gạch ngang",
    squiggly: "Lượn sóng",
    ink: "Nét bút",
    note: "Ghi chú",
    text: "Chữ",
    rectangle: "Chữ nhật",
    ellipse: "Elip",
    arrow: "Mũi tên",
    stamp: "Con dấu",
    signature: "Chữ ký",
  };
  return labels[annotation.kind];
}

function pdfAnnotationSummary(annotation: PdfAnnotation) {
  if (annotation.kind === "ink") return `${annotation.points.length} điểm bút`;
  if ("text" in annotation && annotation.text) return annotation.text;
  return pdfAnnotationLabel(annotation);
}

function cssColorToHex(color: string) {
  if (color.startsWith("#")) return color;
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return "#111111";
  return `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb01(color: string) {
  const hex = cssColorToHex(color).replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((character) => character + character).join("") : hex.padEnd(6, "0").slice(0, 6);
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    green: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    blue: Number.parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

function standardPdfText(value: string) {
  return value
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
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
  if (value === "none") return "none";
  if (value === "circle" || value === "square") return value;
  if (value.includes("◆")) return "diamond";
  if (value.includes("➤")) return "arrow";
  if (value.includes("✓")) return "check";
  if (value.includes("–") || value.includes("-") || value === "none") return "dash";
  return "disc";
}

function normalizedNumberingStyle(value: string): NumberingStyle {
  if (value === "decimal-leading-zero" || value === "lower-alpha" || value === "upper-alpha" || value === "lower-roman" || value === "upper-roman" || value === "lower-greek" || value === "cjk-decimal") return value;
  return "decimal";
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
  const orderedList = closestWithin<HTMLOListElement>(anchor, "ol", editor);
  return {
    font: textFontFromFamily(style.fontFamily),
    size: Math.max(8, Math.min(96, Math.round(Number.parseFloat(style.fontSize) || DEFAULT_TEXT.size))),
    color: cssColorToHex(style.color),
    bold: document.queryCommandState("bold") || weight >= 600 || style.fontWeight === "bold",
    italic: document.queryCommandState("italic") || style.fontStyle === "italic",
    underline: document.queryCommandState("underline") || style.textDecorationLine.includes("underline"),
    align,
    strike: document.queryCommandState("strikeThrough") || style.textDecorationLine.includes("line-through"),
    subscript: document.queryCommandState("subscript") || style.verticalAlign === "sub",
    superscript: document.queryCommandState("superscript") || style.verticalAlign === "super",
    unordered: document.queryCommandState("insertUnorderedList"),
    ordered: document.queryCommandState("insertOrderedList"),
    backgroundColor: cssBackgroundColor(style.backgroundColor),
    lineHeight: normalizedLineHeight(style),
    bulletStyle: normalizedBulletStyle(list ? window.getComputedStyle(list).listStyleType : "disc"),
    numberingStyle: normalizedNumberingStyle(orderedList ? window.getComputedStyle(orderedList).listStyleType : "decimal"),
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
  { id: "callout", label: "Callout — hộp chú thích có mũi tên", icon: MessageSquareText },
];

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

function boundingPdfRect(rects: PdfRect[]): PdfRect | undefined {
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

function notePagePresentation(page: NotePage, zoom: number) {
  const selectedSize = PAPER_SIZES[page.paper.size];
  const width = page.paper.orientation === "portrait" ? selectedSize.width : selectedSize.height;
  const height = page.paper.orientation === "portrait" ? selectedSize.height : selectedSize.width;
  const maxWidth = page.paper.orientation === "portrait" ? selectedSize.maxWidth : Math.min(920, selectedSize.maxWidth * 1.32);
  const lineStep = page.paper.template === "ruled-dense" ? 5 : 8;
  const font = TEXT_FONTS.find((option) => option.id === page.text.font) ?? TEXT_FONTS[0];
  return {
    selectedSize,
    width,
    height,
    maxWidth,
    paperStyle: {
      "--paper-ratio": `${width} / ${height}`,
      "--paper-max-width": `${maxWidth}px`,
      "--note-view-zoom": zoom,
      "--paper-line-step": `${(lineStep / height) * 100}%`,
      "--paper-cell-x": `${(8 / width) * 100}%`,
      "--paper-cell-y": `${(8 / height) * 100}%`,
      "--cornell-header": `${(40 / height) * 100}%`,
    } as React.CSSProperties,
    textLayerStyle: {
      "--text-font": font.family,
      "--text-size": `${page.text.size}px`,
      "--text-color": page.text.color === "auto" ? "var(--paper-ink)" : page.text.color,
      "--text-weight": page.text.bold ? 700 : 400,
      "--text-style": page.text.italic ? "italic" : "normal",
      "--text-decoration": page.text.underline ? "underline" : "none",
      "--text-align": page.text.align,
    } as React.CSSProperties,
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
  singleLine?: boolean;
  onChange: (html: string, text: string) => void;
  onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeInput: (editorId: string, editor: HTMLElement) => void;
};

function RichTextEditor({ editorId, className, html, editable, placeholder, ariaLabel, autoFocus = false, singleLine = false, onChange, onActivate, onNormalizeInput }: RichTextEditorProps) {
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
      aria-multiline={!singleLine}
      aria-label={ariaLabel}
      spellCheck={false}
      onFocus={captureSelection}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      onKeyDown={(event) => {
        if (singleLine && event.key === "Enter") event.preventDefault();
      }}
      onInput={emitChange}
      onPaste={(event) => {
        if (!editable) return;
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, singleLine ? text.replace(/\s*\r?\n\s*/g, " ") : text);
      }}
      onDrop={(event) => {
        if (!editable) return;
        event.preventDefault();
        const text = event.dataTransfer.getData("text/plain");
        document.execCommand("insertText", false, singleLine ? text.replace(/\s*\r?\n\s*/g, " ") : text);
      }}
    />
  );
}

function StoredAssetImage({ assetId, alt }: { assetId: string; alt: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    void localBinaryStorage.readAsset(assetId).then((blob) => {
      if (!blob || disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  return source ? <img src={source} alt={alt} draggable={false} /> : <span className="excerpt-image-loading">Đang mở ảnh…</span>;
}

type DraggableExcerptProps = {
  excerpt: NoteExcerpt;
  source: ResolvedDocumentSource<PdfRect> | null;
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

function DraggableExcerpt({ excerpt, source, index, selected, selectable, movable, editable, onSelect, onMove, onEdit, onTextActivate, onNormalizeTextInput, onOpenSource, onDelete }: DraggableExcerptProps) {
  const articleRef = useRef<HTMLElement>(null);
  const savedLayout = normalizeExcerptLayout(excerpt.layout, index, excerpt.kind);
  const isCallout = excerpt.annotationKind === "callout";
  const appearance = excerpt.kind === "text" ? normalizeExcerptAppearance(excerpt.appearance ?? (isCallout ? DEFAULT_CALLOUT_APPEARANCE : undefined), isCallout) : null;
  const savedCallout = isCallout ? normalizeCalloutSettings(excerpt.callout, savedLayout) : null;
  const [layout, setLayout] = useState(savedLayout);
  const [calloutAnchor, setCalloutAnchor] = useState(savedCallout);
  const interactionRef = useRef<{
    mode: "move" | "resize" | "rotate" | "anchor";
    pointerId: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    origin: ExcerptLayout;
    hostWidth: number;
    hostHeight: number;
    moved: boolean;
    current: ExcerptLayout;
    originAnchor: CalloutSettings | null;
    currentAnchor: CalloutSettings | null;
  } | null>(null);

  useEffect(() => {
    if (!interactionRef.current) setLayout(savedLayout);
  }, [savedLayout.aspectRatio, savedLayout.autoFit, savedLayout.contentScale, savedLayout.height, savedLayout.opacity, savedLayout.rotation, savedLayout.width, savedLayout.x, savedLayout.y]);

  useEffect(() => {
    if (!interactionRef.current) setCalloutAnchor(savedCallout);
  }, [savedCallout?.anchorX, savedCallout?.anchorY]);

  const startInteraction = (event: React.PointerEvent<HTMLElement>, mode: "move" | "resize" | "rotate" | "anchor") => {
    if (!movable) return;
    const host = articleRef.current?.parentElement;
    const article = articleRef.current;
    if (!host || !article) return;
    const rect = host.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    const centerX = articleRect.left + articleRect.width / 2;
    const centerY = articleRect.top + articleRect.height / 2;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
      origin: layout,
      hostWidth: Math.max(1, rect.width),
      hostHeight: Math.max(1, rect.height),
      moved: false,
      current: layout,
      originAnchor: calloutAnchor,
      currentAnchor: calloutAnchor,
    };
  };

  const updateInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - state.startX) / state.hostWidth;
    const dy = (event.clientY - state.startY) / state.hostHeight;
    if (state.mode === "anchor" && state.originAnchor) {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.currentAnchor = {
        anchorX: Math.min(1, Math.max(0, state.originAnchor.anchorX + dx)),
        anchorY: Math.min(1, Math.max(0, state.originAnchor.anchorY + dy)),
      };
      setCalloutAnchor(state.currentAnchor);
    } else if (state.mode === "rotate") {
      const angle = Math.atan2(event.clientY - state.centerY, event.clientX - state.centerX) * 180 / Math.PI;
      const delta = angle - state.startAngle;
      if (Math.abs(delta) > .5) state.moved = true;
      state.current = {
        ...state.origin,
        rotation: Math.round((((state.origin.rotation + delta + 180) % 360) + 360) % 360 - 180),
      };
    } else if (state.mode === "move") {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.current = {
          ...state.origin,
          x: Math.min(1 - state.origin.width, Math.max(0, state.origin.x + dx)),
          y: Math.min(1 - state.origin.height, Math.max(0, state.origin.y + dy)),
      };
    } else if (state.origin.aspectRatio) {
      const widthFromX = state.origin.width + dx;
      const widthFromY = state.origin.width + dy * state.hostHeight * state.origin.aspectRatio / state.hostWidth;
      const requestedWidth = Math.abs(widthFromX - state.origin.width) >= Math.abs(widthFromY - state.origin.width) ? widthFromX : widthFromY;
      const maxWidthForHeight = (1 - state.origin.y) * state.origin.aspectRatio * state.hostHeight / state.hostWidth;
      const width = Math.min(1 - state.origin.x, maxWidthForHeight, Math.max(.06, requestedWidth));
      const height = width * state.hostWidth / (state.origin.aspectRatio * state.hostHeight);
      if (Math.abs(width - state.origin.width) > .002) state.moved = true;
      state.current = { ...state.origin, width, height };
    } else {
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) state.moved = true;
      state.current = {
          ...state.origin,
          width: Math.min(1 - state.origin.x, Math.max(.025, state.origin.width + dx)),
          height: Math.min(1 - state.origin.y, Math.max(.018, state.origin.height + dy)),
          autoFit: false,
      };
    }
    setLayout(state.current);
  };

  const finishInteraction = (event: React.PointerEvent<HTMLElement>) => {
    const state = interactionRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    if (!state.moved) return;
    if (state.mode === "anchor" && state.currentAnchor) onEdit(excerpt.id, { callout: state.currentAnchor });
    else onMove(excerpt.id, state.current);
  };

  const changeContentScale = (step: number) => {
    const next = { ...layout, contentScale: Math.min(2.4, Math.max(.65, Number((layout.contentScale + step).toFixed(2)))) };
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const changeOpacity = (opacity: number) => {
    const next = { ...layout, opacity: Math.min(1, Math.max(.1, opacity)) };
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const rotateBy = (degrees: number) => {
    const rotation = (((layout.rotation + degrees + 180) % 360) + 360) % 360 - 180;
    const next = { ...layout, rotation };
    setLayout(next);
    onMove(excerpt.id, next);
  };

  const fitTextBoxToContent = (keepAutoFit = true) => {
    const article = articleRef.current;
    const host = article?.parentElement;
    const editor = article?.querySelector<HTMLElement>(".excerpt-rich-editor");
    if (!article || !host || !editor) return;
    const hostRect = host.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const probe = editor.cloneNode(true) as HTMLElement;
    probe.removeAttribute("data-rich-editor-id");
    probe.removeAttribute("contenteditable");
    probe.classList.add("excerpt-fit-probe");
    article.appendChild(probe);
    probe.style.maxWidth = `${hostRect.width * .86}px`;
    const measured = probe.getBoundingClientRect();
    probe.remove();
    const width = Math.min(1 - layout.x, Math.max(.025, (measured.width + 18) / hostRect.width));
    const height = Math.min(1 - layout.y, Math.max(.018, (measured.height + 16) / hostRect.height));
    const next = { ...layout, width, height, autoFit: keepAutoFit };
    setLayout(next);
    onEdit(excerpt.id, { layout: next });
  };

  useEffect(() => {
    if (excerpt.kind !== "text" || !savedLayout.autoFit || !(excerpt.text ?? "").trim()) return;
    const frame = window.requestAnimationFrame(() => fitTextBoxToContent(true));
    return () => window.cancelAnimationFrame(frame);
    // Refit only when the saved text changes; layout updates are the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excerpt.richText, excerpt.text, savedLayout.autoFit]);

  const calloutTargetX = calloutAnchor ? (calloutAnchor.anchorX - layout.x) / layout.width * 100 : 50;
  const calloutTargetY = calloutAnchor ? (calloutAnchor.anchorY - layout.y) / layout.height * 100 : 50;
  const calloutDeltaX = calloutTargetX - 50;
  const calloutDeltaY = calloutTargetY - 50;
  const calloutEdgeRatio = Math.max(Math.abs(calloutDeltaX) / 50, Math.abs(calloutDeltaY) / 50);
  const calloutStartX = calloutEdgeRatio > 1 ? 50 + calloutDeltaX / calloutEdgeRatio : 50;
  const calloutStartY = calloutEdgeRatio > 1 ? 50 + calloutDeltaY / calloutEdgeRatio : 50;
  const calloutLineColor = appearance?.borderColor && appearance.borderColor !== "transparent" ? appearance.borderColor : "#1b7184";
  const sourceTitle = source
    ? source.available
      ? `Nguồn: ${source.displayName}${source.page ? ` · trang ${source.page}` : ""}. Nhấp đúp để quay lại PDF`
      : `Nguồn PDF không còn trong thư viện: ${source.displayName}`
    : undefined;
  const imageSourceName = source?.displayName ?? (excerpt.sourceKind === "manual" ? excerpt.documentName ?? "Hình ảnh" : "PDF");

  return (
    <article
      ref={articleRef}
      className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}
      style={{
        left: `${layout.x * 100}%`,
        top: `${layout.y * 100}%`,
        width: `${layout.width * 100}%`,
        height: `${layout.height * 100}%`,
        zIndex: index + 1,
        transform: `rotate(${layout.rotation}deg)`,
        "--excerpt-content-scale": layout.contentScale,
        "--excerpt-border-style": appearance?.borderStyle,
        "--excerpt-border-width": appearance ? `${appearance.borderWidth}px` : undefined,
        "--excerpt-border-color": appearance?.borderColor,
        "--excerpt-background": appearance?.backgroundColor,
        "--callout-line-color": calloutLineColor,
        "--callout-line-width": `${Math.max(1.5, appearance?.borderWidth ?? 1.5)}px`,
      } as React.CSSProperties}
      onPointerDown={(event) => {
        if (!selectable) return;
        event.stopPropagation();
        onSelect(excerpt.id);
        if (excerpt.kind === "image" && movable && !(event.target as HTMLElement).closest("button,input")) startInteraction(event, "move");
      }}
      onPointerMove={updateInteraction}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onDoubleClick={(event) => {
        if (!source?.available || !source.documentId || !source.page) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenSource(excerpt);
      }}
      title={sourceTitle}
      aria-selected={selected}
    >
      {isCallout && calloutAnchor && <svg className="callout-leader" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={`callout-arrow-${excerpt.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={calloutLineColor} /></marker></defs>
        <line x1={calloutStartX} y1={calloutStartY} x2={calloutTargetX} y2={calloutTargetY} markerEnd={`url(#callout-arrow-${excerpt.id})`} />
      </svg>}
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
          {excerpt.kind === "text" && <span className="excerpt-scale-controls" aria-label="Kích thước nội dung">
            <button onClick={() => changeContentScale(-.12)} disabled={!movable || layout.contentScale <= .65} title="Thu nhỏ nội dung" aria-label="Thu nhỏ nội dung"><Minus size={12} /></button>
            <b>{Math.round(layout.contentScale * 100)}%</b>
            <button onClick={() => changeContentScale(.12)} disabled={!movable || layout.contentScale >= 2.4} title="Phóng to nội dung" aria-label="Phóng to nội dung"><Plus size={12} /></button>
          </span>}
          {excerpt.kind === "text" && <button className={`excerpt-fit-control ${layout.autoFit ? "active" : ""}`} onClick={() => fitTextBoxToContent(true)} title="Ôm sát nội dung và tự co giãn khi nhập" aria-label="Cho hộp chữ ôm sát nội dung">Ôm chữ</button>}
          {excerpt.kind === "image" && <span className="excerpt-opacity-controls" aria-label="Độ trong suốt của ảnh">
            <Blend size={12} />
            <input type="range" min=".1" max="1" step=".05" value={layout.opacity} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => changeOpacity(Number(event.target.value))} aria-label="Độ trong suốt của ảnh" />
            <b>{Math.round(layout.opacity * 100)}%</b>
          </span>}
          {excerpt.kind === "image" && <span className="excerpt-rotation-controls" aria-label="Xoay ảnh">
            <button onClick={() => rotateBy(-15)} title="Xoay trái 15°" aria-label="Xoay trái 15 độ"><RotateCcw size={12} /></button>
            <b>{Math.round(layout.rotation)}°</b>
            <button onClick={() => rotateBy(15)} title="Xoay phải 15°" aria-label="Xoay phải 15 độ"><RotateCw size={12} /></button>
          </span>}
          {excerpt.kind === "text" && <span className="excerpt-edit-indicator"><Pencil size={11} />{editable ? "Đang sửa" : isCallout ? "Callout" : "Chữ"}</span>}
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
            placeholder={isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}
            ariaLabel={isCallout ? "Nội dung callout" : excerpt.sourceKind === "manual" ? "Nội dung hộp chữ" : "Nội dung đoạn chữ đưa từ PDF"}
            onChange={(richText, text) => onEdit(excerpt.id, { richText, text })}
            onActivate={onTextActivate}
            onNormalizeInput={onNormalizeTextInput}
          />
        ) : excerpt.assetId ? (
          <div className="excerpt-image-viewport" style={{ opacity: layout.opacity }}><div style={{ transform: `scale(${layout.contentScale})` }}><StoredAssetImage assetId={excerpt.assetId} alt={`Hình từ ${imageSourceName}, trang ${source?.page ?? excerpt.page ?? 1}${source && !source.available ? ", nguồn không còn trong thư viện" : ""}`} /></div></div>
        ) : <span>Không tìm thấy ảnh</span>}
      </div>
      {selected && movable && isCallout && calloutAnchor && <button
        className="callout-anchor-handle"
        style={{ left: `${calloutTargetX}%`, top: `${calloutTargetY}%` }}
        onPointerDown={(event) => startInteraction(event, "anchor")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo đầu mũi tên callout"
        title="Kéo để đổi điểm mà callout chỉ tới"
      ><Move size={11} /></button>}
      {selected && movable && excerpt.kind === "image" && <button
        className="excerpt-rotate-handle"
        onPointerDown={(event) => startInteraction(event, "rotate")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Kéo để xoay ảnh"
        title="Kéo để xoay ảnh"
      ><RotateCw size={13} /></button>}
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

function NoteSheetPreview({
  note,
  sheetNumber,
  zoom,
  loaded,
  onActivate,
  resolveSource,
}: {
  note: NotePage;
  sheetNumber: number;
  zoom: number;
  loaded: boolean;
  onActivate: () => void;
  resolveSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;
}) {
  const presentation = notePagePresentation(note, zoom);
  return (
    <section className="note-sheet-frame note-sheet-frame-inactive" data-note-sheet-frame={note.id} style={presentation.paperStyle}>
      <header className="note-sheet-frame-header">
        <span>Tờ {sheetNumber}</span>
        <button type="button" onClick={onActivate} aria-label={`Chỉnh sửa tờ ${sheetNumber}`}>Chỉnh sửa tờ này</button>
      </header>
      <article
        data-note-page-id={note.id}
        className={`note-paper note-paper-preview paper-${note.paper.color} template-${note.paper.template}`}
        style={presentation.paperStyle}
        aria-label={`Bản xem trước tờ ${sheetNumber}`}
      >
        <div className="paper-background" />
        {loaded ? <>
          <div className={`typed-layer ${note.excerpts.length ? "has-excerpts" : ""}`} style={presentation.textLayerStyle}>
            <div className="note-title-input">{note.title}</div>
            <div className="note-editor rich-text-editor" dangerouslySetInnerHTML={{ __html: note.bodyHtml ?? plainTextToRichHtml(note.body) }} />
            <div className="note-excerpts" aria-hidden="true">
              {note.excerpts.map((excerpt, index) => <DraggableExcerpt
                key={excerpt.id}
                excerpt={excerpt}
                source={resolveSource(excerpt)}
                index={index}
                selected={false}
                selectable={false}
                movable={false}
                editable={false}
                onSelect={() => undefined}
                onMove={() => undefined}
                onEdit={() => undefined}
                onTextActivate={() => undefined}
                onNormalizeTextInput={() => undefined}
                onOpenSource={() => undefined}
                onDelete={() => undefined}
              />)}
            </div>
          </div>
          <InkCanvas tool="pointer" color="#2465a8" width={2} penStyle="ballpoint" shape="rectangle" strokes={note.strokes} onCommit={() => undefined} />
        </> : <div className="note-sheet-preview-loading" role="status">Đang tải nội dung tờ…</div>}
      </article>
      <div className="paper-size">{presentation.selectedSize.label} ({presentation.selectedSize.dimensions}) · {note.paper.orientation === "portrait" ? "Dọc" : "Ngang"}</div>
    </section>
  );
}

export default function Home() {
  const noteState = useNoteStoreSnapshot();
  const previewPdfInputRef = useRef<HTMLInputElement>(null);
  const libraryPdfInputRef = useRef<HTMLInputElement>(null);
  const temporaryPdfBlobsRef = useRef(new Map<string, Blob>());
  const workspaceRef = useRef<HTMLElement>(null);
  const documentStageRef = useRef<HTMLDivElement>(null);
  const noteStageRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pointer");
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState("#2465a8");
  const [pdfHighlightColor, setPdfHighlightColor] = useState("#f6d96b");
  const [inkWidth, setInkWidth] = useState(2);
  const [highlighterWidth, setHighlighterWidth] = useState(14);
  const [penStyle, setPenStyle] = useState<PenStyle>("ballpoint");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [demoReader, setDemoReader] = useState<ReaderState>({ ...DEFAULT_READER, page: 126 });
  const [pdfTool, setPdfTool] = useState<PdfTool>("smart");
  const [pdfTextDraft, setPdfTextDraft] = useState("Ghi chú");
  const [pdfStampDraft, setPdfStampDraft] = useState("ĐÃ XEM");
  const [pdfSignatureDraft, setPdfSignatureDraft] = useState("Ký tên");
  const [pdfHistory, setPdfHistory] = useState<PdfHistory>({});
  const [pdfSelection, setPdfSelection] = useState<PdfSelection | null>(null);
  const [firstAidCropTarget, setFirstAidCropTarget] = useState<FirstAidCropTarget | null>(null);
  const [firstAidCropResult, setFirstAidCropResult] = useState<FirstAidCropResult | null>(null);
  const [dictionaryLookup, setDictionaryLookup] = useState<DictionaryLookupState>({ status: "idle", sourceText: "", result: null, error: null });
  const dictionaryAbortRef = useRef<AbortController | null>(null);
  const [pdfRailTab, setPdfRailTab] = useState<PdfRailTab>("outline");
  const [outline, setOutline] = useState<PdfOutlineEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [searchWholeCollection, setSearchWholeCollection] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
  const workspaceModeRef = useRef<WorkspaceMode>(workspaceMode);
  const [sourceFocus, setSourceFocus] = useState<{ documentId: string; page: number; rect: PdfRect } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createDemoWorkspace(initialPages)]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("demo-workspace");
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const [strokeHistory, setStrokeHistory] = useState<StrokeHistory>({});
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string } | null>(null);
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
  const readyRef = useRef(ready);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [renamingWorkspaceName, setRenamingWorkspaceName] = useState("");
  const [showPdfRail, setShowPdfRail] = useState(true);
  const [showNoteSidebar, setShowNoteSidebar] = useState(() => {
    try { return localStorage.getItem("mednote-note-sidebar-v6-hidden") !== "1"; } catch { return true; }
  });
  const [notePanel, setNotePanel] = useState<NotePanel>(null);
  const [textToolbar, setTextToolbar] = useState<TextToolbarState>({ ...DEFAULT_TEXT, strike: false, subscript: false, superscript: false, unordered: false, ordered: false, backgroundColor: "transparent", lineHeight: "1.8", bulletStyle: "disc", numberingStyle: "decimal" });
  const [textInsertPopover, setTextInsertPopover] = useState<TextInsertPopover>(null);
  const [textPopoverLeft, setTextPopoverLeft] = useState(12);
  const [equationDraft, setEquationDraft] = useState("y = ax² + b");
  const [equationTemplate, setEquationTemplate] = useState<EquationTemplate>("fraction");
  const [equationParts, setEquationParts] = useState(() => [...equationTemplateById("fraction").defaults]);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableBorder, setTableBorder] = useState<TableBorderSettings>({ style: "solid", width: 1, color: "#60737d" });
  const activeTextEditorRef = useRef<{ id: string; editor: HTMLElement } | null>(null);
  const savedTextRangeRef = useRef<Range | null>(null);
  const pendingFontSizeRef = useRef(new Map<string, number>());
  const textCharacterToolbarRef = useRef<HTMLDivElement | null>(null);
  const textParagraphToolbarRef = useRef<HTMLDivElement | null>(null);
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

  workspacesRef.current = workspaces;
  activeWorkspaceIdRef.current = activeWorkspaceId;
  workspaceModeRef.current = workspaceMode;
  readyRef.current = ready;
  const localSavedAtRef = useRef(Date.now());
  const driveSyncingRef = useRef(false);

  useEffect(() => {
    if (notePanel !== "text") setTextInsertPopover(null);
  }, [notePanel]);

  const openTextPopover = useCallback((popover: Exclude<TextInsertPopover, null>, button: HTMLElement) => {
    const pane = button.closest<HTMLElement>(".notes-pane");
    if (pane) {
      const paneRect = pane.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const popoverWidth = popover === "bullets" || popover === "tableLines" ? 276 : popover === "numbering" ? 322 : popover === "equation" ? 520 : 360;
      setTextPopoverLeft(Math.max(8, Math.min(buttonRect.left - paneRect.left, paneRect.width - popoverWidth - 8)));
    }
    setTextInsertPopover((current) => current === popover ? null : popover);
  }, []);

  const scrollTextToolbar = useCallback((toolbar: HTMLDivElement | null, direction: -1 | 1) => {
    toolbar?.scrollBy({ left: direction * Math.max(180, toolbar.clientWidth * .72), behavior: "smooth" });
  }, []);

  const scrollTextToolbarWithWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const toolbar = event.currentTarget;
    if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    toolbar.scrollLeft += event.deltaY;
    event.preventDefault();
  }, []);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const legacyActiveNotebook = activeWorkspace.notebooks.find((notebook) => notebook.id === activeWorkspace.activeNotebookId) ?? activeWorkspace.notebooks[0];
  const storeActiveNotebook = noteState.structure
    ? notebookFromStructure(noteState.structure, noteState.structure.active.activeNotebookId, noteState.pageSheetContents, noteState.activeSheetContent)
    : null;
  const activeNotebook = storeActiveNotebook || legacyActiveNotebook;
  const notePages = activeNotebook.pages;
  const activeNote = notePages.find((page) => page.id === activeNotebook.activePageId) ?? notePages[0];
  const activeNoteHydrating = noteState.hydratingSheetId === activeNote.id || activeNote.__mednoteLazyPage === true;
  const activeLogicalPage = noteState.structure?.pages.find((page) => page.id === noteState.structure?.active.activePageId);
  const activePageSheets = noteState.structure
    ? ordered(noteState.structure.sheets.filter((sheet) => sheet.pageId === noteState.structure?.active.activePageId))
    : [];
  const activePageSheetKey = activePageSheets.map((sheet) => sheet.id).join("|");
  const activeSheetIndex = Math.max(0, activePageSheets.findIndex((sheet) => sheet.id === activeNote.id));
  const continuousNotes = activePageSheets.map((sheet) => notePages.find((page) => page.id === sheet.id)
    || notePageFromSheet(sheet.id, activeLogicalPage?.title || "Page mới", noteState.pageSheetContents[sheet.id], !noteState.pageSheetContents[sheet.id]));
  const hasActiveNote = Boolean(noteState.structure?.active.activeSheetId)
    && (activeWorkspace.kind === "empty" || activeWorkspace.kind === "demo"
      || Boolean(activeWorkspace.noteNotebookId && noteState.structure?.notebooks.some((notebook) => notebook.id === activeWorkspace.noteNotebookId)));
  const selectedExcerptIndex = activeNote.excerpts.findIndex((excerpt) => excerpt.id === selectedExcerptId);
  const selectedExcerpt = selectedExcerptIndex >= 0 ? activeNote.excerpts[selectedExcerptIndex] : null;
  const selectedTextBoxAppearance = selectedExcerpt?.kind === "text" ? normalizeExcerptAppearance(selectedExcerpt.appearance) : null;
  const activeDocument = activeWorkspace.documents.find((document) => document.id === activeWorkspace.activeDocumentId) ?? activeWorkspace.documents[0] ?? null;
  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;
  const resolveExcerptSource = useCallback((excerpt: NoteExcerpt) => resolveDocumentSource(excerpt, noteState.documents, activeWorkspace.documents), [activeWorkspace.documents, noteState.documents]);

  useEffect(() => {
    const notebookId = activeWorkspace.noteNotebookId;
    const structure = noteStore.getSnapshot().structure;
    if (!notebookId || !structure?.notebooks.some((notebook) => notebook.id === notebookId)
      || structure.active.activeNotebookId === notebookId) return;
    void noteStore.openNotebook(notebookId).catch(() => undefined);
  }, [activeWorkspace.id, activeWorkspace.noteNotebookId, noteState.status]);

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

  const applyTextCommand = useCallback((command: "font" | "size" | "color" | "background" | "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript" | "left" | "center" | "right" | "justify" | "bullets" | "numbering" | "clear", value?: string | number) => {
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
        subscript: "subscript",
        superscript: "superscript",
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
    if (bulletStyle === "none" && lists.length) {
      document.execCommand("insertUnorderedList", false);
      finishTextCommand(target, "Đã bỏ dấu đầu dòng");
      setTextInsertPopover(null);
      return;
    }
    if (bulletStyle === "none") {
      setTextInsertPopover(null);
      return;
    }
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
    const listStyleType = {
      disc: "disc",
      circle: "circle",
      square: "square",
      diamond: '"◆  "',
      arrow: '"➤  "',
      check: '"✓  "',
      dash: '"–  "',
      none: "none",
    }[bulletStyle];
    lists.forEach((list) => { list.style.listStyleType = listStyleType; });
    finishTextCommand(target, "Đã đổi kiểu dấu đầu dòng");
    setTextInsertPopover(null);
  }, [finishTextCommand, restoreTextSelection]);

  const applyNumberingStyle = useCallback((numberingStyle: NumberingStyle) => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào đoạn văn trước khi tạo danh sách");
      return;
    }
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let lists = range ? [closestWithin<HTMLOListElement>(range.startContainer, "ol", target.editor)].filter(Boolean) as HTMLOListElement[] : [];
    if (!lists.length) {
      document.execCommand("insertOrderedList", false);
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const list = range ? closestWithin<HTMLOListElement>(range.startContainer, "ol", target.editor) : null;
      if (list) lists = [list];
    }
    if (range) {
      target.editor.querySelectorAll<HTMLOListElement>("ol").forEach((list) => {
        try { if (range!.intersectsNode(list) && !lists.includes(list)) lists.push(list); } catch { /* ignore detached nodes */ }
      });
    }
    lists.forEach((list) => { list.style.listStyleType = numberingStyle; });
    finishTextCommand(target, "Đã đổi kiểu đánh số");
    setTextInsertPopover(null);
  }, [finishTextCommand, restoreTextSelection]);

  const changeListLevel = useCallback((direction: "increase" | "decrease") => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào một mục trong danh sách trước");
      return;
    }
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const listItem = range ? closestWithin<HTMLLIElement>(range.startContainer, "li", target.editor) : null;
    if (!listItem) {
      setToast("Nút này chỉ dùng cho bullet hoặc numbering");
      return;
    }
    document.execCommand(direction === "increase" ? "indent" : "outdent", false);
    finishTextCommand(target, direction === "increase" ? "Đã tăng một cấp danh sách" : "Đã giảm một cấp danh sách");
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

  const insertEquation = useCallback(() => {
    const target = restoreTextSelection();
    const parts = equationTemplate === "plain" ? [equationDraft] : equationParts;
    if (!target || !parts.some((part) => part.trim())) {
      setToast(target ? "Nhập công thức trước khi chèn" : "Bấm vào vị trí cần chèn công thức trước");
      return;
    }
    document.execCommand("insertHTML", false, `${equationMarkup(equationTemplate, parts)}&nbsp;`);
    finishTextCommand(target, "Đã chèn công thức");
    setTextInsertPopover(null);
  }, [equationDraft, equationParts, equationTemplate, finishTextCommand, restoreTextSelection]);

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

  const applyTableLinePreset = useCallback((preset: (typeof LINE_PRESETS)[number]) => {
    updateTableBorder({ style: preset.style, width: preset.width });
    setTextInsertPopover(null);
  }, [updateTableBorder]);

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

  const updateActiveNotebook = (updater: (notebook: Notebook) => Notebook) => {
    const updated = updater(activeNotebook);
    const page = updated.pages.find((item) => item.id === updated.activePageId);
    if (page && page.id === activeNote.id) noteStore.updateActiveSheetContent(notePageToSheetContent(page));
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

  const goToPageFromRail = (page: number) => {
    goToPage(page);
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
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

  const sourcePages = useMemo(() => {
    if (!currentPdfDocument) return activeDocument ? [sourcePage] : activeWorkspace.kind === "demo" ? DEMO_PAGES : [];
    return Array.from({ length: currentPdfDocument.numPages }, (_, index) => index + 1);
  }, [activeDocument, activeWorkspace.kind, currentPdfDocument, sourcePage]);

  useEffect(() => {
    let cancelled = false;
    const applyBootstrapResult = (result: BootstrapResult) => {
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
        setToast(error instanceof Error ? error.message : "Không thể khởi động MedNote");
        setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
  }, []);

  // MEDNOTE_AUTOSAVE_EFFECT_START
  useEffect(() => {
    if (!ready) return;
    try {
      const savedAt = Date.now();
      localSavedAtRef.current = savedAt;
      const persistentWorkspaces = persistentDocumentWorkspaces(workspaces);
      const activeTemporary = workspaces.find((workspace) => workspace.id === activeWorkspaceId && workspace.kind === "temporary");
      const linkedPersistentWorkspace = activeTemporary?.noteNotebookId
        ? persistentWorkspaces.find((workspace) => workspace.noteNotebookId === activeTemporary.noteNotebookId)
        : undefined;
      const persistentActiveWorkspaceId = persistentWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)
        ? activeWorkspaceId
        : linkedPersistentWorkspace?.id || persistentWorkspaces[0]?.id
          || "";
      const snapshot = {
        workspaces: persistentWorkspaces,
        activeWorkspaceId: persistentActiveWorkspaceId,
        readerShare,
        workspaceMode: activeTemporary?.noteNotebookId ? "note" : workspaceMode,
        noteZoom,
        savedAt,
      } satisfies PersistedLibrary;
      saveDocumentRuntimeSnapshot(snapshot);
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
    const temporaryBlob = temporaryPdfBlobsRef.current.get(activeDocument.id);
    if (temporaryBlob) {
      setPdfSource({ blob: temporaryBlob, documentId: activeDocument.id });
      return () => { cancelled = true; };
    }
    void localBinaryStorage.readPdf(activeDocument.id).then((stored) => {
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
      const bytes = new Uint8Array(buffer);
      // Open with PDF.js first. PDFium is only a later quality upgrade: a
      // blocked blob/module worker must never hold the document loading state.
      document = await loadPdfDocument(bytes.slice());
      if (disposed) {
        void document.destroy();
      } else {
        setPdfDocument(document);
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
        // Upgrade visible pages when PDFium becomes ready. A rejected or timed
        // out worker quietly leaves the reliable PDF.js renderer in place.
        void loadPdfiumDocument(bytes).then((candidate) => {
          highFidelityDocument = candidate;
          if (disposed) {
            highFidelityDocument = null;
            void candidate.destroy();
          } else {
            setPdfiumDocument(candidate);
          }
        }).catch(() => undefined);
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

  useEffect(() => {
    setSelectedExcerptId(null);
    activeTextEditorRef.current = null;
    savedTextRangeRef.current = null;
    setTextToolbar({ ...normalizeText(activeNote.text), strike: false, subscript: false, superscript: false, unordered: false, ordered: false, backgroundColor: "transparent", lineHeight: "1.8", bulletStyle: "disc", numberingStyle: "decimal" });
    setTextInsertPopover(null);
  }, [activeNote.id, activeNotebook.id, activeWorkspace.id]);

  const updateActiveNote = (changes: NotePageContentPatch) => {
    if (activeNoteHydrating) {
      setToast("Đang mở nội dung tờ note…");
      return;
    }
    updateActiveNotebook((notebook) => ({
      ...notebook,
      pages: notebook.pages.map((page) => page.id === notebook.activePageId ? { ...page, ...changes } : page),
    }));
  };

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
        window.requestAnimationFrame(() => focusTypeEditor(editorId));
      }
    } else {
      setNotePanel(null);
    }
  };

  const choosePdfTool = (tool: PdfTool) => {
    setPdfTool(tool);
    if (tool !== "crop") setFirstAidCropTarget(null);
    if (["pen", "highlight", "area-highlight", "underline", "strikeout", "squiggly", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(tool)) {
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
    commitPdfAnnotations([...pdfAnnotations, annotation]);
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
    const other = pdfAnnotations.filter((annotation) => annotation.page !== page);
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
    setToast("Đã đưa đoạn trích sang note");
  };

  const addTranslationExcerpt = () => {
    const translation = dictionaryLookup.result?.translation;
    if (!pdfSelection || !translation) return;
    addTextExcerpt(pdfSelection, `${pdfSelection.text}\n\nBản dịch đề xuất:\n${translation}`);
  };

  const addImageExcerpt = async (result: PdfCropResult) => {
    if (!activeDocument) return;
    if (firstAidCropTarget && firstAidCropTarget.noteId !== activeNote.id) {
      setFirstAidCropTarget(null);
      setPdfTool("smart");
      setToast("Đã hủy Crop vì trang First Aid đích đã thay đổi");
      return;
    }
    const assetId = uid("crop");
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
      } catch { /* kích thước vùng PDF vẫn là dự phòng chính xác */ }
      const paper = PAPER_SIZES[activeNote.paper.size];
      const paperWidth = activeNote.paper.orientation === "portrait" ? paper.width : paper.height;
      const paperHeight = activeNote.paper.orientation === "portrait" ? paper.height : paper.width;
      const layout = defaultExcerptLayout(activeNote.excerpts.length, "image");
      layout.aspectRatio = aspectRatio;
      if (cropTarget) {
        layout.width = Math.min(.9, Math.max(.06, cropTarget.placement.width));
        layout.x = Math.min(1 - layout.width, Math.max(0, cropTarget.placement.x));
      }
      layout.height = Math.min(.72, Math.max(.04, layout.width * (paperWidth / paperHeight) / aspectRatio));
      if (cropTarget) layout.y = Math.min(1 - layout.height, Math.max(.04, cropTarget.placement.y));
      const excerptId = uid("excerpt");
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
        setFirstAidCropResult({ token: uid("crop-result"), blockId: cropTarget.blockId, excerptId, imageName: `${activeDocument.name} · trang ${result.page}`, aspectRatio });
        setFirstAidCropTarget(null);
        setToast("Đã crop từ PDF — ảnh đã gắn vào block và trở thành đối tượng trên trang");
      } else {
        setToast("Đã cắt hình và đưa sang note");
      }
    } catch {
      setFirstAidCropTarget(null);
      setToast("Không thể lưu hình cắt trên thiết bị này");
    }
  };

  const requestFirstAidPdfCrop = ({ blockId, placement }: { blockId: string; placement: FirstAidCropPlacement }) => {
    if (!activeDocument) {
      setToast("Thêm hoặc mở một PDF trước khi dùng Crop từ PDF");
      return;
    }
    setFirstAidCropResult(null);
    setFirstAidCropTarget({ noteId: activeNote.id, blockId, placement });
    setPdfSelection(null);
    setPdfTool("crop");
    setToast("Kéo khoanh vùng cần cắt trên trang PDF; ảnh sẽ tự gắn vào block đang chọn");
  };

  const finishFirstAidPdfCrop = (token: string) => {
    setFirstAidCropResult((current) => current?.token === token ? null : current);
  };

  const addFirstAidImage = async ({ blob, name, aspectRatio, placement }: { blob: Blob; name: string; aspectRatio: number; placement: { x: number; y: number; width: number } }) => {
    const assetId = uid("note-image");
    try {
      await localBinaryStorage.saveAsset(assetId, blob);
      const paper = PAPER_SIZES[activeNote.paper.size];
      const paperWidth = activeNote.paper.orientation === "portrait" ? paper.width : paper.height;
      const paperHeight = activeNote.paper.orientation === "portrait" ? paper.height : paper.width;
      const layout = defaultExcerptLayout(activeNote.excerpts.length, "image");
      layout.aspectRatio = Math.max(.01, aspectRatio);
      layout.width = Math.min(.9, Math.max(.06, placement.width));
      layout.x = Math.min(1 - layout.width, Math.max(0, placement.x));
      layout.height = Math.min(.72, Math.max(.04, layout.width * (paperWidth / paperHeight) / layout.aspectRatio));
      layout.y = Math.min(1 - layout.height, Math.max(.04, placement.y));
      const excerptId = uid("excerpt");
      const excerpt: NoteExcerpt = {
        id: excerptId,
        kind: "image",
        sourceKind: "manual",
        assetId,
        documentName: name,
        createdAt: Date.now(),
        layout,
      };
      updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
      setSelectedExcerptId(excerpt.id);
      setActiveTool("pointer");
      setNotePanel(null);
      setToast("Đã đưa ảnh lên trang — có thể kéo, đổi cỡ, xoay, chỉnh độ trong suốt và xếp lớp");
      return { excerptId };
    } catch {
      setToast("Không thể lưu ảnh trên thiết bị này");
      return null;
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

  const updateSelectedTextBoxAppearance = (changes: Partial<ExcerptAppearance>, closePopover = false) => {
    if (!selectedExcerpt || selectedExcerpt.kind !== "text") {
      setToast("Chọn một hộp chữ trước khi chỉnh viền hoặc nền");
      return;
    }
    const appearance = { ...normalizeExcerptAppearance(selectedExcerpt.appearance), ...changes };
    editExcerpt(selectedExcerpt.id, { appearance });
    if (closePopover) setTextInsertPopover(null);
    setToast("Đã cập nhật hộp chữ");
  };

  const addTextBoxAt = (event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget.querySelector<HTMLElement>(".typed-layer");
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = .24;
    const height = .08;
    const x = Math.min(1 - width, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1 - height, Math.max(.065, (event.clientY - rect.top) / rect.height));
    const excerpt: NoteExcerpt = {
      id: uid("textbox"),
      kind: "text",
      sourceKind: "manual",
      text: "",
      richText: "",
      createdAt: Date.now(),
      layout: { x, y, width, height, contentScale: 1, rotation: 0, opacity: 1, autoFit: true },
      appearance: { ...DEFAULT_TEXT_BOX_APPEARANCE },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    setToast("Đã tạo hộp chữ — nhập nội dung ngay");
  };

  const addCalloutAt = (event: React.PointerEvent<HTMLElement>) => {
    const host = event.currentTarget.querySelector<HTMLElement>(".typed-layer");
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const anchorX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const anchorY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const width = .38;
    const height = .18;
    const x = anchorX + width + .055 <= .98
      ? anchorX + .055
      : Math.max(.02, anchorX - width - .055);
    const y = anchorY - height - .055 >= .06
      ? anchorY - height - .055
      : Math.min(1 - height - .02, anchorY + .055);
    const excerpt: NoteExcerpt = {
      id: uid("callout"),
      kind: "text",
      annotationKind: "callout",
      callout: { anchorX, anchorY },
      sourceKind: "manual",
      text: "",
      richText: "",
      createdAt: Date.now(),
      layout: { x, y, width, height, contentScale: 1, rotation: 0, opacity: 1 },
      appearance: { ...DEFAULT_CALLOUT_APPEARANCE },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    setToast("Đã tạo callout — nhập chú thích, dùng Chọn để kéo đầu mũi tên");
  };

  const shiftExcerptLayer = (direction: "front" | "forward" | "backward" | "back") => {
    if (!selectedExcerpt || selectedExcerptIndex < 0) return;
    const targetIndex = direction === "front"
      ? activeNote.excerpts.length - 1
      : direction === "back"
        ? 0
        : selectedExcerptIndex + (direction === "forward" ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= activeNote.excerpts.length) return;
    const next = [...activeNote.excerpts];
    const [item] = next.splice(selectedExcerptIndex, 1);
    next.splice(targetIndex, 0, item);
    updateActiveNote({ excerpts: next });
    setToast(direction === "front" ? "Đã đưa đối tượng lên trên cùng" : direction === "back" ? "Đã đưa đối tượng xuống dưới cùng" : direction === "forward" ? "Đã đưa đối tượng lên một lớp" : "Đã đưa đối tượng xuống một lớp");
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

  const hasMeaningfulLocalData = () => Boolean(noteState.structure?.sheets.length) || workspaces.some((workspace) => {
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
      await noteStore.flush();
      const persistentWorkspaces = workspaces.filter((workspace) => workspace.kind !== "temporary" && workspace.documents.length > 0);
      for (const workspace of persistentWorkspaces) {
        await noteStore.saveDocumentWorkspace(documentWorkspaceInput(workspace, null, { workspaceMode, readerShare, noteZoom }));
      }
      await noteStore.setPreferences({ activeDocumentContextId: activeWorkspaceId, readerShare, workspaceMode, noteZoom });
      const library = await noteStore.exportLibrary();
      const structure = library.notes;
      const contents = library.sheetContents;
      const materializedNotebooks = structure
        ? ordered(structure.notebooks).map((notebook) => notebookFromStructure(structure, notebook.id, contents)).filter((notebook): notebook is Notebook => Boolean(notebook))
        : [];
      const remoteFiles = await listDriveAppFiles(token);
      const remoteByMednoteId = new Map(remoteFiles.flatMap((file) => file.appProperties?.mednoteId ? [[file.appProperties.mednoteId, file] as const] : []));
      const documents = new Map<string, LibraryDocument>();
      workspaces.forEach((workspace) => workspace.documents.forEach((document) => documents.set(document.id, document)));

      for (const document of documents.values()) {
        const mednoteId = `pdf:${document.id}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const stored = await localBinaryStorage.readPdf(document.id);
        if (!stored) continue;
        const uploaded = await upsertDriveFile(token, {
          name: `${document.id}__${document.name}`,
          mimeType: "application/pdf",
          mednoteId,
          blob: stored.blob,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
      }

      const assetIds = new Set(materializedNotebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : []))));
      for (const assetId of assetIds) {
        const mednoteId = `asset:${assetId}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const blob = await localBinaryStorage.readAsset(assetId);
        if (!blob) continue;
        const uploaded = await upsertDriveFile(token, {
          name: `${assetId}.png`,
          mimeType: blob.type || "image/png",
          mednoteId,
          blob,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
      }

      const savedAt = library.savedAt;
      const backup = createDriveBackup(library);
      const existingManifest = remoteByMednoteId.get(DRIVE_MANIFEST_ID);
      await upsertDriveFile(token, {
        name: "MedNote Library v2.json",
        mimeType: "application/json",
        mednoteId: DRIVE_MANIFEST_ID,
        blob: new Blob([JSON.stringify(backup)], { type: "application/json" }),
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
      const v2ManifestFile = remoteByMednoteId.get(DRIVE_MANIFEST_ID);
      if (v2ManifestFile) {
        const manifestBlob = await downloadDriveFile(token, v2ManifestFile.id);
        const staged = await stageDriveBackup(JSON.parse(await manifestBlob.text()));
        let missingFiles = 0;
        for (const record of staged.documents.documents) {
          const remote = remoteByMednoteId.get(`pdf:${record.id}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          const document: LibraryDocument = {
            id: record.id,
            name: record.name,
            size: record.size,
            lastModified: record.lastModified,
            reader: normalizeReader(record.payload.reader as Partial<ReaderState> | undefined),
          };
          await localBinaryStorage.savePdf(document.id, document.name, await downloadDriveFile(token, remote.id));
        }
        const assetIds = new Set(Object.values(staged.sheetContents).flatMap((content) => {
          const excerpts = Array.isArray(content.excerpts) ? content.excerpts as NoteExcerpt[] : [];
          return excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : []);
        }));
        for (const assetId of assetIds) {
          const remote = remoteByMednoteId.get(`asset:${assetId}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          await localBinaryStorage.saveAsset(assetId, await downloadDriveFile(token, remote.id));
        }

        await noteStore.replaceFromLibrary(staged);
        const restoredDocuments = workspacesFromLibraryV6(staged);
        const restoredWorkspaces = restoredDocuments.length ? restoredDocuments : [documentRuntimeWorkspace(createEmptyWorkspace())];
        const activeContextId = staged.preferences.activeDocumentContextId;
        const nextActiveWorkspaceId = restoredWorkspaces.some((workspace) => workspace.id === activeContextId)
          ? activeContextId
          : restoredWorkspaces[0].id;
        localSavedAtRef.current = staged.savedAt;
        workspacesRef.current = restoredWorkspaces;
        activeWorkspaceIdRef.current = nextActiveWorkspaceId;
        setWorkspaces(restoredWorkspaces);
        setActiveWorkspaceId(nextActiveWorkspaceId);
        setReaderShare(Math.max(20, Math.min(80, staged.preferences.readerShare || 50)));
        setWorkspaceMode(staged.preferences.workspaceMode || "split");
        setNoteZoom(Math.max(.5, Math.min(2, staged.preferences.noteZoom || 1)));
        setDriveReady(true);
        setDriveLastSyncedAt(staged.savedAt);
        setDriveStatus("connected");
        setToast(missingFiles ? `Đã khôi phục v2; thiếu ${missingFiles} tệp trên Drive` : "Đã khôi phục đầy đủ thư viện v2 từ Google Drive");
        return true;
      }

      // Manifest v1 is import-only. A successful next sync writes a new v2
      // manifest and never mutates the legacy backup.
      const manifestFile = remoteByMednoteId.get(DRIVE_LEGACY_MANIFEST_ID);
      if (!manifestFile) throw new Error("Google Drive chưa có bản lưu MedNote");
      const manifestBlob = await downloadDriveFile(token, manifestFile.id);
      const parsed = JSON.parse(await manifestBlob.text()) as PersistedLibrary;
      if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) throw new Error("Bản lưu Drive không hợp lệ");
      const normalized = parsed.workspaces.map(normalizeWorkspace);
      await noteStore.replaceFromLegacySnapshot(parsed);
      let missingFiles = 0;

      for (const workspace of normalized) {
        for (const document of workspace.documents) {
          const remote = remoteByMednoteId.get(`pdf:${document.id}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          await localBinaryStorage.savePdf(document.id, document.name, await downloadDriveFile(token, remote.id));
        }
      }

      const assetIds = new Set(normalized.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.flatMap((page) => page.excerpts.flatMap((excerpt) => excerpt.kind === "image" && excerpt.assetId ? [excerpt.assetId] : [])))));
      for (const assetId of assetIds) {
        const remote = remoteByMednoteId.get(`asset:${assetId}`);
        if (!remote) {
          missingFiles += 1;
          continue;
        }
        await localBinaryStorage.saveAsset(assetId, await downloadDriveFile(token, remote.id));
      }

      const savedAt = parsed.savedAt || (manifestFile.modifiedTime ? Date.parse(manifestFile.modifiedTime) : Date.now());
      localSavedAtRef.current = savedAt;
      const documentWorkspaces = normalized
        .filter((workspace) => workspace.id !== "note-runtime-v6")
        .map(documentRuntimeWorkspace);
      const restoredDocuments = documentWorkspaces.length ? documentWorkspaces : [documentRuntimeWorkspace(createEmptyWorkspace())];
      setWorkspaces(restoredDocuments);
      setActiveWorkspaceId(restoredDocuments.some((workspace) => workspace.id === parsed.activeWorkspaceId) ? parsed.activeWorkspaceId : restoredDocuments[0].id);
      setReaderShare(parsed.readerShare || 50);
      setWorkspaceMode(parsed.workspaceMode === "reader" || parsed.workspaceMode === "note" ? parsed.workspaceMode : "split");
      setNoteZoom(Math.max(.5, Math.min(2, parsed.noteZoom || 1)));
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
      const remoteExists = files.some((file) => file.appProperties?.mednoteId === DRIVE_MANIFEST_ID || file.appProperties?.mednoteId === DRIVE_LEGACY_MANIFEST_ID);
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
  }, [activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces]);

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
        if (!proxy) {
          const temporaryBlob = temporaryPdfBlobsRef.current.get(target.id);
          if (temporaryBlob) {
            proxy = await loadPdfDocument(temporaryBlob);
          } else {
            const stored = await localBinaryStorage.readPdf(target.id);
            proxy = stored ? await loadPdfDocument(stored.blob) : null;
          }
        }
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
    else goToPageFromRail(result.page);
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
    setPdfRailTab("search");
  };

  const exportAnnotatedPdf = async (mode: "download" | "print") => {
    if (!activeDocument) {
      setToast("Chưa có PDF để xuất");
      return;
    }
    setToast(mode === "print" ? "Đang chuẩn bị bản in…" : "Đang tạo PDF có chú thích…");
    try {
      const temporaryBlob = temporaryPdfBlobsRef.current.get(activeDocument.id);
      const stored = temporaryBlob ? { blob: temporaryBlob, name: activeDocument.name } : await localBinaryStorage.readPdf(activeDocument.id);
      if (!stored) throw new Error("Không tìm thấy PDF gốc trên thiết bị");
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const output = await PDFDocument.load(await stored.blob.arrayBuffer(), { ignoreEncryption: true });
      const pages = output.getPages();
      const regularFont = await output.embedFont(StandardFonts.Helvetica);
      const boldFont = await output.embedFont(StandardFonts.HelveticaBold);
      const signatureFont = await output.embedFont(StandardFonts.HelveticaOblique);
      const colorOf = (value: string) => {
        const color = hexToRgb01(value);
        return rgb(color.red, color.green, color.blue);
      };
      const drawText = (page: (typeof pages)[number], value: string, options: Parameters<(typeof page)["drawText"]>[1]) => {
        try {
          page.drawText(value, options);
        } catch {
          page.drawText(standardPdfText(value), options);
        }
      };

      pdfAnnotations.forEach((annotation) => {
        const target = pages[annotation.page - 1];
        if (!target) return;
        const color = colorOf(annotation.color);
        if (annotation.kind === "ink") {
          annotation.points.slice(1).forEach((point, index) => {
            const previous = annotation.points[index];
            target.drawLine({
              start: { x: previous.x, y: previous.y },
              end: { x: point.x, y: point.y },
              color,
              thickness: Math.max(.7, annotation.width),
              opacity: .96,
            });
          });
          return;
        }
        if ("rects" in annotation) {
          annotation.rects.forEach((rect) => {
            const x = Math.min(rect.x1, rect.x2);
            const y = Math.min(rect.y1, rect.y2);
            const width = Math.abs(rect.x2 - rect.x1);
            const height = Math.abs(rect.y2 - rect.y1);
            if (annotation.kind === "highlight" || annotation.kind === "area-highlight") {
              target.drawRectangle({ x, y, width, height, color, opacity: .34 });
            } else if (annotation.kind === "underline") {
              target.drawLine({ start: { x, y: y + .6 }, end: { x: x + width, y: y + .6 }, color, thickness: 1.2 });
            } else if (annotation.kind === "strikeout") {
              target.drawLine({ start: { x, y: y + height * .52 }, end: { x: x + width, y: y + height * .52 }, color, thickness: 1.2 });
            } else {
              const step = Math.max(2.4, Math.min(4, height * .24));
              for (let cursor = x; cursor < x + width; cursor += step) {
                target.drawLine({
                  start: { x: cursor, y: y + 1.2 },
                  end: { x: Math.min(x + width, cursor + step / 2), y: y + 2.8 },
                  color,
                  thickness: 1,
                });
                target.drawLine({
                  start: { x: Math.min(x + width, cursor + step / 2), y: y + 2.8 },
                  end: { x: Math.min(x + width, cursor + step), y: y + 1.2 },
                  color,
                  thickness: 1,
                });
              }
            }
          });
          return;
        }

        const rect = annotation.rect;
        const x = Math.min(rect.x1, rect.x2);
        const y = Math.min(rect.y1, rect.y2);
        const width = Math.abs(rect.x2 - rect.x1);
        const height = Math.abs(rect.y2 - rect.y1);
        const thickness = Math.max(.8, annotation.width);
        if (annotation.kind === "rectangle") {
          target.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: thickness });
        } else if (annotation.kind === "ellipse") {
          target.drawEllipse({ x: x + width / 2, y: y + height / 2, xScale: width / 2, yScale: height / 2, borderColor: color, borderWidth: thickness });
        } else if (annotation.kind === "arrow") {
          target.drawLine({ start: { x, y: y + height }, end: { x: x + width, y }, color, thickness });
          const angle = Math.atan2(-height, width);
          const head = Math.min(16, Math.max(7, Math.min(width, height) * .28));
          [angle + Math.PI * .78, angle - Math.PI * .78].forEach((branch) => {
            target.drawLine({
              start: { x: x + width, y },
              end: { x: x + width + Math.cos(branch) * head, y: y + Math.sin(branch) * head },
              color,
              thickness,
            });
          });
        } else if (annotation.kind === "note") {
          target.drawRectangle({ x, y, width, height, color, opacity: .84, borderColor: color, borderWidth: .8 });
          drawText(target, "!", { x: x + width * .38, y: y + height * .24, size: Math.max(8, height * .48), font: boldFont, color: rgb(1, 1, 1) });
        } else if (annotation.kind === "stamp") {
          target.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: Math.max(1.4, thickness) });
          const value = annotation.text || "DA XEM";
          drawText(target, value, { x: x + 6, y: y + Math.max(4, height * .32), size: Math.max(8, Math.min(18, height * .38)), font: boldFont, color });
        } else {
          const font = annotation.kind === "signature" ? signatureFont : regularFont;
          const size = annotation.kind === "signature" ? Math.max(10, Math.min(24, height * .45)) : Math.max(8, Math.min(16, height * .28));
          drawText(target, annotation.text || (annotation.kind === "signature" ? "Ky ten" : "Ghi chu"), { x: x + 3, y: y + Math.max(3, height - size - 4), size, font, color, maxWidth: Math.max(20, width - 6), lineHeight: size * 1.2 });
        }
      });

      const bytes = await output.save();
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
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
      frame.onload = () => window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      }, 500);
      document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
      setToast("Đã mở hộp thoại in");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xuất PDF");
    }
  };

  const exportNotebook = async () => {
    setToast("Đang tạo tệp note…");
    const structure = noteState.structure;
    if (!structure) return setToast("Kho note chưa sẵn sàng");
    let exportNotebook = activeNotebook;
    try {
      const contents = await noteStore.loadNotebookContents(activeNotebook.id);
      exportNotebook = notebookFromStructure(structure, activeNotebook.id, contents) || activeNotebook;
    } catch {
      setToast("Không thể nạp đầy đủ các tờ để xuất");
      return;
    }
    const pagesHtml: string[] = [];
    for (const [index, page] of exportNotebook.pages.entries()) {
      const text = normalizeText(page.text);
      const font = TEXT_FONTS.find((option) => option.id === text.font) ?? TEXT_FONTS[0];
      const textStyle = `font-family:${font.family};font-size:${text.size}px;color:${text.color === "auto" ? "#24343c" : text.color};font-weight:${text.bold ? 700 : 400};font-style:${text.italic ? "italic" : "normal"};text-decoration:${text.underline ? "underline" : "none"};text-align:${text.align}`;
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
        setWorkspaceMode("reader");
        setShowPdfRail(true);
        setPdfRailTab("search");
        window.setTimeout(() => document.getElementById("pdf-search-input")?.focus(), 0);
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
    // A file picker can resolve before the asynchronous IndexedDB restore on a
    // cold start. Wait for that single restore to finish so it cannot overwrite
    // the newly opened workspace a few frames later.
    while (!readyRef.current) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
    }
    const libraryWorkspaces = workspacesRef.current;
    const sessionToken = uid("session");
    const documents: LibraryDocument[] = files.map((file, index) => ({
      id: saveToLibrary
        ? `doc-${stableId(`${file.name}:${file.size}:${file.lastModified}`)}`
        : `temp-doc-${sessionToken}-${index}`,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      reader: { ...DEFAULT_READER },
    }));
    const workspaceId = saveToLibrary
      ? files.length === 1
        ? `workspace-${documents[0].id}`
        : `collection-${stableId(documents.map((document) => document.id).sort().join(":"))}`
      : `temporary-${sessionToken}`;
    const existing = saveToLibrary ? libraryWorkspaces.find((workspace) => workspace.id === workspaceId) : undefined;
    if (existing) {
      setActiveWorkspaceId(existing.id);
      setLibraryOpen(false);
      setWorkspaceMode("reader");
      setToast("Đã mở lại PDF trong thư viện");
      return;
    }

    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${files[0].name.replace(/\.pdf$/i, "")} +${files.length - 1}`;
    const noteStructure = noteStore.getSnapshot().structure;
    const requestedDestination = await requestNoteDestination({
      documentLabel: name,
      savedToLibrary: saveToLibrary,
      notebooks: ordered(noteStructure?.notebooks || []).map((notebook) => ({
        id: notebook.id,
        title: notebook.title,
        sections: ordered((noteStructure?.sections || []).filter((section) => section.notebookId === notebook.id)).map((section) => ({ id: section.id, title: section.title })),
      })),
    });
    const destination: NoteDestination = requestedDestination || { mode: "none" };

    if (saveToLibrary) {
      try {
        await Promise.all(files.map((file, index) => localBinaryStorage.savePdf(documents[index].id, documents[index].name, file)));
      } catch {
        setToast("PDF mở được nhưng chưa lưu trên thiết bị");
      }
    } else {
      temporaryPdfBlobsRef.current.clear();
      files.forEach((file, index) => temporaryPdfBlobsRef.current.set(documents[index].id, file));
    }

    let selectedNotebookId: string | null = null;
    let selectedTarget: LinkedNoteTarget | null = null;
    const firstPage = createBlankPage(1);
    try {
      if (destination.mode === "notebook") {
        const result = await noteStore.createNotebook(destination.title, notePageToSheetContent(firstPage));
        selectedNotebookId = result.active.activeNotebookId;
        selectedTarget = { targetType: "page", targetId: result.active.activePageId };
      } else if (destination.mode === "section") {
        const sectionResult = await noteStore.createSection(destination.notebookId, destination.title);
        const result = await noteStore.createPage(sectionResult.id, name, notePageToSheetContent(firstPage));
        selectedNotebookId = destination.notebookId;
        selectedTarget = { targetType: "page", targetId: result.active.activePageId };
      } else if (destination.mode === "page") {
        const result = await noteStore.createPage(destination.sectionId, destination.title, notePageToSheetContent(firstPage));
        selectedNotebookId = destination.notebookId;
        selectedTarget = { targetType: "page", targetId: result.active.activePageId };
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể tạo vị trí note");
      selectedNotebookId = null;
    }
    const placeholder = createReaderPlaceholder(workspaceId);
    const workspace: WorkspaceItem = {
      id: workspaceId,
      kind: saveToLibrary ? (files.length === 1 ? "document" : "collection") : "temporary",
      name,
      documents,
      activeDocumentId: documents[0].id,
      noteNotebookId: selectedNotebookId,
      notebooks: [placeholder],
      activeNotebookId: placeholder.id,
      sourcePage: 1,
    };
    if (saveToLibrary) {
      try {
        await noteStore.saveDocumentWorkspace(documentWorkspaceInput(workspace, selectedTarget, { workspaceMode: selectedNotebookId ? "split" : "reader", readerShare, noteZoom }));
      } catch (error) {
        setToast(error instanceof Error ? `PDF đã lưu nhưng liên kết note chưa ghi được: ${error.message}` : "PDF đã lưu nhưng liên kết note chưa ghi được");
      }
    }

    const persistentWorkspaces = libraryWorkspaces.filter((item) => item.kind !== "temporary" && item.id !== workspace.id);
    if (!saveToLibrary && selectedNotebookId && !persistentWorkspaces.some((item) => item.noteNotebookId === selectedNotebookId)) {
      const notebookTitle = noteStore.getSnapshot().structure?.notebooks.find((notebook) => notebook.id === selectedNotebookId)?.title || "Ghi chú MedNote";
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
    const nextWorkspaces = [workspace, ...persistentWorkspaces];
    workspacesRef.current = nextWorkspaces;
    activeWorkspaceIdRef.current = workspace.id;
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId(workspace.id);
    const nextMode: WorkspaceMode = selectedNotebookId ? "split" : "reader";
    workspaceModeRef.current = nextMode;
    setWorkspaceMode(nextMode);
    setLibraryOpen(false);

    const persistent = persistentDocumentWorkspaces(nextWorkspaces);
    const linkedPersistentWorkspace = selectedNotebookId
      ? persistent.find((item) => item.noteNotebookId === selectedNotebookId)
      : undefined;
    const savedAt = Date.now();
    const snapshot = {
      workspaces: persistent,
      activeWorkspaceId: saveToLibrary
        ? workspace.id
        : linkedPersistentWorkspace?.id || (persistent.some((item) => item.id === activeWorkspaceIdRef.current) ? activeWorkspaceIdRef.current : persistent[0]?.id || ""),
      readerShare,
      workspaceMode: saveToLibrary ? nextMode : selectedNotebookId ? "note" : workspaceMode,
      noteZoom,
      savedAt,
    } satisfies PersistedLibrary;
    saveDocumentRuntimeSnapshot(snapshot);

    setToast(destination.mode === "none"
      ? saveToLibrary
        ? (files.length === 1 ? "Đã lưu PDF vào thư viện — chưa tạo note" : "Đã lưu cụm PDF — chưa tạo note")
        : (files.length === 1 ? "Đang xem PDF tạm — không lưu, không tạo note" : "Đang xem cụm PDF tạm — không lưu, không tạo note")
      : saveToLibrary
        ? "Đã thêm tài liệu và tạo vị trí note"
        : "Đã mở PDF tạm; note được lưu độc lập");
  };

  const saveTemporaryWorkspace = async () => {
    if (activeWorkspace.kind !== "temporary") return;
    const savedDocuments = activeWorkspace.documents.map((document) => ({
      ...document,
      id: `doc-${stableId(`${document.name}:${document.size}:${document.lastModified}`)}`,
    }));
    const idMap = new Map(activeWorkspace.documents.map((document, index) => [document.id, savedDocuments[index].id]));
    const savedWorkspaceId = savedDocuments.length === 1
      ? `workspace-${savedDocuments[0].id}`
      : `collection-${stableId(savedDocuments.map((document) => document.id).sort().join(":"))}`;
    const existing = workspaces.find((workspace) => workspace.id === savedWorkspaceId);
    if (existing) {
      try {
        await noteStore.remapDocumentReferences(idMap);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Không thể cập nhật nguồn PDF trong note");
        return;
      }
      const nextWorkspaces = workspacesRef.current.filter((workspace) => workspace.id !== activeWorkspace.id);
      workspacesRef.current = nextWorkspaces;
      activeWorkspaceIdRef.current = existing.id;
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(existing.id);
      temporaryPdfBlobsRef.current.clear();
      setToast("PDF này đã có trong thư viện; nguồn note đã được nối lại");
      return;
    }

    try {
      await Promise.all(activeWorkspace.documents.map(async (document, index) => {
        const blob = temporaryPdfBlobsRef.current.get(document.id);
        if (!blob) throw new Error("missing temporary PDF");
        await localBinaryStorage.savePdf(savedDocuments[index].id, savedDocuments[index].name, blob);
      }));
    } catch {
      setToast("Không thể lưu PDF đang xem vào thư viện");
      return;
    }

    const placeholder = createReaderPlaceholder(savedWorkspaceId);
    const savedWorkspace: WorkspaceItem = {
      ...activeWorkspace,
      id: savedWorkspaceId,
      kind: savedDocuments.length === 1 ? "document" : "collection",
      documents: savedDocuments,
      activeDocumentId: savedDocuments[0].id,
      notebooks: [placeholder],
      activeNotebookId: placeholder.id,
    };
    const structure = noteStore.getSnapshot().structure;
    const linkedPageId = structure && savedWorkspace.noteNotebookId
      ? structure.pages.find((page) => {
        const section = structure.sections.find((record) => record.id === page.sectionId);
        return section?.notebookId === savedWorkspace.noteNotebookId;
      })?.id
      : null;

    let graphSaved = false;
    try {
      await noteStore.saveDocumentWorkspace(documentWorkspaceInput(
        savedWorkspace,
        linkedPageId ? { targetType: "page", targetId: linkedPageId } : null,
        { workspaceMode: linkedPageId ? "split" : "reader", readerShare, noteZoom },
      ));
      graphSaved = true;
      await noteStore.remapDocumentReferences(idMap);
    } catch (error) {
      if (graphSaved) await noteStore.deleteDocumentWorkspace(savedWorkspaceId).catch(() => undefined);
      await Promise.allSettled(savedDocuments.map((document) => localBinaryStorage.deletePdf(document.id)));
      setToast(error instanceof Error ? `Không thể hoàn tất lưu PDF: ${error.message}` : "Không thể hoàn tất lưu PDF");
      return;
    }

    const nextWorkspaces = workspacesRef.current.map((workspace) => workspace.id === activeWorkspace.id ? savedWorkspace : workspace);
    workspacesRef.current = nextWorkspaces;
    activeWorkspaceIdRef.current = savedWorkspaceId;
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId(savedWorkspaceId);
    workspaceModeRef.current = hasActiveNote ? "split" : "reader";
    setWorkspaceMode(workspaceModeRef.current);
    const savedAt = Date.now();
    const snapshot = {
      workspaces: persistentDocumentWorkspaces(nextWorkspaces),
      activeWorkspaceId: savedWorkspaceId,
      readerShare,
      workspaceMode: hasActiveNote ? "split" as const : "reader" as const,
      noteZoom,
      savedAt,
    } satisfies PersistedLibrary;
    try { saveDocumentRuntimeSnapshot(snapshot); } catch { /* IndexedDB remains the durable source. */ }
    temporaryPdfBlobsRef.current.clear();
    setToast(hasActiveNote ? "Đã lưu PDF; nguồn trong note đã được cập nhật" : "Đã lưu PDF đang xem vào thư viện — chưa tạo note");
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
      if (activeWorkspace.kind !== "temporary" && activeWorkspace.documents.length) {
        await noteStore.saveDocumentWorkspace(documentWorkspaceInput(
          activeWorkspace,
          { targetType: "page", targetId: result.active.activePageId },
          { workspaceMode: "split", readerShare, noteZoom },
        ));
      }
      updateActiveWorkspace((workspace) => ({ ...workspace, noteNotebookId: result.active.activeNotebookId }));
      setActiveTool("text");
      workspaceModeRef.current = activeWorkspace.documents.length ? "split" : "note";
      setWorkspaceMode(workspaceModeRef.current);
      setToast(activeWorkspace.documents.length ? "Đã tạo Notebook cho tài liệu" : "Đã tạo sổ ghi chú mới");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể tạo Notebook");
    }
  };

  const beginWorkspaceRename = (workspace: WorkspaceItem) => {
    setRenamingWorkspaceId(workspace.id);
    setRenamingWorkspaceName(workspace.name);
  };

  const cancelWorkspaceRename = () => {
    setRenamingWorkspaceId(null);
    setRenamingWorkspaceName("");
  };

  const commitWorkspaceRename = async (workspaceId: string) => {
    const nextName = renamingWorkspaceName.trim().replace(/\.pdf$/i, "").trim();
    if (!nextName) {
      setToast("Tên tài liệu không được để trống");
      return;
    }
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const targetDocument = target.kind === "document" && target.documents.length === 1 ? target.documents[0] : null;
    const renamedDocument = targetDocument ? { ...targetDocument, name: `${nextName}.pdf` } : null;
    const updatedWorkspace: WorkspaceItem = {
      ...target,
      name: nextName,
      documents: renamedDocument ? [renamedDocument] : target.documents,
    };
    try {
      if (target.kind !== "temporary" && target.documents.length) {
        await noteStore.saveDocumentWorkspace(documentWorkspaceInput(updatedWorkspace, null, { workspaceMode, readerShare, noteZoom }));
      }
      if (renamedDocument) {
        void localBinaryStorage.readPdf(renamedDocument.id)
          .then((stored) => stored ? localBinaryStorage.savePdf(renamedDocument.id, renamedDocument.name, stored.blob) : undefined)
          .catch(() => undefined);
      }
      const nextWorkspaces = workspaces.map((workspace) => workspace.id === workspaceId ? updatedWorkspace : workspace);
      workspacesRef.current = nextWorkspaces;
      setWorkspaces(nextWorkspaces);
      cancelWorkspaceRename();
      setToast("Đã đổi tên tài liệu");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể đổi tên tài liệu");
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const linkedNotebook = noteState.structure?.notebooks.find((notebook) => notebook.id === target.noteNotebookId);
    const targetLabel = target.kind === "collection" ? "cụm tài liệu" : target.kind === "demo" ? "tài liệu mẫu" : "tài liệu";
    if (!window.confirm(`Xóa ${targetLabel} “${target.name}”? ${linkedNotebook ? "Mọi note sẽ được giữ lại thành note độc lập." : "Thao tác này chỉ xóa bản PDF đã lưu."}`)) return;
    let remainingDocumentIds = new Set(noteState.documents.documents.map((document) => document.id));
    if (target.kind !== "temporary") {
      try {
        const documents = await noteStore.deleteDocumentWorkspace(target.id);
        remainingDocumentIds = new Set(documents.documents.map((document) => document.id));
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Không thể tháo liên kết tài liệu");
        return;
      }
    }
    let deletePersistedPdfs: Promise<PromiseSettledResult<void>[]> | null = null;
    if (target.kind === "temporary") {
      target.documents.forEach((document) => temporaryPdfBlobsRef.current.delete(document.id));
    } else {
      // A PDF blob is removed only when no remaining DocumentContext/Group owns
      // the same DocumentRecord identity.
      const unreferenced = target.documents.filter((document) => !remainingDocumentIds.has(document.id));
      deletePersistedPdfs = Promise.allSettled(unreferenced.map((document) => localBinaryStorage.deletePdf(document.id)));
    }
    const deletedDocumentIds = new Set(target.documents.map((document) => document.id));
    const targetIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
    const detachedPlaceholder = createReaderPlaceholder(target.id);
    const detachedWorkspace: WorkspaceItem | null = linkedNotebook ? {
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
    const remaining = workspaces.flatMap((workspace) => workspace.id !== workspaceId
      ? [workspace]
      : detachedWorkspace ? [detachedWorkspace] : []);
    const nextWorkspaces = remaining.length ? remaining : [createEmptyWorkspace()];
    workspacesRef.current = nextWorkspaces;
    setWorkspaces(nextWorkspaces);
    if (activeWorkspaceId === workspaceId) {
      const nextActiveWorkspaceId = detachedWorkspace?.id || nextWorkspaces[Math.min(targetIndex, nextWorkspaces.length - 1)].id;
      const nextMode: WorkspaceMode = detachedWorkspace ? "note" : "reader";
      activeWorkspaceIdRef.current = nextActiveWorkspaceId;
      workspaceModeRef.current = nextMode;
      setActiveWorkspaceId(nextActiveWorkspaceId);
      setWorkspaceMode(nextMode);
    }
    setPdfHistory((history) => Object.fromEntries(Object.entries(history).filter(([documentId]) => !deletedDocumentIds.has(documentId))));
    setNotePanel(null);
    setLibraryOpen(false);
    setToast(detachedWorkspace ? `Đã xóa ${targetLabel}; note đã trở thành note độc lập` : `Đã xóa ${targetLabel}`);
    if (deletePersistedPdfs) await deletePersistedPdfs;
  };

  const deleteActiveDocument = async () => {
    if (!activeDocument) return;
    if (activeWorkspace.documents.length === 1) {
      await deleteWorkspace(activeWorkspace.id);
      return;
    }
    if (!window.confirm(`Xóa tài liệu “${activeDocument.name}” khỏi cụm? Các sổ note chung của cụm sẽ được giữ lại.`)) return;
    let documents = noteStore.getSnapshot().documents;
    if (activeWorkspace.kind !== "temporary") {
      try {
        documents = await noteStore.deleteDocumentFromWorkspace(activeWorkspace.id, activeDocument.id);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Không thể xóa tài liệu khỏi cụm");
        return;
      }
    }
    if (activeWorkspace.kind === "temporary") {
      temporaryPdfBlobsRef.current.delete(activeDocument.id);
    } else if (!documents.documents.some((document) => document.id === activeDocument.id)) {
      await Promise.allSettled([localBinaryStorage.deletePdf(activeDocument.id)]);
    }
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
    setToast("Đã xóa tài liệu khỏi cụm; provenance trong note vẫn được giữ");
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

  const updatePaperTemplate = (template: PaperTemplate) => {
    if (template !== "first-aid") {
      updatePaper({ template });
      return;
    }
    const shouldSeed = !activeNote.body.trim() && !activeNote.excerpts.length;
    const replaceDefaultTitle = /^GHI CHÚ(?:\s+\d+)?$/i.test(activeNote.title.trim());
    updateActiveNote({
      paper: { ...activeNote.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
      text: { ...activeNote.text, font: "times", size: 12, align: "left" },
      ...(shouldSeed ? {
        bodyHtml: FIRST_AID_TEMPLATE_HTML,
        body: FIRST_AID_TEMPLATE_TEXT,
      } : {}),
    });
    if (shouldSeed && replaceDefaultTitle && activeLogicalPage?.id) {
      void noteStore.renamePage(activeLogicalPage.id, "TÊN CHỦ ĐỀ").catch((error) => {
        setToast(error instanceof Error ? error.message : "Không thể đổi tên Page");
      });
    }
    setActiveTool("text");
    setToast(shouldSeed ? "Đã tạo khung note First Aid để điền nội dung" : "Đã áp dụng bố cục First Aid");
  };

  const updateText = (changes: Partial<TextSettings>) => {
    updateActiveNote({ text: { ...activeNote.text, ...changes } });
    setToast("Đã lưu định dạng chữ cho trang này");
  };

  const changeWorkspaceMode = (mode: WorkspaceMode) => {
    if (mode !== "reader" && !hasActiveNote) {
      setToast(activeWorkspace.kind === "temporary"
        ? "PDF đang mở tạm. Chọn “Tạo note” để ghi chú mà không cần lưu PDF."
        : "PDF này chưa có note. Chọn “Tạo note” khi bạn muốn ghi chú.");
      return;
    }
    setWorkspaceMode(mode);
    if (mode === "note") {
      setPdfSelection(null);
      setPdfPanel(null);
      window.getSelection()?.removeAllRanges();
    }
    if (mode === "reader") {
      setNotePanel(null);
      setTextInsertPopover(null);
    }
    setToast(mode === "split" ? "Đang dùng Reader và Note" : mode === "reader" ? "Đang chỉ xem Reader" : "Đang chỉ làm Note");
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
  const setNoteSidebarVisibility = (visible: boolean) => {
    setShowNoteSidebar(visible);
    try { localStorage.setItem("mednote-note-sidebar-v6-hidden", visible ? "0" : "1"); } catch { /* UI preference is non-critical. */ }
  };
  const selectedPaperSize = PAPER_SIZES[activeNote.paper.size];
  const paperWidth = activeNote.paper.orientation === "portrait" ? selectedPaperSize.width : selectedPaperSize.height;
  const paperHeight = activeNote.paper.orientation === "portrait" ? selectedPaperSize.height : selectedPaperSize.width;
  const basePaperMaxWidth = activeNote.paper.orientation === "portrait" ? selectedPaperSize.maxWidth : Math.min(920, selectedPaperSize.maxWidth * 1.32);
  const noteZoomPercent = Math.round(noteZoom * 100);
  const setNoteViewZoom = (value: number) => setNoteZoom(Math.max(.5, Math.min(2, value)));
  const fitNoteToView = () => {
    const available = (noteStageRef.current?.clientWidth ?? basePaperMaxWidth) - 72;
    setNoteViewZoom(available / basePaperMaxWidth);
  };
  const lineStep = activeNote.paper.template === "ruled-dense" ? 5 : 8;
  const defaultTextFont = TEXT_FONTS.find((font) => font.id === activeNote.text.font) ?? TEXT_FONTS[0];
  const selectedToolbarFont = TEXT_FONTS.find((font) => font.id === textToolbar.font) ?? TEXT_FONTS[0];
  const paperStyle = {
    "--paper-ratio": `${paperWidth} / ${paperHeight}`,
    "--paper-max-width": `${basePaperMaxWidth}px`,
    "--note-view-zoom": noteZoom,
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
      <input ref={previewPdfInputRef} data-pdf-input="preview" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, false); event.currentTarget.value = ""; }} />
      <input ref={libraryPdfInputRef} data-pdf-input="library" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, true); event.currentTarget.value = ""; }} />
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button menu-button" aria-label="Mở thư viện" onClick={() => setLibraryOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark">M</div><span className="brand-name">MedNote</span><span className="top-divider" />
          <button className="document-title" onClick={() => setLibraryOpen(true)}><span>{documentName}</span><ChevronDown size={15} /></button>
        </div>
        <div className="top-actions">
          <nav className="workspace-mode-switcher" aria-label="Chế độ không gian làm việc">
            <button className={workspaceMode === "split" ? "active" : ""} onClick={() => changeWorkspaceMode("split")} disabled={!hasActiveNote} title={!hasActiveNote ? "Tạo note trước để dùng chế độ Cả hai" : "Hiện Reader và Note"} aria-pressed={workspaceMode === "split"}><Columns2 size={16} /><span>Cả hai</span></button>
            <button className={workspaceMode === "reader" ? "active" : ""} onClick={() => changeWorkspaceMode("reader")} title="Chỉ hiện Reader" aria-pressed={workspaceMode === "reader"}><BookOpen size={16} /><span>Reader</span></button>
            <button className={workspaceMode === "note" ? "active" : ""} onClick={() => changeWorkspaceMode("note")} disabled={!hasActiveNote} title={!hasActiveNote ? "Chưa có note" : "Chỉ hiện Note"} aria-pressed={workspaceMode === "note"}><NotebookTabs size={16} /><span>Note</span></button>
          </nav>
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
          {activeWorkspace.kind === "temporary" && <button className="save-session-button" onClick={() => { void saveTemporaryWorkspace(); }}><Download size={15} /> Lưu vào thư viện</button>}
          {activeWorkspace.documents.length > 0 && !hasActiveNote && <button className="save-session-button" onClick={() => { void addNotebook(); }}><NotebookTabs size={15} /> Tạo note</button>}
          <button className="primary-button" onClick={() => previewPdfInputRef.current?.click()}><FolderOpen size={16} /> Mở PDF</button>
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
            <div className="library-header"><div><strong>Thư viện</strong><span>PDF và note được lưu độc lập; chỉ liên kết khi bạn chọn</span></div><button className="icon-button" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={19} /></button></div>
            <button className="library-import" onClick={() => libraryPdfInputRef.current?.click()}><FolderOpen size={18} /><span><strong>Lưu PDF hoặc cụm PDF vào thư viện</strong><small>Chỉ thao tác này mới lưu tệp PDF trên thiết bị</small></span></button>
            <div className="library-list">
              {workspaces.filter((workspace) => workspace.kind !== "temporary").map((workspace) => {
                const linkedNotebookId = workspace.noteNotebookId || null;
                const linkedSectionIds = linkedNotebookId && noteState.structure
                  ? new Set(noteState.structure.sections.filter((section) => section.notebookId === linkedNotebookId).map((section) => section.id))
                  : new Set<string>();
                const pageCount = noteState.structure
                  ? noteState.structure.pages.filter((page) => linkedSectionIds.has(page.sectionId)).length
                  : 0;
                const notebookCount = linkedNotebookId && noteState.structure?.notebooks.some((notebook) => notebook.id === linkedNotebookId) ? 1 : 0;
                const isRenaming = renamingWorkspaceId === workspace.id;
                return (
                  <div className={`library-row ${workspace.kind === "empty" ? "library-row-single" : ""}`} key={workspace.id}>
                    {isRenaming ? (
                      <form className={`library-item library-rename-item ${workspace.id === activeWorkspace.id ? "active" : ""}`} onSubmit={(event) => { event.preventDefault(); commitWorkspaceRename(workspace.id); }}>
                        <span className="library-icon"><FileText size={19} /></span>
                        <span><input autoFocus value={renamingWorkspaceName} onChange={(event) => setRenamingWorkspaceName(event.target.value)} onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => { if (event.key === "Escape") cancelWorkspaceRename(); }} aria-label="Tên tài liệu mới" /><small>Enter để lưu · Esc để hủy</small></span>
                      </form>
                    ) : (
                      <button className={`library-item ${workspace.id === activeWorkspace.id ? "active" : ""}`} onClick={() => { setActiveWorkspaceId(workspace.id); setLibraryOpen(false); }}>
                        <span className="library-icon"><FileText size={19} /></span>
                        <span><strong>{workspace.name}</strong><small>{workspace.kind === "collection" ? `${workspace.documents.length} tài liệu` : workspace.kind === "demo" ? "Tài liệu mẫu" : workspace.kind === "empty" ? "Note độc lập" : "1 tài liệu"} · {notebookCount} sổ · {pageCount} trang note</small></span>
                      </button>
                    )}
                    {workspace.kind !== "empty" && (isRenaming
                      ? <><button className="library-action library-save" onClick={() => commitWorkspaceRename(workspace.id)} aria-label="Lưu tên mới" title="Lưu tên mới"><Check size={17} /></button><button className="library-action library-cancel" onClick={cancelWorkspaceRename} aria-label="Hủy đổi tên" title="Hủy"><X size={17} /></button></>
                      : <><button className="library-action library-rename" onClick={() => beginWorkspaceRename(workspace)} aria-label={`Đổi tên ${workspace.name}`} title="Đổi tên tài liệu"><Pencil size={17} /></button><button className="library-action library-delete" onClick={() => { void deleteWorkspace(workspace.id); }} aria-label={`Xóa ${workspace.name}`} title="Xóa PDF; giữ note thành note độc lập"><Trash2 size={17} /></button></>)}
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

      <section className={`workspace workspace-mode-${workspaceMode} ${showPdfRail ? "" : "pdf-rail-collapsed"} ${showNoteSidebar ? "" : "note-sidebar-collapsed"} ${pdfRailTab === "pages" ? "" : "pdf-rail-wide"}`} ref={workspaceRef} style={gridStyle}>
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
                <PdfThumbnail key={`${activeDocument?.id}-${page}`} document={currentPdfDocument} page={page} active={page === sourcePage} onClick={() => goToPageFromRail(page)} />
              ) : (
                <button className={`pdf-thumb ${page === sourcePage ? "active" : ""}`} key={page} onClick={() => goToPageFromRail(page)}><span className="mini-paper"><i /><i /><i /><i className="wide" /><b /></span><span>{page}</span></button>
              ))}
            </div>
          )}

          {pdfRailTab === "outline" && (
            <div className="pdf-rail-content">
              <h3>Mục lục</h3>
              {outline.length ? outline.map((entry, index) => (
                <button key={`${entry.title}-${index}`} className="outline-entry" style={{ paddingLeft: 10 + Math.min(entry.depth, 4) * 13 }} disabled={!entry.page} onClick={() => entry.page && goToPageFromRail(entry.page)}>
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
              {bookmarks.length ? bookmarks.map((page) => <div className="mark-row" key={`bookmark-${page}`}><button onClick={() => goToPageFromRail(page)}><BookmarkCheck size={15} /><span>Trang {page}</span></button><button aria-label={`Bỏ đánh dấu trang ${page}`} onClick={() => updateReader((reader) => ({ ...reader, bookmarks: reader.bookmarks.filter((item) => item !== page) }))}><X size={14} /></button></div>) : <p className="marks-empty">Chưa có trang được đánh dấu.</p>}
              <h3>Chú thích</h3>
              {pdfAnnotations.length ? [...pdfAnnotations].sort((a, b) => a.page - b.page).map((annotation) => <div className="annotation-row" key={annotation.id}><button onClick={() => goToPageFromRail(annotation.page)}><span className={`annotation-kind kind-${annotation.kind}`}>{pdfAnnotationLabel(annotation)}</span><b>Trang {annotation.page}</b><p>{pdfAnnotationSummary(annotation)}</p></button><button className="delete-mark" onClick={() => removePdfAnnotation(annotation.id)} aria-label="Xóa chú thích"><Trash2 size={14} /></button></div>) : <div className="rail-empty"><Highlighter size={24} /><span>Highlight, hình vẽ, ghi chú và nét bút sẽ xuất hiện tại đây.</span></div>}
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
              <button className="pdf-toolbar-button" disabled={!activeDocument} onClick={() => { void exportAnnotatedPdf("download"); }} title="Xuất PDF có chú thích" aria-label="Xuất PDF có chú thích"><Download size={17} /><span>Xuất PDF</span></button>
              <button className="pdf-toolbar-button" disabled={!activeDocument} onClick={() => { void exportAnnotatedPdf("print"); }} title="In PDF có chú thích" aria-label="In PDF có chú thích"><Printer size={17} /></button>
              <span className="toolbar-divider" />
              {activeWorkspace.kind !== "empty" && <div className="page-control"><button aria-label="Trang trước" disabled={sourcePage <= 1} onClick={() => goToPage(sourcePage - 1)}><ChevronLeft size={14} /></button><label><input key={`${activeDocument?.id}-${sourcePage}`} defaultValue={sourcePage} inputMode="numeric" aria-label="Số trang" onKeyDown={(event) => { if (event.key === "Enter") goToPage(Number(event.currentTarget.value)); }} onBlur={(event) => goToPage(Number(event.currentTarget.value))} /><span>/ {totalPages}</span></label><button aria-label="Trang sau" disabled={sourcePage >= totalPages} onClick={() => goToPage(sourcePage + 1)}><ChevronRight size={14} /></button></div>}
              <div className="zoom-control"><button aria-label="Thu nhỏ" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom - .1)}><Minus size={15} /></button><span>{Math.round(sourceZoom * 100)}%</span><button aria-label="Phóng to" disabled={!currentPdfDocument} onClick={() => setSourceZoom((zoom) => zoom + .1)}><Plus size={15} /></button></div>
              <span className="toolbar-spacer" />
              <button className={`pdf-toolbar-button ${bookmarks.includes(sourcePage) ? "active" : ""}`} disabled={!currentPdfDocument} onClick={toggleBookmark} title="Đánh dấu trang">{bookmarks.includes(sourcePage) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
              <button className={`pdf-toolbar-button menu-trigger ${pdfPanel === "view" ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => setPdfPanel((panel) => panel === "view" ? null : "view")} title="Tùy chọn hiển thị" aria-expanded={pdfPanel === "view"}><Settings2 size={17} /><span>Hiển thị</span><ChevronDown size={12} /></button>
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster" aria-label="Công cụ thao tác PDF">
                {PDF_TOOLS.map(({ id, label, shortLabel, icon: Icon }) => <button key={id} className={`pdf-toolbar-button pdf-mode-button ${pdfTool === id ? "active" : ""}`} disabled={!currentPdfDocument} onClick={() => choosePdfTool(id)} title={label} aria-label={label}><Icon size={18} />{pdfTool === id && <span>{shortLabel}</span>}{["pen", "highlight", "area-highlight", "underline", "strikeout", "squiggly", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(id) && <ChevronDown className="tool-chevron" size={11} />}</button>)}
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
                <button className={workspaceMode === "reader" ? "selected" : ""} onClick={() => changeWorkspaceMode(workspaceMode === "reader" ? "split" : "reader")}><Maximize2 size={18} /><span>{workspaceMode === "reader" ? "Trở lại cả hai" : "Chỉ Reader"}</span></button>
              </div>
            </div>
          )}

          {pdfPanel === "ink" && (
            <div className="floating-tool-panel pdf-ink-panel" role="dialog" aria-label="Cài đặt công cụ PDF">
              <div className="tool-panel-heading"><div><strong>{pdfTool === "pen" ? "Bút viết PDF" : pdfTool === "area-highlight" ? "Tô vùng" : pdfTool === "note" ? "Ghi chú dán" : pdfTool === "text" ? "Chèn chữ" : pdfTool === "stamp" ? "Đóng dấu" : pdfTool === "signature" ? "Chữ ký" : ["rectangle", "ellipse", "arrow"].includes(pdfTool) ? "Hình vẽ" : "Đánh dấu văn bản"}</strong><span>{pdfTool === "area-highlight" ? "Kéo khung lên công thức, hình, bảng hoặc trang scan" : ["note", "text", "stamp", "signature"].includes(pdfTool) ? "Nhập nội dung rồi bấm vị trí muốn đặt" : ["rectangle", "ellipse", "arrow"].includes(pdfTool) ? "Kéo trực tiếp trên trang để vẽ" : "Chọn màu không làm đổi công cụ"}</span></div><button className="icon-button compact" onClick={() => setPdfPanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              {(pdfTool === "note" || pdfTool === "text") && <label className="pdf-annotation-input"><span>Nội dung</span><textarea value={pdfTextDraft} onChange={(event) => setPdfTextDraft(event.target.value)} rows={3} placeholder="Nhập ghi chú…" /></label>}
              {pdfTool === "stamp" && <>
                <div className="panel-setting"><label>Mẫu dấu</label><div className="stamp-presets">{["ĐÃ XEM", "ĐÃ DUYỆT", "BẢN NHÁP", "QUAN TRỌNG"].map((stamp) => <button key={stamp} className={pdfStampDraft === stamp ? "selected" : ""} onClick={() => setPdfStampDraft(stamp)}>{stamp}</button>)}</div></div>
                <label className="pdf-annotation-input"><span>Tùy chỉnh</span><input value={pdfStampDraft} onChange={(event) => setPdfStampDraft(event.target.value)} /></label>
              </>}
              {pdfTool === "signature" && <label className="pdf-annotation-input"><span>Chữ ký dạng chữ</span><input value={pdfSignatureDraft} onChange={(event) => setPdfSignatureDraft(event.target.value)} placeholder="Nhập tên ký…" /></label>}
              <div className="panel-setting"><label>Màu</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${pdfPanelColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => updatePdfPanelColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={pdfPanelColor} onChange={(event) => updatePdfPanelColor(event.target.value)} /><span>+</span></label></div></div>
              {(pdfTool === "pen" || ["rectangle", "ellipse", "arrow"].includes(pdfTool)) && <div className="panel-setting"><label>Độ dày</label><div className="width-options">{[1, 2, 3, 5].map((width) => <button key={width} className={inkWidth === width ? "selected" : ""} onClick={() => setInkWidth(width)}><i style={{ height: width }} />{width}</button>)}</div></div>}
              {["note", "text", "stamp", "signature"].includes(pdfTool) && <p className="pdf-placement-help">Bấm nhiều vị trí để đặt lại cùng nội dung. Dùng công cụ Tẩy hoặc danh sách Chú thích để xóa.</p>}
            </div>
          )}

          <div className={`document-stage workspace-frame pdf-view-${viewMode}`} ref={documentStageRef} onScroll={handleReaderScroll}>
            {currentPdfDocument && viewMode === "single" ? <PdfPageView key={`${activeDocument?.id}-${sourcePage}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={sourcePage} zoom={sourceZoom} fitMode={fitMode} rotation={rotation} tool={pdfTool} inkColor={inkColor} highlightColor={pdfHighlightColor} inkWidth={inkWidth} annotationText={pdfAnnotationText} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus?.documentId === activeDocument?.id && sourceFocus.page === sourcePage ? sourceFocus.rect : null} onSelection={handlePdfSelection} onAnnotationCommit={(next, previous) => commitPdfPageAnnotations(sourcePage, next, previous)} onCrop={addImageExcerpt} /> : currentPdfDocument ? (
              <div className="continuous-pages">
                {sourcePages.map((page) => <LazyPdfPageView key={`${activeDocument?.id}-${page}-${rotation}`} document={currentPdfDocument} pdfiumDocument={pdfiumDocument} page={page} zoom={sourceZoom} fitMode="width" rotation={rotation} tool={pdfTool} inkColor={inkColor} highlightColor={pdfHighlightColor} inkWidth={inkWidth} annotationText={pdfAnnotationText} annotations={pdfAnnotations} searchQuery={activeSearchQuery} sourceFocus={sourceFocus?.documentId === activeDocument?.id && sourceFocus.page === page ? sourceFocus.rect : null} onSelection={handlePdfSelection} onAnnotationCommit={(next, previous) => commitPdfPageAnnotations(page, next, previous)} onCrop={addImageExcerpt} />)}
              </div>
            ) : activeDocument ? (
              <div className="empty-document"><FileText size={34} /><strong>{pdfStatus === "error" ? "Không tìm thấy bản PDF đã lưu" : "Đang mở tài liệu…"}</strong>{pdfStatus === "error" && <button className="primary-button" onClick={() => libraryPdfInputRef.current?.click()}>Chọn lại PDF</button>}</div>
            ) : activeWorkspace.kind === "demo" ? <><div className="demo-reader-hint"><BookOpen size={16} /><span>Đây là tài liệu minh họa. Thêm một PDF để dùng chọn chữ, chú thích và cắt hình.</span></div><DemoDocument page={sourcePage} /></> : (
              <div className="empty-document"><FolderOpen size={34} /><strong>Chưa có tài liệu</strong><span>Mở PDF để đọc tạm, hoặc lưu riêng vào thư viện khi cần.</span><button className="primary-button" onClick={() => previewPdfInputRef.current?.click()}>Mở PDF</button></div>
            )}
          </div>
        </section>

        <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>

        <section className="notes-pane">
          <div className={`note-toolbar two-row-toolbar ${notePanel === "text" ? "text-tools-open" : ""}`} role="toolbar" aria-label="Công cụ ghi chú">
            <div className="toolbar-row toolbar-row-primary">
              <div className="toolbar-cluster note-file-actions">
                {!showNoteSidebar && <button className="icon-button compact" onClick={() => setNoteSidebarVisibility(true)} aria-label="Hiện điều hướng ghi chú" title="Hiện điều hướng ghi chú"><PanelRightOpen size={17} /></button>}
                <button className="note-create-button" onClick={() => { void exportNotebook(); }}><Download size={16} /><span>Xuất note</span></button>
              </div>
              <span className="toolbar-spacer" />
              <div className="note-sheet-view-control" role="group" aria-label="Cách xem các tờ trong Page">
                <button className={noteSheetViewMode === "single" ? "selected" : ""} onClick={() => setNoteSheetViewMode("single")} aria-pressed={noteSheetViewMode === "single"} title="Chỉ hiện tờ đang mở"><Square size={14} /><span>Từng trang</span></button>
                <button className={noteSheetViewMode === "continuous" ? "selected" : ""} onClick={() => setNoteSheetViewMode("continuous")} aria-pressed={noteSheetViewMode === "continuous"} title="Cuộn tất cả tờ trong Page"><Rows3 size={14} /><span>Liên tục</span></button>
              </div>
              <div className="note-view-control" aria-label="Tỷ lệ xem trang note">
                <button onClick={() => setNoteViewZoom(noteZoom - .1)} disabled={noteZoom <= .5} aria-label="Thu nhỏ trang note" title="Thu nhỏ trang note"><Minus size={14} /></button>
                <select value={noteZoomPercent} onChange={(event) => setNoteViewZoom(Number(event.target.value) / 100)} aria-label="Chọn tỷ lệ xem trang note" title="Tỷ lệ xem trang note">
                  {!NOTE_ZOOM_PRESETS.includes(noteZoomPercent) && <option value={noteZoomPercent}>{noteZoomPercent}%</option>}
                  {NOTE_ZOOM_PRESETS.map((percent) => <option key={percent} value={percent}>{percent}%</option>)}
                </select>
                <button onClick={() => setNoteViewZoom(noteZoom + .1)} disabled={noteZoom >= 2} aria-label="Phóng to trang note" title="Phóng to trang note"><Plus size={14} /></button>
                <button onClick={fitNoteToView} aria-label="Vừa chiều rộng khung note" title="Vừa chiều rộng khung note"><Maximize2 size={14} /></button>
              </div>
              <div className="toolbar-cluster history-cluster">
                <button className="icon-button compact" aria-label="Hoàn tác" onClick={undo} disabled={!(strokeHistory[activeNote.id]?.undo.length)}><Undo2 size={19} /></button>
                <button className="icon-button compact" aria-label="Làm lại" onClick={redo} disabled={!(strokeHistory[activeNote.id]?.redo.length)}><Redo2 size={19} /></button>
              </div>
              <button className={`paper-button ${notePanel === "paper" ? "active" : ""}`} onClick={() => setNotePanel((panel) => panel === "paper" ? null : "paper")} aria-expanded={notePanel === "paper"}><NotebookTabs size={17} /><span>Giấy</span><ChevronDown size={11} /></button>
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster note-tool-cluster">
                {tools.map(({ id, label, icon: Icon }) => {
                  const hasPanel = ["pen", "highlight", "shape", "text", "textbox", "callout"].includes(id);
                  const shortLabel = id === "text" ? "Type" : id === "textbox" ? "Text box" : id === "callout" ? "Callout" : label;
                  return <button key={id} className={`tool-button ${hasPanel ? "expandable" : ""} ${activeTool === id ? "active show-label" : ""}`} onClick={() => chooseNoteTool(id)} aria-label={label} title={label} aria-expanded={hasPanel ? ((id === "pen" || id === "highlight") ? notePanel === "ink" : (id === "text" || id === "textbox" || id === "callout") ? notePanel === "text" : notePanel === id) : undefined}><Icon size={20} />{activeTool === id && <span className="tool-label">{shortLabel}</span>}{hasPanel && <ChevronDown className="tool-chevron" size={11} />}</button>;
                })}
              </div>
              <span className="toolbar-spacer" />
              <div className={`toolbar-cluster object-layer-cluster ${selectedExcerpt ? "has-selection" : ""}`} aria-label="Sắp xếp lớp đối tượng">
                <span className="layer-control-label" title={selectedExcerpt ? "Đối tượng đang chọn" : "Chọn một khung chữ hoặc ảnh để sắp xếp lớp"}><Layers2 size={16} /><span>Lớp</span></span>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === 0} onClick={() => shiftExcerptLayer("back")} aria-label="Đưa đối tượng xuống dưới cùng" title="Xuống dưới cùng"><SendToBack size={17} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === 0} onClick={() => shiftExcerptLayer("backward")} aria-label="Đưa đối tượng xuống một lớp" title="Đưa xuống một lớp"><ChevronDown size={18} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === activeNote.excerpts.length - 1} onClick={() => shiftExcerptLayer("forward")} aria-label="Đưa đối tượng lên một lớp" title="Đưa lên một lớp"><ChevronUp size={18} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === activeNote.excerpts.length - 1} onClick={() => shiftExcerptLayer("front")} aria-label="Đưa đối tượng lên trên cùng" title="Lên trên cùng"><BringToFront size={17} /></button>
              </div>
            </div>
            {notePanel === "text" && <>
              <div className="toolbar-scroll-shell">
                <button className="toolbar-scroll-button scroll-left" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textCharacterToolbarRef.current, -1)} aria-label="Cuộn công cụ sang trái"><ChevronLeft size={15} /></button>
                <div ref={textCharacterToolbarRef} className="toolbar-row text-command-row text-character-row" onWheel={scrollTextToolbarWithWheel} aria-label="Định dạng ký tự">
                  <span className="type-row-label">Type</span>
                  <select className="word-font-select" value={textToolbar.font} style={{ fontFamily: selectedToolbarFont.family }} onChange={(event) => applyTextCommand("font", event.target.value)} aria-label="Font chữ">{TEXT_FONTS.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.label}</option>)}</select>
                  <select className="word-size-select" value={textToolbar.size} onChange={(event) => applyTextCommand("size", Number(event.target.value))} aria-label="Cỡ chữ">{[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72].map((size) => <option key={size} value={size}>{size}</option>)}</select>
                  <div className="text-style-buttons compact-style-buttons" aria-label="Kiểu chữ">
                    <button className={textToolbar.bold ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("bold")} title="Đậm"><Bold size={16} /></button>
                    <button className={textToolbar.italic ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("italic")} title="Nghiêng"><Italic size={16} /></button>
                    <button className={textToolbar.underline ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("underline")} title="Gạch chân"><Underline size={16} /></button>
                    <button className={textToolbar.strike ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("strike")} title="Gạch ngang"><Strikethrough size={16} /></button>
                    <button className={textToolbar.subscript ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("subscript")} title="Chỉ số dưới"><Subscript size={16} /></button>
                    <button className={textToolbar.superscript ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("superscript")} title="Chỉ số trên"><Superscript size={16} /></button>
                  </div>
                  <span className="toolbar-mini-divider" />
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "textColor" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("textColor", event.currentTarget)} title="Màu chữ" aria-label="Mở bảng màu chữ" aria-expanded={textInsertPopover === "textColor"}><span className="color-letter" style={{ borderBottomColor: textToolbar.color === "auto" ? "#26343a" : textToolbar.color }}>A</span><ChevronDown size={10} /></button>
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "backgroundColor" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("backgroundColor", event.currentTarget)} title="Màu nền chữ" aria-label="Mở bảng màu nền chữ" aria-expanded={textInsertPopover === "backgroundColor"}><PaintBucket size={15} /><i className={`current-fill-sample ${textToolbar.backgroundColor === "transparent" ? "transparent" : ""}`} style={textToolbar.backgroundColor === "transparent" ? undefined : { background: textToolbar.backgroundColor }} /><ChevronDown size={10} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("clear")} title="Xóa định dạng"><RemoveFormatting size={16} /></button>
                </div>
                <button className="toolbar-scroll-button scroll-right" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textCharacterToolbarRef.current, 1)} aria-label="Cuộn công cụ sang phải"><ChevronRight size={15} /></button>
              </div>
              <div className="toolbar-scroll-shell">
                <button className="toolbar-scroll-button scroll-left" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textParagraphToolbarRef.current, -1)} aria-label="Cuộn công cụ sang trái"><ChevronLeft size={15} /></button>
                <div ref={textParagraphToolbarRef} className="toolbar-row text-command-row text-paragraph-row" onWheel={scrollTextToolbarWithWheel} aria-label="Định dạng đoạn, ký hiệu và bảng">
                  <div className="text-style-buttons compact-style-buttons" aria-label="Căn chữ"><button className={textToolbar.align === "left" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("left")} title="Căn trái"><AlignLeft size={16} /></button><button className={textToolbar.align === "center" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("center")} title="Căn giữa"><AlignCenter size={16} /></button><button className={textToolbar.align === "right" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("right")} title="Căn phải"><AlignRight size={16} /></button><button className={textToolbar.align === "justify" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("justify")} title="Căn đều hai bên"><AlignJustify size={16} /></button></div>
                  <label className="word-select-with-icon" title="Khoảng cách dòng"><Rows3 size={15} /><select value={textToolbar.lineHeight} onChange={(event) => applyTextLineHeight(event.target.value as TextLineHeight)} aria-label="Khoảng cách dòng"><option value="1">1,0</option><option value="1.15">1,15</option><option value="1.5">1,5</option><option value="1.8">1,8</option><option value="2">2,0</option></select></label>
                  <button className={`word-command-button list-menu-trigger ${textToolbar.unordered || textInsertPopover === "bullets" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("bullets", event.currentTarget)} title="Thư viện dấu đầu dòng" aria-label="Mở thư viện dấu đầu dòng" aria-expanded={textInsertPopover === "bullets"}><List size={16} /><ChevronDown size={10} /></button>
                  <button className={`word-command-button list-menu-trigger ${textToolbar.ordered || textInsertPopover === "numbering" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("numbering", event.currentTarget)} title="Thư viện đánh số" aria-label="Mở thư viện đánh số" aria-expanded={textInsertPopover === "numbering"}><ListOrdered size={16} /><ChevronDown size={10} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => changeListLevel("decrease")} title="Giảm một cấp danh sách" aria-label="Giảm một cấp danh sách"><IndentDecrease size={16} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => changeListLevel("increase")} title="Tăng một cấp danh sách" aria-label="Tăng một cấp danh sách"><IndentIncrease size={16} /></button>
                  <span className="toolbar-mini-divider" />
                  <button className={`word-command-button labeled ${textInsertPopover === "symbols" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("symbols", event.currentTarget)} title="Chèn ký hiệu"><Omega size={16} /><span>Ký hiệu</span></button>
                  <button className={`word-command-button labeled ${textInsertPopover === "equation" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("equation", event.currentTarget)} title="Chèn công thức"><Sigma size={16} /><span>Công thức</span></button>
                  <button className={`word-command-button labeled ${textInsertPopover === "table" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("table", event.currentTarget)} title="Chèn bảng"><Table2 size={16} /><span>Bảng</span></button>
                  <button className={`word-command-button line-menu-trigger ${textInsertPopover === "tableLines" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("tableLines", event.currentTarget)} title="Kiểu đường kẻ bảng" aria-label="Mở thư viện đường kẻ bảng" aria-expanded={textInsertPopover === "tableLines"}><Table2 size={14} /><i style={{ borderTopStyle: tableBorder.style, borderTopWidth: `${Math.max(1, Math.min(tableBorder.width, 4))}px`, borderTopColor: tableBorder.color }} /><ChevronDown size={10} /></button>
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "textBoxStyle" ? "selected" : ""}`} disabled={!selectedTextBoxAppearance} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("textBoxStyle", event.currentTarget)} title={selectedTextBoxAppearance ? "Viền và nền hộp chữ" : "Chọn một hộp chữ để chỉnh viền và nền"} aria-label="Chỉnh viền và nền hộp chữ" aria-expanded={textInsertPopover === "textBoxStyle"}><ScanText size={15} /><i className={`current-fill-sample ${selectedTextBoxAppearance?.backgroundColor === "transparent" ? "transparent" : ""}`} style={!selectedTextBoxAppearance || selectedTextBoxAppearance.backgroundColor === "transparent" ? undefined : { background: selectedTextBoxAppearance.backgroundColor }} /><ChevronDown size={10} /></button>
                  <span className="selection-format-hint">Bôi chọn chữ để định dạng cục bộ</span>
                </div>
                <button className="toolbar-scroll-button scroll-right" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textParagraphToolbarRef.current, 1)} aria-label="Cuộn công cụ sang phải"><ChevronRight size={15} /></button>
              </div>
            </>}
          </div>

          {notePanel === "text" && textInsertPopover === "bullets" && (
            <div className="text-insert-popover list-library-popover bullet-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện dấu đầu dòng">
              <div className="list-library-grid">
                {BULLET_STYLES.map((option) => <button key={option.id} className={textToolbar.bulletStyle === option.id ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyBulletStyle(option.id)} title={option.label} aria-label={option.label}><span>{option.glyph}</span></button>)}
              </div>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "numbering" && (
            <div className="text-insert-popover list-library-popover numbering-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện đánh số">
              <div className="numbering-library-grid">
                {NUMBERING_STYLES.map((option) => <button key={option.id} className={textToolbar.numberingStyle === option.id ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyNumberingStyle(option.id)} title={option.label} aria-label={option.label}><span>{option.sample}</span></button>)}
              </div>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "textColor" && (
            <div className="text-insert-popover color-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Màu chữ">
              <header><strong>Màu chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="popover-color-grid">
                <button className="palette-auto-color" onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("color", activeNote.paper.color === "dark" ? "#edf3f4" : "#26343a"); setTextInsertPopover(null); }} title="Màu tự động" aria-label="Màu chữ tự động"><span>A</span></button>
                {TEXT_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${textToolbar.color === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("color", color); setTextInsertPopover(null); }} title={color} aria-label={`Màu chữ ${color}`} />)}
                <label className="popover-custom-color" title="Màu chữ tùy chỉnh"><input type="color" value={textToolbar.color === "auto" ? "#26343a" : textToolbar.color} onChange={(event) => { applyTextCommand("color", event.target.value); setTextInsertPopover(null); }} /><span>+</span></label>
              </div>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "backgroundColor" && (
            <div className="text-insert-popover color-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Màu nền chữ">
              <header><strong>Màu nền chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="popover-color-grid">
                {TEXT_BACKGROUND_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${textToolbar.backgroundColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("background", color); setTextInsertPopover(null); }} title={color === "transparent" ? "Không màu" : color} aria-label={color === "transparent" ? "Nền chữ trong suốt" : `Màu nền chữ ${color}`} />)}
                <label className="popover-custom-color" title="Màu nền chữ tùy chỉnh"><input type="color" value={textToolbar.backgroundColor === "transparent" ? "#fff2a8" : textToolbar.backgroundColor} onChange={(event) => { applyTextCommand("background", event.target.value); setTextInsertPopover(null); }} /><span>+</span></label>
              </div>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "tableLines" && (
            <div className="text-insert-popover line-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện đường kẻ bảng">
              <div className="line-library-list">
                {LINE_PRESETS.map((preset) => <button key={preset.id} className={tableBorder.style === preset.style && tableBorder.width === preset.width ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTableLinePreset(preset)} title={preset.label} aria-label={preset.label}><i className={preset.width === 0 ? "line-sample-none" : ""} style={preset.width === 0 ? undefined : { borderTopStyle: preset.style, borderTopWidth: `${preset.width}px`, borderTopColor: tableBorder.color }} /></button>)}
              </div>
              <div className="popover-color-strip" aria-label="Màu đường kẻ bảng">
                {BORDER_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${tableBorder.color === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateTableBorder({ color })} title={color === "transparent" ? "Không màu" : color} aria-label={color === "transparent" ? "Đường kẻ trong suốt" : `Màu đường kẻ ${color}`} />)}
                <label className="popover-custom-color" title="Màu đường kẻ tùy chỉnh"><input type="color" value={tableBorder.color === "transparent" ? "#60737d" : tableBorder.color} onChange={(event) => updateTableBorder({ color: event.target.value })} /><span>+</span></label>
              </div>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "textBoxStyle" && selectedTextBoxAppearance && (
            <div className="text-insert-popover text-box-style-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Viền và nền hộp chữ">
              <header><strong>Hộp chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="line-library-list">
                {LINE_PRESETS.map((preset) => <button key={preset.id} className={selectedTextBoxAppearance.borderStyle === preset.style && selectedTextBoxAppearance.borderWidth === preset.width ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ borderStyle: preset.style, borderWidth: preset.width })} title={preset.label} aria-label={preset.label}><i className={preset.width === 0 ? "line-sample-none" : ""} style={preset.width === 0 ? undefined : { borderTopStyle: preset.style, borderTopWidth: `${preset.width}px`, borderTopColor: selectedTextBoxAppearance.borderColor }} /></button>)}
              </div>
              <section className="appearance-color-section"><span>Viền</span><div className="popover-color-strip">{BORDER_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${selectedTextBoxAppearance.borderColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ borderColor: color })} title={color === "transparent" ? "Viền trong suốt" : color} aria-label={color === "transparent" ? "Viền trong suốt" : `Màu viền ${color}`} />)}<label className="popover-custom-color" title="Màu viền tùy chỉnh"><input type="color" value={selectedTextBoxAppearance.borderColor === "transparent" ? "#60737d" : selectedTextBoxAppearance.borderColor} onChange={(event) => updateSelectedTextBoxAppearance({ borderColor: event.target.value })} /><span>+</span></label></div></section>
              <section className="appearance-color-section"><span>Nền</span><div className="popover-color-strip">{TEXT_BOX_BACKGROUND_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${selectedTextBoxAppearance.backgroundColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ backgroundColor: color })} title={color === "transparent" ? "Nền trong suốt" : color} aria-label={color === "transparent" ? "Nền hộp chữ trong suốt" : `Màu nền hộp chữ ${color}`} />)}<label className="popover-custom-color" title="Màu nền tùy chỉnh"><input type="color" value={selectedTextBoxAppearance.backgroundColor === "transparent" ? "#ffffff" : selectedTextBoxAppearance.backgroundColor} onChange={(event) => updateSelectedTextBoxAppearance({ backgroundColor: event.target.value })} /><span>+</span></label></div></section>
            </div>
          )}

          {notePanel === "text" && textInsertPopover === "symbols" && <div className="text-insert-popover symbol-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn ký hiệu"><header><strong>Ký hiệu</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>{SYMBOL_GROUPS.map((group) => <section key={group.label}><label>{group.label}</label><div>{group.symbols.map((symbol) => <button key={symbol} onPointerDown={(event) => event.preventDefault()} onClick={() => insertTextAtSelection(symbol)}>{symbol}</button>)}</div></section>)}</div>}

          {notePanel === "text" && textInsertPopover === "equation" && <div className="text-insert-popover equation-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn công thức">
            <header><strong>Công thức</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
            <div className="equation-template-grid">{EQUATION_TEMPLATES.map((option) => <button key={option.id} className={equationTemplate === option.id ? "selected" : ""} onClick={() => { setEquationTemplate(option.id); setEquationParts([...option.defaults]); if (option.id === "plain") setEquationDraft(option.defaults[0]); }}><b>{option.sample}</b><span>{option.label}</span></button>)}</div>
            {equationTemplate === "plain" ? <label className="equation-input-label">Nhập công thức<input value={equationDraft} spellCheck={false} onChange={(event) => setEquationDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") insertEquation(); }} autoFocus /></label> : <div className="equation-field-grid">{equationTemplateById(equationTemplate).fields.map((label, index) => <label key={`${equationTemplate}-${label}`}>{label}<input value={equationParts[index] ?? ""} spellCheck={false} onChange={(event) => setEquationParts((current) => current.map((part, partIndex) => partIndex === index ? event.target.value : part))} /></label>)}</div>}
            <div className="equation-preview" aria-label="Xem trước công thức" dangerouslySetInnerHTML={{ __html: equationMarkup(equationTemplate, equationTemplate === "plain" ? [equationDraft] : equationParts) }} />
            <div className="equation-presets">{EQUATION_PRESETS.map((equation) => <button key={equation} onClick={() => { setEquationTemplate("plain"); setEquationDraft(equation); setEquationParts([equation]); }}>{equation}</button>)}</div>
            <button className="insert-confirm-button" onClick={() => insertEquation()}><Sigma size={15} /> Chèn công thức</button>
          </div>}

          {notePanel === "text" && textInsertPopover === "table" && <div className="text-insert-popover table-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn bảng"><header><strong>Chèn bảng</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header><div className="table-size-controls"><label>Hàng<input type="number" min="1" max="12" value={tableRows} onChange={(event) => setTableRows(Math.max(1, Math.min(12, Number(event.target.value))))} /></label><span>×</span><label>Cột<input type="number" min="1" max="10" value={tableColumns} onChange={(event) => setTableColumns(Math.max(1, Math.min(10, Number(event.target.value))))} /></label></div><div className="table-preview-grid" style={{ gridTemplateColumns: `repeat(${tableColumns}, 12px)` }} aria-hidden="true">{Array.from({ length: tableRows * tableColumns }, (_, index) => <i key={index} style={{ borderStyle: tableBorder.style, borderWidth: `${Math.min(tableBorder.width, 3)}px`, borderColor: tableBorder.color }} />)}</div><button className="insert-confirm-button" onClick={insertTable}><Table2 size={15} /> Chèn bảng {tableRows} × {tableColumns}</button></div>}

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
                <label>Dòng kẻ & bố cục</label>
                <div className="template-grid">
                  {PAPER_TEMPLATES.map((template) => <button key={template.id} className={activeNote.paper.template === template.id ? "selected" : ""} onClick={() => updatePaperTemplate(template.id)}><span className={`template-preview template-${template.id}`} /><b>{template.label}</b></button>)}
                </div>
                <p className="paper-template-help">Mẫu First Aid dùng đầu mục xanh, đường phân cách mảnh và dải tiêu đề tím–xanh; trang trống sẽ được tạo sẵn khung nội dung để điền.</p>
              </section>
              <section>
                <label>Màu giấy</label>
                <div className="paper-color-row">
                  {PAPER_COLORS.map((paperColor) => <button key={paperColor.id} className={activeNote.paper.color === paperColor.id ? "selected" : ""} onClick={() => updatePaper({ color: paperColor.id })} title={paperColor.label} aria-label={paperColor.label}><span style={{ background: paperColor.swatch }} />{activeNote.paper.color === paperColor.id && <Check size={13} />}</button>)}
                </div>
              </section>
            </div>
          )}

          <div className={`note-stage workspace-frame note-stage-${noteSheetViewMode} ${activeNoteHydrating ? "note-stage-hydrating" : ""}`} ref={noteStageRef} aria-busy={activeNoteHydrating || noteState.hydratingPageId === noteState.structure?.active.activePageId}>
            {activeNoteHydrating && <div className="note-hydration-status" role="status" aria-live="polite">Đang mở nội dung tờ…</div>}
            {noteSheetViewMode === "continuous" && continuousNotes.slice(0, activeSheetIndex).map((note, index) => <NoteSheetPreview
              key={note.id}
              note={note}
              sheetNumber={index + 1}
              zoom={noteZoom}
              loaded={Object.hasOwn(noteState.pageSheetContents, note.id) && !note.__mednoteLazyPage}
              onActivate={() => { void activateContinuousSheet(note.id); }}
              resolveSource={resolveExcerptSource}
            />)}
            {noteSheetViewMode === "continuous" && <div className="note-sheet-active-label" data-note-sheet-frame={activeNote.id} style={{ "--paper-max-width": `${basePaperMaxWidth}px`, "--note-view-zoom": noteZoom } as React.CSSProperties}><span>Tờ {activeSheetIndex + 1}</span><b>Đang chỉnh sửa</b></div>}
            <article data-note-page-id={activeNote.id} className={`note-paper interactive ${activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer") ? "typing" : ""} ${activeTool === "pointer" || activeTool === "text" || activeTool === "textbox" || activeTool === "callout" ? "object-mode" : ""} paper-${activeNote.paper.color} template-${activeNote.paper.template}`} style={{ ...paperStyle, pointerEvents: activeNoteHydrating ? "none" : undefined, opacity: activeNoteHydrating ? .72 : 1 }} onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".note-excerpt")) return;
              setSelectedExcerptId(null);
              if (!(event.target as HTMLElement).closest("[data-rich-editor-id]")) {
                activeTextEditorRef.current = null;
                savedTextRangeRef.current = null;
              }
              if (activeTool === "textbox") addTextBoxAt(event);
              if (activeTool === "callout") addCalloutAt(event);
            }}>
              <div className="paper-background" />
              <div className={`typed-layer ${activeNote.excerpts.length ? "has-excerpts" : ""}`} style={textLayerStyle}>
                <PageTitleEditor
                  key={`page-title:${activeLogicalPage?.id ?? activeNote.id}`}
                  pageId={activeLogicalPage?.id ?? ""}
                  title={activeLogicalPage?.title ?? activeNote.title}
                  className="note-title-input"
                  editable={Boolean(activeLogicalPage?.id) && (activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer"))}
                  placeholder="Nhập tiêu đề"
                  ariaLabel="Tiêu đề ghi chú"
                  onActivate={() => {
                    if (activeNote.paper.template === "first-aid" && activeTool === "pointer") {
                      setActiveTool("text");
                      setNotePanel("text");
                    }
                  }}
                  onError={(message) => setToast(message)}
                />
                <RichTextEditor key={`body:${activeNote.id}`} editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />
                <div className="note-excerpts" aria-label="Khung chữ và ảnh trên trang note">
                  {activeNote.excerpts.map((excerpt, index) => {
                    const selected = excerpt.id === selectedExcerptId;
                    const calloutTextMode = selected && excerpt.annotationKind === "callout" && activeTool === "text";
                    return <DraggableExcerpt key={excerpt.id} excerpt={excerpt} source={resolveExcerptSource(excerpt)} index={index} selected={selected} selectable={activeTool === "pointer" || activeTool === "text"} movable={activeTool === "pointer" || calloutTextMode || (selected && activeTool === "text" && excerpt.kind === "text")} editable={activeTool === "text" && selected && excerpt.kind === "text"} onSelect={setSelectedExcerptId} onMove={moveExcerpt} onEdit={editExcerpt} onTextActivate={activateTextEditor} onNormalizeTextInput={normalizeTextEditorInput} onOpenSource={openExcerptSource} onDelete={deleteExcerpt} />;
                  })}
                </div>
                {activeNote.citationPage && !activeNote.excerpts.length && <button className="citation-chip" onClick={() => { goToPage(activeNote.citationPage!); setToast(`Đã quay lại trang ${activeNote.citationPage}`); }}>Trang {activeNote.citationPage}</button>}
              </div>
              <InkCanvas key={activeNote.id} tool={activeTool} color={inkColor} width={activeTool === "highlight" ? highlighterWidth : inkWidth} penStyle={penStyle} shape={shapeKind} strokes={activeNote.strokes} onCommit={commitStrokes} />
              {activeTool === "text" && <div className="mode-hint">Nhập chữ hoặc sửa đoạn trích</div>}
              {activeTool === "textbox" && <div className="mode-hint">Bấm vị trí muốn đặt hộp chữ</div>}
              {activeTool === "callout" && <div className="mode-hint">Bấm đúng vị trí muốn callout chỉ tới</div>}
              {activeTool === "pointer" && activeNote.excerpts.length > 0 && <div className="mode-hint">Kéo đối tượng · kéo góc đổi cỡ · callout: kéo đầu mũi tên</div>}
            </article>
            <div className="paper-size">{selectedPaperSize.label} ({selectedPaperSize.dimensions}) · {activeNote.paper.orientation === "portrait" ? "Dọc" : "Ngang"} · {activeTool === "pointer" ? "Chọn đối tượng để di chuyển, đổi cỡ hoặc sắp xếp lớp" : activeTool === "text" ? "Nhập nội dung trang hoặc sửa trực tiếp đoạn chữ từ PDF" : activeTool === "textbox" ? "Bấm trên trang để tạo hộp chữ" : activeTool === "callout" ? "Bấm vị trí cần chú thích để tạo hộp callout có mũi tên" : activeTool === "lasso" ? "Khoanh quanh nét cần chọn" : activeTool === "eraser" ? "Lướt để tẩy đúng phần nét chạm vào" : "Dùng chuột hoặc bút cảm ứng để viết"}</div>
            {noteSheetViewMode === "continuous" && continuousNotes.slice(activeSheetIndex + 1).map((note, offset) => <NoteSheetPreview
              key={note.id}
              note={note}
              sheetNumber={activeSheetIndex + offset + 2}
              zoom={noteZoom}
              loaded={Object.hasOwn(noteState.pageSheetContents, note.id) && !note.__mednoteLazyPage}
              onActivate={() => { void activateContinuousSheet(note.id); }}
              resolveSource={resolveExcerptSource}
            />)}
          </div>
        </section>
        {showNoteSidebar && <aside className="note-navigation-host" aria-label="Điều hướng ghi chú"><NoteSidebar onRequestClose={() => setNoteSidebarVisibility(false)} /></aside>}
      </section>
    </main>
  );
}
