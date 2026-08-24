"use client";

import {
  Blend,
  BookOpen,
  Brush,
  Copy,
  Crop,
  Eraser,
  Hand,
  Highlighter,
  Lasso,
  Languages,
  MessageSquareText,
  MousePointer2,
  Move,
  NotebookTabs,
  PaintBucket,
  Pencil,
  PenLine,
  PenTool,
  RefreshCw,
  ScanText,
  Signature,
  Shapes,
  Square,
  Stamp,
  Strikethrough,
  TextSelect,
  TextCursorInput,
  Type,
  Underline,
  Volume2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfAnnotation, PdfCropResult, PdfMarkupAnnotation, PdfRect, PdfSelection, PdfTool } from "./pdf-domain";
import { PdfReaderController, zoomAroundAnchor } from "./pdf-reader-controller";
import {
  addPdfMarkup as addPdfMarkupCommand,
  deletePdfAnnotation as deletePdfAnnotationCommand,
  emptyPdfAnnotationHistory,
  redoPdfAnnotations as redoPdfAnnotationCommand,
  replacePdfPageAnnotations as replacePdfPageAnnotationCommand,
  undoPdfAnnotations as undoPdfAnnotationCommand,
  type PdfAnnotationHistory,
} from "./pdf-annotation-session";
import { DriveSyncConflictError, driveSyncService, type DriveAccount, type DriveRestoreResult, type DriveSyncSnapshot } from "./drive-sync-service";
import { cancelDriveAuthorization } from "./google-drive";
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
import { firstAidThemeInlineStyle, firstAidThemeVariables } from "./first-aid-theme";
import { firstAidDocumentFromLegacy, firstAidTemplateTransition, normalizeFirstAidDocument } from "./first-aid-block-model";
import { fitFirstAidImageLayout } from "./first-aid-image-placement";
import { AppTopBar } from "./ui/app-top-bar";
import { DrivePanel } from "./ui/drive-panel";
import { LibraryPanel } from "./ui/library-panel";
import { PdfNavigationRail } from "./ui/pdf-navigation-rail";
import { ReaderPane } from "./ui/pdf-reader-pane";
import { NotePane } from "./ui/note-pane";
import { NoteNavigationHost } from "./ui/note-navigation-host";
import { SplitDivider } from "./ui/split-divider";
import { WorkspaceShell } from "./ui/workspace-shell";
import type {
  BulletStyle,
  EquationTemplate,
  FirstAidCropPlacement,
  FirstAidCropResult,
  FirstAidCropTarget,
  NotePanel,
  NoteSheetViewMode,
  NumberingStyle,
  PdfHistory,
  PdfOutlineEntry,
  PdfPanel,
  PdfRailTab,
  SearchResult,
  StickerPresetId,
  TableBorderSettings,
  TextInsertPopover,
  TextLineHeight,
  TextToolbarState,
  Tool,
} from "./ui/ui-contracts";
import { noteRichTextController } from "./note-rich-text-controller";
import { NoteInkSession } from "./note-ink-session";
import { useNoteToolbar } from "./use-note-toolbar";
import { useNoteZoomController } from "./note-zoom-controller";
import { noteStore, useNoteStoreSnapshot } from "./note-store";
import { ordered } from "./note-domain";
import {
  DEFAULT_CALLOUT_APPEARANCE, DEFAULT_TEXT, DEFAULT_TEXT_BOX_APPEARANCE,
  createBlankPage, defaultExcerptLayout, escapeHtml,
  normalizeExcerptAppearance, normalizeText,
  notePageFromSheet, notePageToSheetContent, notebookFromStructure, plainTextToRichHtml,
  type ExcerptAppearance, type ExcerptLayout, type NoteExcerpt, type Notebook,
  type NotePage, type NotePageContentPatch, type PaperColor, type PaperSettings, type PaperSize,
  type PaperTemplate, type PenStyle, type ShapeKind, type Stroke, type TableBorderStyle, type TextAlign,
  type TextFont,
} from "./note-runtime-adapter";
import {
  DEFAULT_READER, NOTE_RUNTIME_WORKSPACE_ID, createDemoWorkspace,
  normalizeReader, type ReaderState,
  type WorkspaceItem, type WorkspaceMode,
} from "./document-runtime-adapter";

type DictionaryLookupState = {
  status: "idle" | "loading" | "ready" | "error";
  sourceText: string;
  result: EnglishVietnameseLookup | null;
  error: string | null;
};

