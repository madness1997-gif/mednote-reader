import type { PdfRect } from "./pdf-domain";
import { ordered, type NoteStructure, type SheetContent, type SheetContentMap } from "./note-domain";

export type InkTool = "pen" | "highlight" | "shape";

export type StickerPresetId = "classic-yellow" | "tape-pink" | "pin-mint" | "tab-blue" | "clinical-card" | "high-yield";

export type PenStyle = "ballpoint" | "fountain" | "pencil" | "brush";

export type ShapeKind = "line" | "arrow" | "rectangle" | "ellipse" | "circle";

export type PaperSize = "a4" | "a5" | "b5" | "letter" | "square";

export type PaperOrientation = "portrait" | "landscape";

export type PaperTemplate = "blank" | "ruled" | "ruled-dense" | "grid" | "dotted" | "cornell" | "first-aid";

export type PaperColor = "white" | "ivory" | "yellow" | "mint" | "blue" | "dark";

export type TextFont =
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

export type TextAlign = "left" | "center" | "right" | "justify";

export type TableBorderStyle = "solid" | "dashed" | "dotted" | "double";

export type TextSettings = {
  font: TextFont;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
};

export type ExcerptAppearance = { borderStyle: TableBorderStyle; borderWidth: number; borderColor: string; backgroundColor: string };

export type CalloutSettings = { anchorX: number; anchorY: number };

export type Point = { x: number; y: number; pressure: number };

export type Stroke = {
  id: string;
  tool: InkTool;
  penStyle?: PenStyle;
  shape?: ShapeKind;
  color: string;
  width: number;
  points: Point[];
};

export type PaperSettings = {
  size: PaperSize;
  orientation: PaperOrientation;
  template: PaperTemplate;
  color: PaperColor;
};

export type NotePage = {
  id: string;
  __mednoteLazyPage?: boolean;
  title: string;
  titleHtml?: string;
  body: string;
  bodyHtml?: string;
  citationPage: number | null;
  strokes: Stroke[];
  paper: PaperSettings;
  text: TextSettings;
  excerpts: NoteExcerpt[];
};

export type NotePageContentPatch = Partial<Omit<NotePage, "id" | "title" | "titleHtml" | "__mednoteLazyPage">>;

export type NoteExcerpt = {
  id: string;
  kind: "text" | "image";
  annotationKind?: "callout";
  callout?: Partial<CalloutSettings>;
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
  appearance?: Partial<ExcerptAppearance>;
  stickerStyle?: StickerPresetId;
};

export type ExcerptLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  contentScale: number;
  rotation: number;
  opacity: number;
  aspectRatio?: number;
  autoFit?: boolean;
};

export type Notebook = {
  id: string;
  title: string;
  pages: NotePage[];
  activePageId: string;
  createdAt: number;
};

export const DEFAULT_PAPER: PaperSettings = { size: "a4", orientation: "portrait", template: "ruled", color: "white" };

export const DEFAULT_TEXT: TextSettings = { font: "times", size: 15, color: "auto", bold: false, italic: false, underline: false, align: "left" };

export const DEFAULT_NEW_NOTE_PAPER: PaperSettings = { size: "a4", orientation: "portrait", template: "first-aid", color: "white" };

export const DEFAULT_NEW_NOTE_TEXT: TextSettings = { ...DEFAULT_TEXT, size: 12 };

export const DEFAULT_TEXT_BOX_APPEARANCE: ExcerptAppearance = { borderStyle: "solid", borderWidth: 1, borderColor: "#60737d", backgroundColor: "transparent" };

export const DEFAULT_CALLOUT_APPEARANCE: ExcerptAppearance = { borderStyle: "solid", borderWidth: 2, borderColor: "#1b7184", backgroundColor: "transparent" };

export const FIRST_AID_TEMPLATE_HTML = [
  '<table style="width:100%;border-collapse:collapse;color:var(--fa-ink,#26343a);background-color:var(--fa-block-bg,#fff)">',
  '<tbody>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#9eabb0);background-color:var(--fa-label-bg,#eff7f8);text-align:left">TỔNG QUAN</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#9eabb0)">Viết định nghĩa hoặc thông điệp cốt lõi tại đây.</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#c7d0d3);background-color:var(--fa-label-bg,#eff7f8);text-align:left">YẾU TỐ NGUY CƠ</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#c7d0d3)">• Yếu tố có thể thay đổi<br>• Yếu tố không thể thay đổi</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#c7d0d3);background-color:var(--fa-label-bg,#eff7f8);text-align:left">CƠ CHẾ</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#c7d0d3)">Nguyên nhân → cơ chế trung gian → biểu hiện.</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#c7d0d3);background-color:var(--fa-label-bg,#eff7f8);text-align:left">LÂM SÀNG</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#c7d0d3)">Triệu chứng, dấu hiệu và hình ảnh then chốt.</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#c7d0d3);background-color:var(--fa-label-bg,#eff7f8);text-align:left">CHẨN ĐOÁN</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#c7d0d3)">Xét nghiệm đầu tay → xác nhận → phân tầng.</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-primary,#1b7184);border-bottom:1px solid var(--fa-border,#c7d0d3);background-color:var(--fa-label-bg,#eff7f8);text-align:left">ĐIỀU TRỊ</th><td style="padding:6px;vertical-align:top;border-bottom:1px solid var(--fa-border,#c7d0d3)">Điều trị nền tảng, thuốc chính và theo dõi.</td></tr>',
  '<tr><th style="width:24%;padding:6px;vertical-align:top;color:var(--fa-secondary,#8b2c58);background-color:var(--fa-pearl-bg,#fff5b8);text-align:left">PEARL</th><td style="padding:6px;vertical-align:top;color:var(--fa-pearl-ink,#3b3111);background-color:var(--fa-pearl-bg,#fff5b8)"><b>Điểm dễ nhầm hoặc mẹo nhớ.</b></td></tr>',
  '</tbody>',
  '</table>',
].join("");

