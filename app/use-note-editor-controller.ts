import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { noteRichTextController } from "./note-rich-text-controller";
import {
  DEFAULT_TEXT,
  escapeHtml,
  normalizeText,
  type TableBorderStyle,
  type TextAlign,
  type TextFont,
  type TextSettings,
} from "./note-runtime-adapter";
import type {
  BulletStyle,
  EquationTemplate,
  NotePanel,
  NumberingStyle,
  TableBorderSettings,
  TextCommand,
  TextInsertPopover,
  TextLineHeight,
  TextToolbarState,
} from "./ui/ui-contracts";

export type NoteEditorFont = { id: TextFont; label: string; family: string };
export type NoteTableLinePreset = { id: string; style: TableBorderStyle; width: number; label: string };
export type NoteEquationTemplate = { id: EquationTemplate; label: string; sample: string; fields: string[]; defaults: string[] };

const TEXT_FONTS: NoteEditorFont[] = [
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

const TEXT_COLORS = ["#26343a", "#000000", "#c00000", "#ff0000", "#ed7d31", "#ffc000", "#70ad47", "#00b0f0", "#4472c4", "#7030a0", "#7f7f7f", "#ffffff"];
const TEXT_BACKGROUND_COLORS = ["transparent", "#fff2a8", "#ffe699", "#ccebf3", "#d8f1dc", "#f7d5dd", "#e4d8f3", "#d9e2f3", "#ffffff"];
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
const LINE_PRESETS: NoteTableLinePreset[] = [
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
const EQUATION_TEMPLATES: NoteEquationTemplate[] = [
  { id: "plain", label: "Tự nhập", sample: "x + y", fields: ["Công thức"], defaults: ["y = ax² + b"] },
  { id: "fraction", label: "Phân số", sample: "a⁄b", fields: ["Tử số", "Mẫu số"], defaults: ["a", "b"] },
  { id: "root", label: "Căn", sample: "ⁿ√x", fields: ["Biểu thức dưới căn", "Bậc căn (để trống = 2)"], defaults: ["x", ""] },
  { id: "power", label: "Lũy thừa", sample: "xⁿ", fields: ["Cơ số", "Số mũ"], defaults: ["x", "n"] },
  { id: "subscript", label: "Chỉ số dưới", sample: "xᵢ", fields: ["Ký hiệu", "Chỉ số"], defaults: ["x", "i"] },
  { id: "sum", label: "Tổng", sample: "∑", fields: ["Biểu thức", "Cận dưới", "Cận trên"], defaults: ["xᵢ", "i = 1", "n"] },
  { id: "integral", label: "Tích phân", sample: "∫", fields: ["Hàm số", "Cận dưới", "Cận trên", "Biến"], defaults: ["f(x)", "a", "b", "x"] },
  { id: "matrix", label: "Ma trận 2×2", sample: "[ ]", fields: ["Hàng 1 · cột 1", "Hàng 1 · cột 2", "Hàng 2 · cột 1", "Hàng 2 · cột 2"], defaults: ["a", "b", "c", "d"] },
];

export function equationTemplateById(template: EquationTemplate) {
  return EQUATION_TEMPLATES.find((option) => option.id === template) ?? EQUATION_TEMPLATES[0];
}

export function equationMarkup(template: EquationTemplate, parts: string[]) {
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

export function tableMarkup(rows: number, columns: number, border: TableBorderSettings) {
  const cellStyle = `border-style:${border.style};border-width:${border.width}px;border-color:${border.color};padding:6px;min-width:44px;vertical-align:top`;
  const body = Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => `<td style="${cellStyle}">&nbsp;</td>`).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%"><tbody>${body}</tbody></table><div><br></div>`;
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

function toolbarState(settings: TextSettings): TextToolbarState {
  return { ...normalizeText(settings), strike: false, subscript: false, superscript: false, unordered: false, ordered: false, backgroundColor: "transparent", lineHeight: "1.8", bulletStyle: "disc", numberingStyle: "decimal" };
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

export type UseNoteEditorControllerOptions = {
  editorScopeKey: string;
  defaultText: TextSettings;
  notePanel: NotePanel;
  notify: (message: string) => void;
};

export function useNoteEditorController({ editorScopeKey, defaultText, notePanel, notify }: UseNoteEditorControllerOptions) {
  const [textToolbar, setTextToolbar] = useState<TextToolbarState>(() => toolbarState(defaultText));
  const [textInsertPopover, setTextInsertPopover] = useState<TextInsertPopover>(null);
  const [textPopoverLeft, setTextPopoverLeft] = useState(12);
  const [equationDraft, setEquationDraft] = useState("y = ax² + b");
  const [equationTemplate, setEquationTemplate] = useState<EquationTemplate>("fraction");
  const [equationParts, setEquationParts] = useState(() => [...equationTemplateById("fraction").defaults]);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const [tableBorder, setTableBorder] = useState<TableBorderSettings>({ style: "solid", width: 1, color: "#60737d" });
  const pendingFontSizeRef = useRef(new Map<string, number>());
  const textCharacterToolbarRef = useRef<HTMLDivElement>(null);
  const textParagraphToolbarRef = useRef<HTMLDivElement>(null);

  const clearActiveTextEditor = useCallback(() => {
    noteRichTextController.clear();
  }, []);

  useEffect(() => {
    clearActiveTextEditor();
    setTextToolbar(toolbarState(defaultText));
    setTextInsertPopover(null);
  }, [editorScopeKey]);

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

  const scrollTextToolbarWithWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const toolbar = event.currentTarget;
    if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    toolbar.scrollLeft += event.deltaY;
    event.preventDefault();
  }, []);

  const activateTextEditor = useCallback((editorId: string, editor: HTMLElement, range: Range | null) => {
    noteRichTextController.activate(editorId, editor, range);
    setTextToolbar(textSettingsAtRange(editor, range));
    const table = closestWithin<HTMLTableElement>(range?.startContainer ?? null, "table", editor);
    const cell = table?.querySelector<HTMLElement>("th,td");
    if (!cell) return;
    const style = window.getComputedStyle(cell);
    const borderStyle = (["solid", "dashed", "dotted", "double"] as TableBorderStyle[]).includes(style.borderTopStyle as TableBorderStyle) ? style.borderTopStyle as TableBorderStyle : "solid";
    setTableBorder({ style: borderStyle, width: Math.max(1, Math.min(6, Math.round(Number.parseFloat(style.borderTopWidth) || 1))), color: cssColorToHex(style.borderTopColor) });
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

  const finishTextCommand = useCallback((target: { id: string; editor: HTMLElement }, message: string) => {
    target.editor.dispatchEvent(new Event("input", { bubbles: true }));
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    activateTextEditor(target.id, target.editor, range);
    notify(message);
  }, [activateTextEditor, notify]);

  const requireSelection = useCallback((message: string) => {
    const target = noteRichTextController.restoreSelection();
    if (!target) notify(message);
    return target;
  }, [notify]);

  const applyTextCommand = useCallback((command: TextCommand, value?: string | number) => {
    const target = requireSelection("Bấm vào nội dung hoặc bôi chọn chữ trước khi định dạng");
    if (!target) return;
    noteRichTextController.execCommand("styleWithCSS", false, "true");
    if (command === "font") {
      const font = TEXT_FONTS.find((option) => option.id === value) ?? TEXT_FONTS[0];
      noteRichTextController.execCommand("fontName", false, font.family);
    } else if (command === "size") {
      const size = Number(value);
      pendingFontSizeRef.current.set(target.id, size);
      noteRichTextController.execCommand("fontSize", false, "7");
      normalizeTextEditorInput(target.id, target.editor);
    } else if (command === "color") {
      noteRichTextController.execCommand("foreColor", false, String(value));
    } else if (command === "background") {
      noteRichTextController.execCommand("backColor", false, String(value));
    } else {
      const browserCommand = {
        bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough", subscript: "subscript", superscript: "superscript",
        left: "justifyLeft", center: "justifyCenter", right: "justifyRight", justify: "justifyFull", bullets: "insertUnorderedList",
        numbering: "insertOrderedList", clear: "removeFormat",
      }[command];
      noteRichTextController.execCommand(browserCommand, false);
    }
    finishTextCommand(target, "Đã định dạng phần chữ đang chọn");
  }, [finishTextCommand, normalizeTextEditorInput, requireSelection]);

  const applyTextLineHeight = useCallback((lineHeight: TextLineHeight) => {
    const target = requireSelection("Bấm vào đoạn văn trước khi chỉnh giãn dòng");
    if (!target) return;
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    const blocks = Array.from(target.editor.querySelectorAll<HTMLElement>("div,p,li,td,th")).filter((element) => {
      try { return range!.intersectsNode(element); } catch { return false; }
    });
    if (!blocks.length) {
      noteRichTextController.execCommand("formatBlock", false, "div");
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const block = closestWithin<HTMLElement>(range?.startContainer ?? null, "div,p,li,td,th", target.editor);
      if (block) blocks.push(block);
    }
    blocks.forEach((block) => { block.style.lineHeight = lineHeight; });
    finishTextCommand(target, `Đã đặt giãn dòng ${lineHeight}`);
  }, [finishTextCommand, requireSelection]);

  const applyBulletStyle = useCallback((bulletStyle: BulletStyle) => {
    const target = requireSelection("Bấm vào đoạn văn trước khi tạo danh sách");
    if (!target) return;
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let lists = range ? [closestWithin<HTMLUListElement>(range.startContainer, "ul", target.editor)].filter(Boolean) as HTMLUListElement[] : [];
    if (bulletStyle === "none" && lists.length) {
      noteRichTextController.execCommand("insertUnorderedList", false);
      finishTextCommand(target, "Đã bỏ dấu đầu dòng");
      setTextInsertPopover(null);
      return;
    }
    if (bulletStyle === "none") {
      setTextInsertPopover(null);
      return;
    }
    if (!lists.length) {
      noteRichTextController.execCommand("insertUnorderedList", false);
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const list = range ? closestWithin<HTMLUListElement>(range.startContainer, "ul", target.editor) : null;
      if (list) lists = [list];
    }
    if (range) target.editor.querySelectorAll<HTMLUListElement>("ul").forEach((list) => {
      try { if (range!.intersectsNode(list) && !lists.includes(list)) lists.push(list); } catch { /* Detached DOM is ignored. */ }
    });
    const listStyleType = { disc: "disc", circle: "circle", square: "square", diamond: '"◆  "', arrow: '"➤  "', check: '"✓  "', dash: '"–  "', none: "none" }[bulletStyle];
    lists.forEach((list) => { list.style.listStyleType = listStyleType; });
    finishTextCommand(target, "Đã đổi kiểu dấu đầu dòng");
    setTextInsertPopover(null);
  }, [finishTextCommand, requireSelection]);

  const applyNumberingStyle = useCallback((numberingStyle: NumberingStyle) => {
    const target = requireSelection("Bấm vào đoạn văn trước khi tạo danh sách");
    if (!target) return;
    let selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let lists = range ? [closestWithin<HTMLOListElement>(range.startContainer, "ol", target.editor)].filter(Boolean) as HTMLOListElement[] : [];
    if (!lists.length) {
      noteRichTextController.execCommand("insertOrderedList", false);
      selection = window.getSelection();
      range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const list = range ? closestWithin<HTMLOListElement>(range.startContainer, "ol", target.editor) : null;
      if (list) lists = [list];
    }
    if (range) target.editor.querySelectorAll<HTMLOListElement>("ol").forEach((list) => {
      try { if (range!.intersectsNode(list) && !lists.includes(list)) lists.push(list); } catch { /* Detached DOM is ignored. */ }
    });
    lists.forEach((list) => { list.style.listStyleType = numberingStyle; });
    finishTextCommand(target, "Đã đổi kiểu đánh số");
    setTextInsertPopover(null);
  }, [finishTextCommand, requireSelection]);

  const changeListLevel = useCallback((direction: "increase" | "decrease") => {
    const target = requireSelection("Bấm vào một mục trong danh sách trước");
    if (!target) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const listItem = range ? closestWithin<HTMLLIElement>(range.startContainer, "li", target.editor) : null;
    if (!listItem) {
      notify("Nút này chỉ dùng cho bullet hoặc numbering");
      return;
    }
    noteRichTextController.execCommand(direction === "increase" ? "indent" : "outdent", false);
    finishTextCommand(target, direction === "increase" ? "Đã tăng một cấp danh sách" : "Đã giảm một cấp danh sách");
  }, [finishTextCommand, notify, requireSelection]);

  const insertTextAtSelection = useCallback((text: string, message = "Đã chèn ký hiệu") => {
    const target = requireSelection("Bấm vào vị trí cần chèn trước");
    if (!target) return;
    noteRichTextController.execCommand("insertText", false, text);
    finishTextCommand(target, message);
  }, [finishTextCommand, requireSelection]);

  const insertEquation = useCallback(() => {
    const target = noteRichTextController.restoreSelection();
    const parts = equationTemplate === "plain" ? [equationDraft] : equationParts;
    if (!target || !parts.some((part) => part.trim())) {
      notify(target ? "Nhập công thức trước khi chèn" : "Bấm vào vị trí cần chèn công thức trước");
      return;
    }
    noteRichTextController.execCommand("insertHTML", false, `${equationMarkup(equationTemplate, parts)}&nbsp;`);
    finishTextCommand(target, "Đã chèn công thức");
    setTextInsertPopover(null);
  }, [equationDraft, equationParts, equationTemplate, finishTextCommand, notify]);

  const selectEquationTemplate = useCallback((template: EquationTemplate) => {
    const option = equationTemplateById(template);
    setEquationTemplate(template);
    setEquationParts([...option.defaults]);
    if (template === "plain") setEquationDraft(option.defaults[0]);
  }, []);

  const insertTable = useCallback(() => {
    const target = requireSelection("Bấm vào vị trí cần chèn bảng trước");
    if (!target) return;
    noteRichTextController.execCommand("insertHTML", false, tableMarkup(tableRows, tableColumns, tableBorder));
    finishTextCommand(target, `Đã chèn bảng ${tableRows} × ${tableColumns}`);
    setTextInsertPopover(null);
  }, [finishTextCommand, requireSelection, tableBorder, tableColumns, tableRows]);

  const updateTableBorder = useCallback((changes: Partial<TableBorderSettings>) => {
    const next = { ...tableBorder, ...changes };
    setTableBorder(next);
    const target = noteRichTextController.restoreSelection();
    if (!target) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const table = closestWithin<HTMLTableElement>(range?.startContainer ?? null, "table", target.editor);
    if (!table) {
      notify("Thiết lập đường kẻ sẽ dùng cho bảng mới");
      return;
    }
    table.querySelectorAll<HTMLElement>("th,td").forEach((cell) => {
      cell.style.borderStyle = next.style;
      cell.style.borderWidth = `${next.width}px`;
      cell.style.borderColor = next.color;
    });
    finishTextCommand(target, "Đã cập nhật đường kẻ bảng");
  }, [finishTextCommand, notify, tableBorder]);

  const applyTableLinePreset = useCallback((preset: NoteTableLinePreset) => {
    updateTableBorder({ style: preset.style, width: preset.width });
    setTextInsertPopover(null);
  }, [updateTableBorder]);

  const focusTypeEditor = useCallback((editorId: string) => {
    const existing = noteRichTextController.activeEditorRef.current;
    if (existing?.id === editorId && existing.editor.isConnected) {
      noteRichTextController.restoreSelection();
      activateTextEditor(existing.id, existing.editor, noteRichTextController.savedRangeRef.current);
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
  }, [activateTextEditor]);

  const selectedToolbarFont = TEXT_FONTS.find((font) => font.id === textToolbar.font) ?? TEXT_FONTS[0];

  return {
    BORDER_COLORS,
    BULLET_STYLES,
    EQUATION_PRESETS,
    EQUATION_TEMPLATES,
    LINE_PRESETS,
    NUMBERING_STYLES,
    SYMBOL_GROUPS,
    TEXT_BACKGROUND_COLORS,
    TEXT_COLORS,
    TEXT_FONTS,
    activateTextEditor,
    applyBulletStyle,
    applyNumberingStyle,
    applyTableLinePreset,
    applyTextCommand,
    applyTextLineHeight,
    changeListLevel,
    clearActiveTextEditor,
    equationDraft,
    equationMarkup,
    equationParts,
    equationTemplate,
    equationTemplateById,
    focusTypeEditor,
    insertEquation,
    insertTable,
    insertTextAtSelection,
    normalizeTextEditorInput,
    openTextPopover,
    scrollTextToolbar,
    scrollTextToolbarWithWheel,
    selectEquationTemplate,
    selectedToolbarFont,
    setEquationDraft,
    setEquationParts,
    setTableColumns,
    setTableRows,
    setTextInsertPopover,
    tableBorder,
    tableColumns,
    tableRows,
    textCharacterToolbarRef,
    textInsertPopover,
    textParagraphToolbarRef,
    textPopoverLeft,
    textToolbar,
    updateTableBorder,
  };
}

export type NoteEditorController = ReturnType<typeof useNoteEditorController>;
