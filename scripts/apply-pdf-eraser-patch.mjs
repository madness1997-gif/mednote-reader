import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  const matches = source.split(oldText).length - 1;
  if (matches !== 1) {
    throw new Error(`Expected one ${label} match, found ${matches}`);
  }
  return source.replace(oldText, newText);
}

const readerPath = new URL("../app/pdf-reader.tsx", import.meta.url);
let reader = readFileSync(readerPath, "utf8");

reader = replaceOnce(
  reader,
  `type PdfInkLayerProps = {
  viewport: PageViewport;
  tool: PdfTool;
  color: string;
  width: number;
  annotations: PdfInkAnnotation[];
  onCommit: (next: PdfInkAnnotation[], previous: PdfInkAnnotation[]) => void;
};

function PdfInkLayer({ viewport, tool, color, width, annotations, onCommit }: PdfInkLayerProps) {`,
  `type PdfInkLayerProps = {
  viewport: PageViewport;
  tool: PdfTool;
  color: string;
  width: number;
  annotations: PdfInkAnnotation[];
  allAnnotations: PdfAnnotation[];
  markupAnnotations: PdfMarkupAnnotation[];
  onCommit: (next: PdfInkAnnotation[], previous: PdfInkAnnotation[]) => void;
};

function PdfInkLayer({ viewport, tool, color, width, annotations, allAnnotations, markupAnnotations, onCommit }: PdfInkLayerProps) {`,
  "PDF ink layer props",
);

reader = replaceOnce(
  reader,
  `  const currentRef = useRef<PdfInkAnnotation | null>(null);
  const modeRef = useRef<"idle" | "pen" | "eraser">("idle");`,
  `  const currentRef = useRef<PdfInkAnnotation | null>(null);
  const modeRef = useRef<"idle" | "pen" | "eraser">("idle");
  const erasedMarkupRef = useRef<Map<string, PdfMarkupAnnotation>>(new Map());`,
  "erased markup ref",
);

reader = replaceOnce(
  reader,
  `  const eraseAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    workingRef.current = workingRef.current.filter((stroke) => {
      const points = stroke.points.map((point) => viewport.convertToViewportPoint(point.x, point.y));
      if (points.length === 1) return Math.hypot(px - points[0][0], py - points[0][1]) > 14;
      return !points.slice(1).some((point, index) => pointSegmentDistance(px, py, points[index][0], points[index][1], point[0], point[1]) <= 14 + stroke.width * viewport.scale / 2);
    });
    render();
  };`,
  `  const eraseAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const eraserRadius = 14;
    workingRef.current = workingRef.current.filter((stroke) => {
      const points = stroke.points.map((point) => viewport.convertToViewportPoint(point.x, point.y));
      if (points.length === 1) return Math.hypot(px - points[0][0], py - points[0][1]) > eraserRadius;
      return !points.slice(1).some((point, index) => pointSegmentDistance(px, py, points[index][0], points[index][1], point[0], point[1]) <= eraserRadius + stroke.width * viewport.scale / 2);
    });
    markupAnnotations.forEach((annotation) => {
      if (erasedMarkupRef.current.has(annotation.id)) return;
      const hit = annotation.rects.some((markupRect) => {
        const box = viewportRect(viewport, markupRect);
        return px >= box.left - eraserRadius
          && px <= box.left + box.width + eraserRadius
          && py >= box.top - eraserRadius
          && py <= box.top + box.height + eraserRadius;
      });
      if (hit) erasedMarkupRef.current.set(annotation.id, annotation);
    });
    render();
  };`,
  "PDF eraser hit testing",
);

reader = replaceOnce(
  reader,
  `    beforeRef.current = annotations;
    workingRef.current = annotations;
    if (tool === "eraser") {`,
  `    beforeRef.current = annotations;
    workingRef.current = annotations;
    erasedMarkupRef.current.clear();
    if (tool === "eraser") {`,
  "eraser gesture reset",
);

reader = replaceOnce(
  reader,
  `  const finish = () => {
    const mode = modeRef.current;
    modeRef.current = "idle";
    if (mode === "pen" && currentRef.current) {
      const next = [...beforeRef.current, currentRef.current];
      workingRef.current = next;
      onCommit(next, beforeRef.current);
    } else if (mode === "eraser") {
      const next = workingRef.current;
      if (next.length !== beforeRef.current.length) onCommit(next, beforeRef.current);
    }
    currentRef.current = null;
    render();
  };`,
  `  const finish = () => {
    const mode = modeRef.current;
    modeRef.current = "idle";
    if (mode === "pen" && currentRef.current) {
      const next = [...beforeRef.current, currentRef.current];
      workingRef.current = next;
      onCommit(next, beforeRef.current);
    } else if (mode === "eraser") {
      const next = workingRef.current;
      const erasedMarkup = [...erasedMarkupRef.current.values()];
      if (erasedMarkup.length) {
        const erasedIds = new Set(erasedMarkup.map((annotation) => annotation.id));
        for (let index = allAnnotations.length - 1; index >= 0; index -= 1) {
          if (erasedIds.has(allAnnotations[index].id)) allAnnotations.splice(index, 1);
        }
      }
      if (next.length !== beforeRef.current.length || erasedMarkup.length) {
        onCommit(next, [...beforeRef.current, ...erasedMarkup] as PdfInkAnnotation[]);
      }
    }
    currentRef.current = null;
    erasedMarkupRef.current.clear();
    render();
  };`,
  "PDF eraser commit",
);

reader = replaceOnce(
  reader,
  `      aria-label="Lớp viết tay trên PDF"`,
  `      aria-label="Lớp viết và tẩy chú thích trên PDF"`,
  "PDF ink layer accessibility label",
);

reader = replaceOnce(
  reader,
  `        {viewport && <PdfInkLayer viewport={viewport} tool={tool} color={inkColor} width={inkWidth} annotations={inkAnnotations} onCommit={(next, previous) => onInkCommit(next.map((annotation) => ({ ...annotation, page })), previous.map((annotation) => ({ ...annotation, page })))} />}`,
  `        {viewport && <PdfInkLayer viewport={viewport} tool={tool} color={inkColor} width={inkWidth} annotations={inkAnnotations} allAnnotations={annotations} markupAnnotations={markupAnnotations} onCommit={(next, previous) => onInkCommit(next.map((annotation) => ({ ...annotation, page })), previous.map((annotation) => ({ ...annotation, page })))} />}`,
  "PDF ink layer invocation",
);

writeFileSync(readerPath, reader, "utf8");

const pagePath = new URL("../app/page.tsx", import.meta.url);
let page = readFileSync(pagePath, "utf8");
page = replaceOnce(
  page,
  `{ id: "eraser", label: "Tẩy nét bút trên PDF", shortLabel: "Tẩy", icon: Eraser },`,
  `{ id: "eraser", label: "Tẩy highlight, gạch chân, gạch ngang và nét bút", shortLabel: "Tẩy", icon: Eraser },`,
  "PDF eraser toolbar label",
);
writeFileSync(pagePath, page, "utf8");

console.log("PDF annotation eraser patch is applied.");
