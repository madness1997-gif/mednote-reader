import type { PdfAnnotationHistory } from "../pdf-annotation-session";
import type { FirstAidImagePlacement } from "../first-aid-image-placement";
import type {
  ExcerptAppearance,
  NoteExcerpt,
  PaperTemplate,
  TextSettings,
  TableBorderStyle,
} from "../note-runtime-adapter";

export type Tool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";
export type TextLineHeight = "1" | "1.15" | "1.5" | "1.8" | "2";
export type BulletStyle = "none" | "disc" | "circle" | "square" | "diamond" | "arrow" | "check" | "dash";
export type NumberingStyle = "decimal" | "decimal-leading-zero" | "lower-alpha" | "upper-alpha" | "lower-roman" | "upper-roman" | "lower-greek" | "cjk-decimal";
export type TextToolbarState = TextSettings & {
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
export type TableBorderSettings = { style: TableBorderStyle; width: number; color: string };
export type StickerPresetId = "classic-yellow" | "tape-pink" | "pin-mint" | "tab-blue" | "clinical-card" | "high-yield";
export type TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | "stickers" | null;
export type EquationTemplate = "plain" | "fraction" | "root" | "power" | "subscript" | "sum" | "integral" | "matrix";
export type FirstAidCropPlacement = FirstAidImagePlacement;
export type FirstAidCropTarget = { noteId: string; blockId: string; placement: FirstAidCropPlacement };
export type FirstAidCropResult = { token: string; blockId: string; excerptId: string; imageName: string; aspectRatio: number };

export type PdfOutlineEntry = { title: string; page: number | null; depth: number };
export type PdfRailTab = "pages" | "outline" | "search" | "marks";
export type NoteSheetViewMode = "single" | "continuous";
export type NotePanel = "ink" | "shape" | "text" | "paper" | null;
export type PdfPanel = "view" | "ink" | null;
export type SearchResult = { documentId: string | null; documentName: string; page: number; snippet: string; occurrences: number };
export type PdfHistory = Record<string, PdfAnnotationHistory>;

export type LayerDirection = "back" | "backward" | "forward" | "front";
export type TextCommand = "font" | "size" | "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript" | "color" | "background" | "clear" | "left" | "center" | "right" | "justify" | "bullets" | "numbering";
export type ListLevelDirection = "decrease" | "increase";
export type SelectedTextBoxAppearance = ExcerptAppearance | null;
export type SelectedExcerpt = NoteExcerpt | null;
export type PaperTemplateOption = { id: PaperTemplate; label: string };
