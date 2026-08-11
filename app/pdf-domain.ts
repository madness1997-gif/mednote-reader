export type PdfTool =
  | "smart"
  | "pan"
  | "select"
  | "highlight"
  | "area-highlight"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "pen"
  | "eraser"
  | "crop"
  | "note"
  | "text"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "stamp"
  | "signature";

export type PdfFitMode = "width" | "page";
export type PdfViewMode = "single" | "continuous";
export type PdfPoint = { x: number; y: number; pressure: number };
export type PdfRect = { x1: number; y1: number; x2: number; y2: number };

export type PdfMarkupAnnotation = {
  id: string;
  kind: "highlight" | "area-highlight" | "underline" | "strikeout" | "squiggly";
  page: number;
  color: string;
  rects: PdfRect[];
  text: string;
  createdAt: number;
};

export type PdfInkAnnotation = {
  id: string;
  kind: "ink";
  page: number;
  color: string;
  width: number;
  points: PdfPoint[];
  createdAt: number;
};

export type PdfObjectAnnotation = {
  id: string;
  kind: "note" | "text" | "rectangle" | "ellipse" | "arrow" | "stamp" | "signature";
  page: number;
  color: string;
  width: number;
  rect: PdfRect;
  text: string;
  createdAt: number;
};

export type PdfAnnotation = PdfMarkupAnnotation | PdfInkAnnotation | PdfObjectAnnotation;

export type PdfSelection = {
  page: number;
  text: string;
  rects: PdfRect[];
  menuX: number;
  menuY: number;
  menuPlacement: "above" | "below";
  menuMaxHeight: number;
};

export type PdfCropResult = {
  page: number;
  blob: Blob;
  rect: PdfRect;
};
