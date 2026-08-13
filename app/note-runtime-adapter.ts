import type { PdfRect } from "./pdf-domain";
import { ordered, type NoteStructure, type SheetContent, type SheetContentMap } from "./note-domain";
import { hasFirstAidBlockSerialization } from "./first-aid-block-codec";
import {
  createFirstAidDocument,
  firstAidDocumentFromLegacy,
  firstAidDocumentMatchesRegularProjection,
  firstAidDocumentPlainText,
  firstAidDocumentProjectionHtml,
  firstAidDocumentStandardRichText,
  normalizeFirstAidDocument,
  resolveFirstAidDocument,
  type FirstAidDocument,
} from "./first-aid-document";
import { escapeHtml, plainTextToRichHtml, sanitizeRichTextHtml } from "./rich-text-html";

export { escapeHtml, plainTextToRichHtml, sanitizeRichTextHtml } from "./rich-text-html";

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
  firstAid?: FirstAidDocument;
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

const VALID_TABLE_BORDER_STYLES = new Set<TableBorderStyle>(["solid", "dashed", "dotted", "double"]);

function runtimeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function firstAidBlocksEqual(left: FirstAidDocument, right: FirstAidDocument) {
  return JSON.stringify(left.blocks) === JSON.stringify(right.blocks);
}

function latestFirstAidDocument(page: NotePage) {
  const stored = normalizeFirstAidDocument(page.firstAid);
  const body = page.body ?? "";
  const bodyHtml = page.bodyHtml ?? "";

  // Once the editor owns a structured document, it is the source of truth.
  // body/bodyHtml may still be a one-render-old projection and must never win.
  if (stored && !stored.legacyStarter) return stored;

  if (hasFirstAidBlockSerialization(bodyHtml)) {
    const projected = firstAidDocumentFromLegacy(bodyHtml, body);
    return createFirstAidDocument(
      projected.blocks,
      Boolean(stored?.legacyStarter && firstAidBlocksEqual(stored, projected)),
    );
  }
  return stored ?? firstAidDocumentFromLegacy(bodyHtml, body);
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
  const paper = normalizePaper(page.paper);
  const rawBody = page.body ?? "";
  const rawBodyHtml = page.bodyHtml ?? plainTextToRichHtml(rawBody);
  const resolvedFirstAid = resolveFirstAidDocument(page.firstAid, rawBodyHtml, rawBody, paper.template === "first-aid");
  const firstAid = resolvedFirstAid.document ?? undefined;
  const canonicalFirstAidPage = paper.template === "first-aid" && firstAid;
  const migratedDormantPayload = paper.template !== "first-aid" && resolvedFirstAid.source === "legacy-payload" && firstAid;
  const body = canonicalFirstAidPage || migratedDormantPayload ? firstAidDocumentPlainText(firstAid) : rawBody;
  const bodyHtml = canonicalFirstAidPage
    ? firstAidDocumentProjectionHtml(firstAid)
    : migratedDormantPayload
      ? sanitizeRichTextHtml(firstAidDocumentStandardRichText(firstAid))
      : sanitizeRichTextHtml(rawBodyHtml);
  return {
    ...page,
    body,
    bodyHtml,
    firstAid,
    strokes: Array.isArray(page.strokes) ? page.strokes : [],
    paper,
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
  return {
    id: runtimeId("page"),
    title: `GHI CHÚ ${index}`,
    body: "",
    bodyHtml: "",
    ...(paper.template === "first-aid" ? { firstAid: createFirstAidDocument() } : {}),
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
  const persisted = content as SheetContent & {
    body?: string;
    bodyHtml?: string;
    firstAid?: FirstAidDocument;
  };

  if (page.paper.template === "first-aid") {
    persisted.firstAid = latestFirstAidDocument(page);
    delete persisted.body;
    delete persisted.bodyHtml;
    return persisted;
  }

  const dormant = normalizeFirstAidDocument(page.firstAid);
  if (!dormant) {
    delete persisted.firstAid;
    return persisted;
  }
  if (dormant.legacyStarter) {
    persisted.body = "";
    persisted.bodyHtml = "";
    delete persisted.firstAid;
    return persisted;
  }
  if (!firstAidDocumentMatchesRegularProjection(dormant, persisted.bodyHtml ?? "", persisted.body ?? "")) {
    delete persisted.firstAid;
  }
  return persisted;
}

export function createDefaultSheetContent(citationPage: number | null = 1): SheetContent {
  return notePageToSheetContent(createBlankPage(citationPage));
}

export function notePageFromSheet(sheetId: string, pageTitle: string, content?: SheetContent, lazy = false): NotePage {
  const hasPersistedPaper = Boolean(content && Object.hasOwn(content, "paper"));
  const hasPersistedFirstAid = Boolean(content && Object.hasOwn(content, "firstAid"));
  const fallbackPaper = hasPersistedPaper || hasPersistedFirstAid ? DEFAULT_NEW_NOTE_PAPER : DEFAULT_PAPER;
  const fallback = createBlankPage(null, 1, fallbackPaper, DEFAULT_NEW_NOTE_TEXT);
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