export const FIRST_AID_TEMPLATE_TEXT = "TỔNG QUAN\nYẾU TỐ NGUY CƠ\nCƠ CHẾ\nLÂM SÀNG\nCHẨN ĐOÁN\nĐIỀU TRỊ\nPEARL";

const VALID_TABLE_BORDER_STYLES = new Set<TableBorderStyle>(["solid", "dashed", "dotted", "double"]);

function runtimeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export function plainTextToRichHtml(value: string) {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

export function sanitizeRichTextHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT", "SUB", "SUP", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD"]);
  const allowedStyles = ["fontFamily", "fontSize", "color", "backgroundColor", "fontWeight", "fontStyle", "textDecoration", "textAlign", "lineHeight", "listStyleType", "borderCollapse", "borderColor", "borderStyle", "borderWidth", "borderTop", "borderBottom", "width", "minWidth", "padding", "margin", "display", "alignItems", "gridTemplateColumns", "columnGap", "rowGap", "verticalAlign", "whiteSpace"] as const;
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

export function normalizePaper(paper?: Partial<PaperSettings>): PaperSettings {
  return { ...DEFAULT_PAPER, ...paper };
}

export function normalizeText(text?: Partial<TextSettings>): TextSettings {
  return { ...DEFAULT_TEXT, ...text };
}

export function defaultExcerptLayout(index: number, kind: NoteExcerpt["kind"]): ExcerptLayout {
  const column = index % 2;
  const row = Math.floor(index / 2) % 3;
  return {
    x: .07 + column * .47,
    y: Math.min(.69, .52 + row * .08),
    width: kind === "image" ? .4 : .38,
    height: kind === "image" ? .3 : .25,
    contentScale: 1,
    rotation: 0,
    opacity: 1,
  };
}

export function normalizeExcerptLayout(layout: Partial<ExcerptLayout> | undefined, index: number, kind: NoteExcerpt["kind"]): ExcerptLayout {
  const fallback = defaultExcerptLayout(index, kind);
  const width = Math.min(.9, Math.max(kind === "image" ? .035 : .025, layout?.width ?? fallback.width));
  const height = Math.min(.82, Math.max(kind === "image" ? .025 : .018, layout?.height ?? fallback.height));
  const rawRotation = Number(layout?.rotation ?? 0);
  const rotation = Number.isFinite(rawRotation) ? ((rawRotation + 180) % 360 + 360) % 360 - 180 : 0;
  const rawAspectRatio = Number(layout?.aspectRatio);
  const rawOpacity = Number(layout?.opacity ?? 1);
  return {
    x: Math.min(1 - width, Math.max(0, layout?.x ?? fallback.x)),
    y: Math.min(1 - height, Math.max(0, layout?.y ?? fallback.y)),
    width,
    height,
    contentScale: Math.min(2.4, Math.max(.65, layout?.contentScale ?? 1)),
    rotation,
    opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(.1, rawOpacity)) : 1,
    aspectRatio: Number.isFinite(rawAspectRatio) && rawAspectRatio > 0 ? rawAspectRatio : undefined,
    autoFit: kind === "text" && layout?.autoFit === true,
  };
}

export function normalizeExcerptAppearance(appearance?: Partial<ExcerptAppearance>, migrateLegacyCallout = false): ExcerptAppearance {
  const borderStyle = VALID_TABLE_BORDER_STYLES.has(appearance?.borderStyle as TableBorderStyle)
    ? appearance!.borderStyle!
    : DEFAULT_TEXT_BOX_APPEARANCE.borderStyle;
  const savedBackground = appearance?.backgroundColor || DEFAULT_TEXT_BOX_APPEARANCE.backgroundColor;
  return {
    borderStyle,
    borderWidth: Math.min(8, Math.max(0, Number(appearance?.borderWidth ?? DEFAULT_TEXT_BOX_APPEARANCE.borderWidth))),
    borderColor: appearance?.borderColor || DEFAULT_TEXT_BOX_APPEARANCE.borderColor,
    backgroundColor: migrateLegacyCallout && savedBackground.toLowerCase() === "#fff8cf" ? "transparent" : savedBackground,
  };
}