const GOOGLE_CLIENT_ID = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const DESKTOP_GOOGLE_CLIENT_ID_KEY = "mednote-google-desktop-client-id";
const DRIVE_REMOTE_REVISION_KEY_PREFIX = "mednote-drive-remote-revision-v1:";
const IS_DESKTOP_APP = typeof window !== "undefined" && Boolean(window.mednoteDesktop?.isDesktop);
const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const NOTE_SHEET_VIEW_KEY = "mednote-note-sheet-view-v1";
const NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-hidden";
const LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY = "mednote-note-sidebar-v6-hidden";
const NOTE_ZOOM_PRESETS = [50, 60, 70, 75, 80, 85, 90, 100, 110, 120, 125, 130, 140, 150, 175, 200];

function storedDriveRevision(emailAddress: string) {
  try { return localStorage.getItem(`${DRIVE_REMOTE_REVISION_KEY_PREFIX}${emailAddress.trim().toLowerCase()}`); } catch { return null; }
}

function persistDriveRevision(emailAddress: string, revision: string) {
  try { localStorage.setItem(`${DRIVE_REMOTE_REVISION_KEY_PREFIX}${emailAddress.trim().toLowerCase()}`, revision); } catch { /* revision persistence is best effort */ }
}

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

const STICKER_PRESETS: { id: StickerPresetId; label: string; description: string; width: number; height: number; rotation: number }[] = [
  { id: "classic-yellow", label: "Sticky vàng", description: "Giấy note cổ điển, góc gấp", width: .30, height: .17, rotation: -1 },
  { id: "tape-pink", label: "Tape hồng", description: "Note pastel có băng dính phía trên", width: .31, height: .17, rotation: 1 },
  { id: "pin-mint", label: "Ghim xanh", description: "Thẻ xanh bạc hà có ghim tròn", width: .29, height: .16, rotation: -.5 },
  { id: "tab-blue", label: "Tab xanh", description: "Thẻ xanh có nhãn tab nổi", width: .31, height: .16, rotation: 0 },
  { id: "clinical-card", label: "Clinical card", description: "Thẻ trắng viền teal cho ý chính", width: .33, height: .17, rotation: 0 },
  { id: "high-yield", label: "High-yield", description: "Sticker vàng nhấn mạnh điểm cần nhớ", width: .32, height: .16, rotation: 0 },
];

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