export function normalizeCalloutSettings(callout: Partial<CalloutSettings> | undefined, layout: ExcerptLayout): CalloutSettings {
  const fallbackX = Math.max(0, layout.x - .06);
  const fallbackY = Math.min(1, layout.y + layout.height + .06);
  const anchorX = Number(callout?.anchorX ?? fallbackX);
  const anchorY = Number(callout?.anchorY ?? fallbackY);
  return {
    anchorX: Number.isFinite(anchorX) ? Math.min(1, Math.max(0, anchorX)) : fallbackX,
    anchorY: Number.isFinite(anchorY) ? Math.min(1, Math.max(0, anchorY)) : fallbackY,
  };
}

export function normalizePage(page: NotePage): NotePage {
  const normalizedText = normalizeText(page.text);
  return {
    ...page,
    body: page.body ?? "",
    bodyHtml: sanitizeRichTextHtml(page.bodyHtml ?? plainTextToRichHtml(page.body ?? "")),
    strokes: Array.isArray(page.strokes) ? page.strokes : [],
    paper: normalizePaper(page.paper),
    text: page.bodyHtml == null && normalizedText.font === "handwriting" ? { ...normalizedText, font: "times" } : normalizedText,
    excerpts: Array.isArray(page.excerpts)
      ? page.excerpts.map((excerpt, index) => {
          const layout = normalizeExcerptLayout(excerpt.layout, index, excerpt.kind);
          return {
            ...excerpt,
            sourceKind: excerpt.sourceKind ?? "pdf",
            richText: excerpt.kind === "text" ? sanitizeRichTextHtml(excerpt.richText ?? plainTextToRichHtml(excerpt.text ?? "")) : undefined,
            layout,
            appearance: excerpt.kind === "text"
              ? normalizeExcerptAppearance(excerpt.appearance ?? (excerpt.annotationKind === "callout" ? DEFAULT_CALLOUT_APPEARANCE : undefined), excerpt.annotationKind === "callout")
              : undefined,
            callout: excerpt.annotationKind === "callout" ? normalizeCalloutSettings(excerpt.callout, layout) : undefined,
          };
        })
      : [],
  };
}

export function createBlankPage(citationPage: number | null = 1, index = 1, paper: PaperSettings = DEFAULT_NEW_NOTE_PAPER, text: TextSettings = DEFAULT_NEW_NOTE_TEXT): NotePage {
  const firstAid = paper.template === "first-aid";
  return {
    id: runtimeId("page"),
    title: firstAid ? "TÊN CHỦ ĐỀ" : `GHI CHÚ ${index}`,
    body: firstAid ? FIRST_AID_TEMPLATE_TEXT : "",
    bodyHtml: firstAid ? FIRST_AID_TEMPLATE_HTML : "",
    citationPage,
    strokes: [],
    paper: { ...paper },
    text: { ...text },
    excerpts: [],
  };
}

export function notePageToSheetContent(page: NotePage): SheetContent {
  const {
    id: _id,
    title: _title,
    titleHtml: _titleHtml,
    __mednoteLazyPage: _lazy,
    ...content
  } = page;
  return content as SheetContent;
}

export function notePageFromSheet(sheetId: string, pageTitle: string, content?: SheetContent, lazy = false): NotePage {
  const fallback = createBlankPage(null, 1);
  const page = normalizePage({
    ...fallback,
    ...(content || {}),
    id: sheetId,
    title: pageTitle,
  } as NotePage);
  if (lazy) page.__mednoteLazyPage = true;
  return page;
}

export function notebookFromStructure(
  structure: NoteStructure,
  notebookId: string,
  contents: SheetContentMap = {},
  activeContent?: SheetContent | null,
): Notebook | null {
  const notebook = structure.notebooks.find((record) => record.id === notebookId);
  if (!notebook) return null;
  const sections = ordered(structure.sections.filter((record) => record.notebookId === notebook.id));
  const pages = sections.flatMap((section) => ordered(structure.pages.filter((record) => record.sectionId === section.id)));
  const pageMap = new Map(pages.map((record) => [record.id, record]));
  const sheets = pages.flatMap((page) => ordered(structure.sheets.filter((sheet) => sheet.pageId === page.id)));
  return {
    id: notebook.id,
    title: notebook.title,
    pages: sheets.map((sheet) => {
      const content = contents[sheet.id] || (sheet.id === structure.active.activeSheetId ? activeContent || undefined : undefined);
      return notePageFromSheet(sheet.id, pageMap.get(sheet.pageId)?.title || "Page mới", content, !content);
    }),
    activePageId: structure.active.activeNotebookId === notebook.id
      ? structure.active.activeSheetId
      : sheets[0]?.id || "",
    createdAt: 0,
  };
}

export function createNotebook(title: string, citationPage = 1): Notebook {
  const page = createBlankPage(citationPage);
  return {
    id: runtimeId("notebook"),
    title,
    pages: [page],
    activePageId: page.id,
    createdAt: Date.now(),
  };
}