const initialPages: NotePage[] = [createBlankPage()];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const lastWorkspacePaneRef = useRef<"reader" | "note">("reader");
  const lastReaderFocusRef = useRef<HTMLElement | null>(null);
  const lastNoteFocusRef = useRef<HTMLElement | null>(null);
  const pendingWorkspaceFocusRef = useRef<"reader" | "note" | null>(null);
  const [sourceFocus, setSourceFocus] = useState<{ documentId: string; page: number; rect: PdfRect } | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createDemoWorkspace(initialPages)]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("demo-workspace");
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const noteInkSession = useMemo(() => new NoteInkSession(60), []);
  const [inkHistoryVersion, setInkHistoryVersion] = useState(0);
  const pdfReader = useMemo(() => new PdfReaderController({
    readBlob: async (documentId) => (await documentLibrary.readPdf(documentId))?.blob ?? null,
  }), []);
  const pdfSearchAbortRef = useRef<AbortController | null>(null);
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
  const [showPdfRail, setShowPdfRail] = useState(true);
  const [showNoteSidebar, setShowNoteSidebar] = useState(() => {
    try {
      const preference = localStorage.getItem(NOTE_SIDEBAR_PREFERENCE_KEY);
      return (preference ?? localStorage.getItem(LEGACY_NOTE_SIDEBAR_PREFERENCE_KEY)) !== "1";
    } catch { return true; }
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
  const richTextController = noteRichTextController;
  const activeTextEditorRef = richTextController.activeEditorRef;
  const savedTextRangeRef = richTextController.savedRangeRef;
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
  const [driveUser, setDriveUser] = useState<DriveAccount | null>(null);
  const [driveStatus, setDriveStatus] = useState<"disconnected" | "connecting" | "connected" | "syncing" | "error">("disconnected");
  const [driveReady, setDriveReady] = useState(false);
  const [driveAutoSync, setDriveAutoSync] = useState(true);
  const [driveLastSyncedAt, setDriveLastSyncedAt] = useState<number | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const desktopDriveResumeClientRef = useRef<string | null>(null);
  const driveRemoteRevisionRef = useRef<string | null>(null);
  const driveObservedRevisionRef = useRef<string | null>(null);
  const driveUserRef = useRef<DriveAccount | null>(null);

  workspacesRef.current = workspaces;
  activeWorkspaceIdRef.current = activeWorkspaceId;
  workspaceModeRef.current = workspaceMode;
  const localSavedAtRef = useRef(Date.now());

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
  const hasActiveNote = Boolean(noteState.structure?.active.activeSheetId);
  const selectedExcerptIndex = activeNote.excerpts.findIndex((excerpt) => excerpt.id === selectedExcerptId);
  const selectedExcerpt = selectedExcerptIndex >= 0 ? activeNote.excerpts[selectedExcerptIndex] : null;
  const selectedTextBoxAppearance = selectedExcerpt?.kind === "text" ? normalizeExcerptAppearance(selectedExcerpt.appearance) : null;
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
    richTextController.execCommand("styleWithCSS", false, "true");
    if (command === "font") {
      const font = TEXT_FONTS.find((option) => option.id === value) ?? TEXT_FONTS[0];
      richTextController.execCommand("fontName", false, font.family);
    } else if (command === "size") {
      const size = Number(value);
      pendingFontSizeRef.current.set(target.id, size);
      richTextController.execCommand("fontSize", false, "7");
      normalizeTextEditorInput(target.id, target.editor);
    } else if (command === "color") {
      richTextController.execCommand("foreColor", false, String(value));
    } else if (command === "background") {
      richTextController.execCommand("backColor", false, String(value));
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
      richTextController.execCommand(browserCommand, false);
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
      richTextController.execCommand("formatBlock", false, "div");
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
      richTextController.execCommand("insertUnorderedList", false);
      finishTextCommand(target, "Đã bỏ dấu đầu dòng");
      setTextInsertPopover(null);
      return;
    }
    if (bulletStyle === "none") {
      setTextInsertPopover(null);
      return;
    }
    if (!lists.length) {
      richTextController.execCommand("insertUnorderedList", false);
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
      richTextController.execCommand("insertOrderedList", false);
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
    richTextController.execCommand(direction === "increase" ? "indent" : "outdent", false);
    finishTextCommand(target, direction === "increase" ? "Đã tăng một cấp danh sách" : "Đã giảm một cấp danh sách");
  }, [finishTextCommand, restoreTextSelection]);

  const insertTextAtSelection = useCallback((text: string, message = "Đã chèn ký hiệu") => {
    const target = restoreTextSelection();
    if (!target) {
      setToast("Bấm vào vị trí cần chèn trước");
      return;
    }
    richTextController.execCommand("insertText", false, text);
    finishTextCommand(target, message);
  }, [finishTextCommand, restoreTextSelection]);

  const insertEquation = useCallback(() => {
    const target = restoreTextSelection();
    const parts = equationTemplate === "plain" ? [equationDraft] : equationParts;
    if (!target || !parts.some((part) => part.trim())) {
      setToast(target ? "Nhập công thức trước khi chèn" : "Bấm vào vị trí cần chèn công thức trước");
      return;
    }
    richTextController.execCommand("insertHTML", false, `${equationMarkup(equationTemplate, parts)}&nbsp;`);
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
    richTextController.execCommand("insertHTML", false, `<table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table><div><br></div>`);
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

  const goToPageFromRail = (page: number) => {
    goToPage(page);
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
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

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) setShowPdfRail(false);
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
    if (session) setOutline(session.outline);
  }), [pdfReader]);

  useEffect(() => () => {
    pdfSearchAbortRef.current?.abort();
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
    if (currentPdfDocument) return;
    setOutline(activeDocument || activeWorkspace.kind !== "demo" ? [] : [
      { title: "3.4 Diabetic Neuropathy", page: 123, depth: 0 },
      { title: "Introduction", page: 123, depth: 1 },
      { title: "Pathophysiology", page: 126, depth: 1 },
      { title: "Clinical features", page: 127, depth: 1 },
    ]);
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
        Object.assign(layout, fitFirstAidImageLayout(cropTarget.placement, aspectRatio, paperWidth, paperHeight));
      } else {
        layout.height = Math.min(.72, Math.max(.04, layout.width * (paperWidth / paperHeight) / aspectRatio));
      }
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

  const addFirstAidImage = async ({ blob, name, aspectRatio, placement }: { blob: Blob; name: string; aspectRatio: number; placement: FirstAidCropPlacement }) => {
    const assetId = uid("note-image");
    try {
      await localBinaryStorage.saveAsset(assetId, blob);
      const paper = PAPER_SIZES[activeNote.paper.size];
      const paperWidth = activeNote.paper.orientation === "portrait" ? paper.width : paper.height;
      const paperHeight = activeNote.paper.orientation === "portrait" ? paper.height : paper.width;
      const layout = defaultExcerptLayout(activeNote.excerpts.length, "image");
      layout.aspectRatio = Math.max(.01, aspectRatio);
      Object.assign(layout, fitFirstAidImageLayout(placement, layout.aspectRatio, paperWidth, paperHeight));
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

  const addSticker = (presetId: StickerPresetId) => {
    const preset = STICKER_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const slot = activeNote.excerpts.length % 6;
    const x = Math.min(1 - preset.width - .03, .13 + (slot % 3) * .045);
    const y = Math.min(1 - preset.height - .04, .16 + (slot % 4) * .055);
    const excerpt: NoteExcerpt = {
      id: uid("sticker"),
      kind: "text",
      sourceKind: "manual",
      text: "",
      richText: "",
      stickerStyle: preset.id,
      createdAt: Date.now(),
      layout: { x, y, width: preset.width, height: preset.height, contentScale: 1, rotation: preset.rotation, opacity: 1, autoFit: false },
      appearance: { borderStyle: "solid", borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent" },
    };
    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });
    setSelectedExcerptId(excerpt.id);
    setActiveTool("text");
    setNotePanel("text");
    setTextInsertPopover(null);
    setToast(`Đã chèn ${preset.label} — nhập chữ trực tiếp, dùng Chọn để kéo và đổi kích thước`);
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

  const currentDriveSnapshot = (): DriveSyncSnapshot => ({
    workspaces: workspacesRef.current,
    activeWorkspaceId: activeWorkspaceIdRef.current,
    readerShare,
    workspaceMode: workspaceModeRef.current,
    noteZoom,
    savedAt: localSavedAtRef.current,
  });

  const recordDriveRevision = (revision: string) => {
    driveRemoteRevisionRef.current = revision;
    driveObservedRevisionRef.current = revision;
    const account = driveUserRef.current;
    if (account) persistDriveRevision(account.emailAddress, revision);
  };

  const applyDriveRestore = (result: DriveRestoreResult) => {
    const { snapshot } = result;
    workspacesRef.current = snapshot.workspaces;
    activeWorkspaceIdRef.current = snapshot.activeWorkspaceId;
    workspaceModeRef.current = snapshot.workspaceMode;
    localSavedAtRef.current = snapshot.savedAt;
    setWorkspaces(snapshot.workspaces);
    setActiveWorkspaceId(snapshot.activeWorkspaceId);
    setReaderShare(snapshot.readerShare);
    setWorkspaceMode(snapshot.workspaceMode);
    setNoteZoom(snapshot.noteZoom);
  };

  const syncToDrive = async (token = driveToken, silent = false) => {
    if (!token) return false;
    setDriveStatus("syncing");
    setDriveError(null);
    if (!silent) setToast("Đang lưu toàn bộ dữ liệu lên Google Drive…");
    try {
      let expectedRemoteRevision = driveRemoteRevisionRef.current;
      if (!silent) {
        const inspection = await driveSyncService.inspectRemote(token);
        driveObservedRevisionRef.current = inspection.remoteRevision;
        if (inspection.remoteRevision !== driveRemoteRevisionRef.current
          && !window.confirm("Bản lưu Drive đã thay đổi kể từ lần đồng bộ gần nhất. Lưu bản trên thiết bị này sẽ ghi đè thay đổi đó. Tiếp tục?")) {
          setDriveStatus("connected");
          setToast("Đã giữ nguyên bản lưu hiện có trên Google Drive");
          return false;
        }
        expectedRemoteRevision = inspection.remoteRevision;
      }
      const result = await driveSyncService.sync(token, currentDriveSnapshot(), { expectedRemoteRevision });
      localSavedAtRef.current = result.snapshot.savedAt;
      recordDriveRevision(result.remoteRevision);
      setDriveReady(true);
      setDriveLastSyncedAt(result.snapshot.savedAt);
      setDriveStatus("connected");
      if (!silent) setToast("Đã đồng bộ đầy đủ lên Google Drive");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đồng bộ Google Drive";
      if (error instanceof DriveSyncConflictError) setDriveReady(false);
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Lỗi Drive: ${message}`);
      return false;
    }
  };

  const restoreFromDrive = async (token = driveToken, askBeforeReplace = true) => {
    if (!token || driveSyncService.isBusy()) return false;
    if (askBeforeReplace && hasMeaningfulLocalData() && !window.confirm("Tải dữ liệu từ Google Drive sẽ thay thế workspace đang có trên thiết bị này. Tiếp tục?")) return false;
    setDriveStatus("syncing");
    setDriveError(null);
    setToast("Đang tải dữ liệu từ Google Drive…");
    try {
      const result = await driveSyncService.restore(token);
      applyDriveRestore(result);
      recordDriveRevision(result.remoteRevision);
      setDriveReady(true);
      setDriveLastSyncedAt(result.snapshot.savedAt);
      setDriveStatus("connected");
      const source = result.sourceVersion === "v2" ? "thư viện v2" : "bản lưu v1";
      setToast(result.missingFiles
        ? `Đã khôi phục ${source}; thiếu ${result.missingFiles} tệp trên Drive`
        : `Đã khôi phục đầy đủ ${source} từ Google Drive`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể tải dữ liệu từ Google Drive";
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Lỗi Drive: ${message}`);
      return false;
    }
  };

  const resumeDesktopDrive = async (announce = false) => {
    const clientId = desktopGoogleClientId.trim();
    if (!IS_DESKTOP_APP || !clientId.endsWith(".apps.googleusercontent.com") || driveSyncService.isBusy()) return false;
    setDriveStatus("connecting");
    setDriveError(null);
    try {
      const connection = await driveSyncService.resume({ clientId });
      if (!connection) {
        setDriveStatus("disconnected");
        return false;
      }
      const storedRevision = storedDriveRevision(connection.user.emailAddress);
      driveUserRef.current = connection.user;
      driveRemoteRevisionRef.current = storedRevision;
      driveObservedRevisionRef.current = connection.remote.remoteRevision;
      setDriveToken(connection.token);
      setDriveUser(connection.user);
      const revisionMatches = storedRevision === connection.remote.remoteRevision
        && (storedRevision !== null || !connection.remote.hasBackup);
      setDriveReady(revisionMatches);
      setDriveStatus("connected");
      if (!revisionMatches) {
        setToast("Drive đã thay đổi hoặc chưa có mốc đồng bộ — chọn tải lên hoặc khôi phục trước khi bật tự động đồng bộ");
      } else if (announce) setToast("Đã khôi phục kết nối Google Drive");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể duy trì kết nối Google Drive";
      setDriveError(message);
      setDriveStatus("error");
      if (announce) setToast(`Lỗi Drive: ${message}`);
      return false;
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
      desktopDriveResumeClientRef.current = clientId;
    }
    setDriveStatus("connecting");
    setDriveError(null);
    try {
      const connection = await driveSyncService.connect({
        clientId,
        clientSecret: IS_DESKTOP_APP ? desktopGoogleClientSecret.trim() : "",
      });
      if (IS_DESKTOP_APP) setDesktopGoogleClientSecret("");
      driveUserRef.current = connection.user;
      driveRemoteRevisionRef.current = storedDriveRevision(connection.user.emailAddress);
      driveObservedRevisionRef.current = connection.remote.remoteRevision;
      setDriveToken(connection.token);
      setDriveUser(connection.user);
      setDriveStatus("connected");
      if (connection.remote.hasBackup && !hasMeaningfulLocalData()) {
        await restoreFromDrive(connection.token, false);
      } else if (!connection.remote.hasBackup) {
        await syncToDrive(connection.token);
      } else {
        setDriveReady(false);
        setToast("Drive đã có dữ liệu — chọn tải lên hoặc khôi phục");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kết nối Google Drive";
      if (message === "Đã hủy kết nối Google Drive") {
        setDriveStatus("disconnected");
        setDriveError(null);
        setToast(message);
        return;
      }
      setDriveError(message);
      setDriveStatus("error");
      setToast(`Không thể kết nối Drive: ${message}`);
    }
  };

  const cancelDriveConnection = async () => {
    if (IS_DESKTOP_APP) await cancelDriveAuthorization();
    setDriveStatus("disconnected");
    setDriveError(null);
    setToast("Đã hủy kết nối Google Drive");
  };

  const disconnectDrive = () => {
    const token = driveToken;
    driveUserRef.current = null;
    driveRemoteRevisionRef.current = null;
    driveObservedRevisionRef.current = null;
    setDriveToken(null);
    setDriveUser(null);
    setDriveReady(false);
    setDriveStatus("disconnected");
    setDriveError(null);
    setDrivePanelOpen(false);
    setToast("Đã ngắt Google Drive; dữ liệu cục bộ vẫn được giữ");
    void driveSyncService.disconnect(token).catch(() => undefined);
  };

  const changeDriveClient = () => {
    const token = driveToken;
    driveUserRef.current = null;
    driveRemoteRevisionRef.current = null;
    driveObservedRevisionRef.current = null;
    desktopDriveResumeClientRef.current = desktopGoogleClientId.trim();
    setDriveToken(null);
    setDriveUser(null);
    setDriveReady(false);
    setDriveStatus("disconnected");
    setDriveError(null);
    setDrivePanelOpen(true);
    setToast("Có thể nhập OAuth client khác rồi kết nối lại");
    void driveSyncService.disconnect(token).catch(() => undefined);
  };

  useEffect(() => {
    const clientId = desktopGoogleClientId.trim();
    if (!ready || !IS_DESKTOP_APP || driveToken || !clientId.endsWith(".apps.googleusercontent.com")) return;
    if (desktopDriveResumeClientRef.current === clientId) return;
    desktopDriveResumeClientRef.current = clientId;
    void resumeDesktopDrive();
  }, [desktopGoogleClientId, driveToken, ready]);

  useEffect(() => {
    if (!IS_DESKTOP_APP || !driveToken || !desktopGoogleClientId.trim()) return;
    const refresh = () => { void resumeDesktopDrive(); };
    const timer = window.setInterval(refresh, 45 * 60 * 1000);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [desktopGoogleClientId, driveToken]);

  useEffect(() => {
    if (!ready || !driveToken || !driveReady || !driveAutoSync) return;
    const timer = window.setTimeout(() => { void syncToDrive(driveToken, true); }, 2200);
    return () => window.clearTimeout(timer);
  }, [activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces, noteState.activeSheetContent, noteState.structure]);

  useEffect(() => {
    pdfSearchAbortRef.current?.abort();
    pdfSearchAbortRef.current = null;
  }, [activeDocument?.id, searchQuery, searchWholeCollection]);

  const performSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setActiveSearchQuery("");
      return;
    }
    pdfSearchAbortRef.current?.abort();
    const abort = new AbortController();
    pdfSearchAbortRef.current = abort;
    setSearching(true);
    setActiveSearchQuery(query);
    setSearchResults([]);
    const normalizedQuery = query.toLocaleLowerCase();
    if (!activeWorkspace.documents.length) {
      if (activeWorkspace.kind !== "demo") {
        setSearching(false);
        setToast("Chưa có PDF để tìm kiếm");
        return;
      }
      const demoText = "Diabetic neuropathy pathophysiology hyperglycemia polyol pathway clinical features diagnosis management peripheral autonomic neuropathy";
      const matches = demoText.toLocaleLowerCase().includes(normalizedQuery)
        ? [{ documentId: null, documentName: "Tài liệu mẫu", page: 126, snippet: demoText, occurrences: 1 }]
        : [];
      if (!abort.signal.aborted) { setSearchResults(matches); setSearching(false); }
      return;
    }
    const targets = (searchWholeCollection ? activeWorkspace.documents : activeDocument ? [activeDocument] : []).map((target) => ({
      id: target.id,
      name: target.name,
      lastModified: target.lastModified,
      proxy: target.id === loadedDocumentId ? currentPdfDocument : null,
    }));
    try {
      const found = await pdfReader.search(query, targets, {
        signal: abort.signal,
        concurrency: window.matchMedia("(max-width: 820px)").matches ? 2 : 4,
        maxResults: 300,
      });
      if (abort.signal.aborted) return;
      setSearchResults(found);
      setToast(found.length ? `Tìm thấy ở ${found.length} trang` : "Không tìm thấy kết quả");
    } catch (error) {
      if (!abort.signal.aborted && (error as Error).name !== "AbortError") setToast("Không thể tìm kiếm PDF");
    } finally {
      if (pdfSearchAbortRef.current === abort) pdfSearchAbortRef.current = null;
      if (!abort.signal.aborted) setSearching(false);
    }
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
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(activeNotebook.title)}</title><style>body{max-width:820px;margin:40px auto;padding:0 24px;color:#24343c;font:16px/1.6 system-ui}h1{color:#0e6b70}section{padding:24px 0;border-top:1px solid #d8e1e5}.body{white-space:normal}figure{margin:20px 0;padding:14px;border-left:4px solid #0e6b70;background:#f4f8f8}blockquote{margin:0;font-style:italic}img{max-width:100%;height:auto}figcaption{margin-top:8px;color:#60737d;font-size:13px}</style></head><body><h1>${escapeHtml(activeNotebook.title)}</h1>${pagesHtml.join("")}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeNotebook.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "MedNote"}.html`;
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
  }, [activeNote.id, activeNotebook.id, activeWorkspace.id]);

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
      setActiveTool("text");
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
    setToast("Đã lưu mẫu giấy cho trang này");
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
    updateActiveNote({
      paper: { ...activeNote.paper, template },
      ...transition,
    });
    setToast(currentTemplate === "first-aid" ? "Đã chuyển nội dung First Aid về văn bản thường" : "Đã lưu mẫu giấy cho trang này");
    return;
  }

  updateActiveNote({
    paper: { ...activeNote.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
    text: { ...activeNote.text, font: "times", size: 12, align: "left" },
    ...transition,
  });
  setActiveTool("text");
  setToast("Đã áp dụng bố cục First Aid");
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
      setTextInsertPopover(null);
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
  useNoteZoomController(noteStageRef, noteZoom, setNoteViewZoom, fitNoteToView);
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
    ...(activeNote.paper.template === "first-aid" ? firstAidThemeVariables(activeNote.paper.color) : {}),
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

  const noteToolbar = useNoteToolbar({ NOTE_ZOOM_PRESETS, TEXT_FONTS, activeNote, activeTool, applyTextCommand, applyTextLineHeight, changeListLevel, chooseNoteTool, exportNotebook, fitNoteToView, inkHistoryVersion, noteInkSession, notePanel, noteSheetViewMode, noteZoom, noteZoomPercent, openTextPopover, redo, scrollTextToolbar, scrollTextToolbarWithWheel, selectedExcerpt, selectedExcerptIndex, selectedTextBoxAppearance, selectedToolbarFont, setActiveTool, setNotePanel, setNoteSheetViewMode, setNoteSidebarVisibility, setNoteViewZoom, shiftExcerptLayer, showNoteSidebar, tableBorder, textCharacterToolbarRef, textInsertPopover, textParagraphToolbarRef, textToolbar, tools, undo });

  return (
    <main className="app-shell">
      <input ref={previewPdfInputRef} data-pdf-input="preview" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, false); event.currentTarget.value = ""; }} />
      <input ref={libraryPdfInputRef} data-pdf-input="library" className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files, true); event.currentTarget.value = ""; }} />
      <AppTopBar scope={{ activeWorkspace, activeWorkspaceHasLinkedNote, addNotebook, changeWorkspaceMode, documentName, driveStatus, driveToken, hasActiveNote, previewPdfInputRef, ready, saveTemporaryWorkspace, setDrivePanelOpen, setLibraryOpen, toast, workspaceMode }} />

      {drivePanelOpen && (
        <DrivePanel scope={{ IS_DESKTOP_APP, cancelDriveConnection, changeDriveClient, connectDrive, desktopGoogleClientId, desktopGoogleClientSecret, disconnectDrive, driveAutoSync, driveError, driveLastSyncedAt, driveReady, driveStatus, driveUser, restoreFromDrive, setDesktopGoogleClientId, setDesktopGoogleClientSecret, setDriveAutoSync, setDriveError, setDrivePanelOpen, syncToDrive }} />
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

      <WorkspaceShell className={`workspace workspace-mode-${workspaceMode} ${showPdfRail ? "" : "pdf-rail-collapsed"} ${showNoteSidebar ? "" : "note-sidebar-collapsed"} ${pdfRailTab === "pages" ? "" : "pdf-rail-wide"}`} workspaceRef={workspaceRef} style={gridStyle} pdfRail={null} reader={null} divider={null} note={null} noteNavigation={null}>
        <PdfNavigationRail scope={{ activeDocument, activeSearchQuery, activeWorkspace, bookmarks, currentPdfDocument, goToPageFromRail, openSearchResult, outline, pdfAnnotationLabel, pdfAnnotationSummary, pdfAnnotations, pdfRailTab, performSearch, removePdfAnnotation, searchQuery, searchResults, searchWholeCollection, searching, setPdfRailTab, setSearchQuery, setSearchWholeCollection, setShowPdfRail, sourcePage, sourcePages, updateReader }} />

        <ReaderPane scope={{ INK_COLORS, PDF_TOOLS, activeDocument, activeSearchQuery, activeWorkspace, addImageExcerpt, bookmarks, changeWorkspaceMode, choosePdfTool, commitPdfPageAnnotations, currentPdfDocument, deleteActiveDocument, documentStageRef, exportAnnotatedPdf, fitMode, goToPage, handlePdfSelection, handlePdfWheelZoom, handleReaderScroll, inkColor, inkWidth, libraryPdfInputRef, onPdfPageRendered, pdfAnnotationText, pdfAnnotations, pdfHighlightColor, pdfHistory, pdfHistoryKey, pdfPanel, pdfPanelColor, pdfSignatureDraft, pdfStampDraft, pdfStatus, pdfTextDraft, pdfTool, pdfiumDocument, previewPdfInputRef, ready, redoPdf, rotation, setInkWidth, setPdfPanel, setPdfSignatureDraft, setPdfStampDraft, setPdfTextDraft, setShowPdfRail, setSourceZoom, showPdfRail, sourceFocus, sourcePage, sourcePages, sourceZoom, switchDocument, toggleBookmark, totalPages, undoPdf, updatePdfPanelColor, updateReader, viewMode, workspaceMode }} />

        <SplitDivider onPointerDown={startResize} />

        <NotePane toolbar={noteToolbar} stage={{ BORDER_COLORS, BULLET_STYLES, EQUATION_PRESETS, EQUATION_TEMPLATES, INK_COLORS, LINE_PRESETS, NUMBERING_STYLES, PAPER_COLORS, PAPER_SIZES, PAPER_TEMPLATES, PEN_STYLES, STICKER_PRESETS, SYMBOL_GROUPS, TEXT_BACKGROUND_COLORS, TEXT_BOX_BACKGROUND_COLORS, TEXT_COLORS, activateContinuousSheet, activateTextEditor, activeLogicalPage, activeNote, activeNoteHydrating, activeSheetIndex, activeTextEditorRef, activeTool, addCalloutAt, addFirstAidImage, addSticker, addTextBoxAt, applyBulletStyle, applyNumberingStyle, applyTableLinePreset, applyTextCommand, basePaperMaxWidth, commitStrokes, continuousNotes, deleteExcerpt, editExcerpt, equationDraft, equationMarkup, equationParts, equationTemplate, equationTemplateById, finishFirstAidPdfCrop, firstAidCropResult, goToPage, highlighterWidth, inkColor, inkWidth, insertEquation, insertTable, insertTextAtSelection, moveExcerpt, normalizeTextEditorInput, notePanel, noteSheetViewMode, noteStageRef, noteState, noteZoom, openExcerptSource, paperHeight, paperStyle, paperWidth, penStyle, requestFirstAidPdfCrop, resolveExcerptSource, savedTextRangeRef, selectedExcerptId, selectedPaperSize, selectedTextBoxAppearance, setActiveTool, setEquationDraft, setEquationParts, setEquationTemplate, setHighlighterWidth, setInkColor, setInkWidth, setNotePanel, setPenStyle, setSelectedExcerptId, setShapeKind, setTableColumns, setTableRows, setTextInsertPopover, setToast, shapeKind, tableBorder, tableColumns, tableRows, textInsertPopover, textLayerStyle, textPopoverLeft, textToolbar, updateActiveNote, updatePaper, updatePaperTemplate, updateSelectedTextBoxAppearance, updateTableBorder }} />
        {showNoteSidebar && <NoteNavigationHost setNoteSidebarVisibility={setNoteSidebarVisibility} />}
      </WorkspaceShell>
    </main>
  );
}
