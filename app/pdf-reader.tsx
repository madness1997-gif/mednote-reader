"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdfCanvasBudget } from "./pdf-canvas-budget";
import { observePdfPageProximity } from "./pdf-page-visibility";
import { pdfWorkScheduler, scheduleIdleWork, type PdfWorkPriority, type ScheduledPdfWork } from "./pdf-work-scheduler";
import type { PDFiumDocument } from "./pdfium-renderer";

import type { PdfAnnotation, PdfCropResult, PdfFitMode, PdfInkAnnotation, PdfMarkupAnnotation, PdfObjectAnnotation, PdfPoint, PdfRect, PdfSelection, PdfTool, PdfViewMode } from "./pdf-domain";
export type { PdfAnnotation, PdfCropResult, PdfFitMode, PdfInkAnnotation, PdfMarkupAnnotation, PdfObjectAnnotation, PdfPoint, PdfRect, PdfSelection, PdfTool, PdfViewMode } from "./pdf-domain";

type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;

const PDF_DISPLAY_MAX_PIXELS = 8_000_000;
const PDF_DISPLAY_MAX_DIMENSION = 8_192;
const PDF_CROP_MAX_PIXELS = 16_000_000;
const PDF_CROP_MAX_DIMENSION = 8_192;

function boundedRenderRatio(
  cssWidth: number,
  cssHeight: number,
  preferredRatio: number,
  maxPixels = PDF_DISPLAY_MAX_PIXELS,
  maxDimension = PDF_DISPLAY_MAX_DIMENSION,
) {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const pixelBound = Math.sqrt(maxPixels / (width * height));
  const dimensionBound = Math.min(maxDimension / width, maxDimension / height);
  return Math.max(.5, Math.min(preferredRatio, pixelBound, dimensionBound));
}

function displayRenderRatio(cssWidth: number, cssHeight: number) {
  const screenRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // A modest supersample on standard-density displays noticeably improves small
  // glyphs. HiDPI screens use their real density, up to 3x, while the pixel cap
  // prevents a zoomed A4 page from allocating an unbounded RGBA bitmap.
  return boundedRenderRatio(cssWidth, cssHeight, Math.min(3, Math.max(1.5, screenRatio)));
}

function previewRenderRatio(cssWidth: number, cssHeight: number, fullRatio: number) {
  return boundedRenderRatio(cssWidth, cssHeight, Math.min(1, fullRatio), 2_500_000, 4_096);
}

function releaseCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.width = "1px";
  canvas.style.height = "1px";
}

function isRenderCancellation(error: unknown) {
  return (error as Error)?.name === "RenderingCancelledException" || (error as Error)?.name === "AbortError";
}

function bitmapImageData(bitmap: { data: Uint8Array; width: number; height: number }) {
  const pixels = new Uint8ClampedArray(
    bitmap.data.buffer as ArrayBuffer,
    bitmap.data.byteOffset,
    bitmap.data.byteLength,
  );
  return new ImageData(pixels, bitmap.width, bitmap.height);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .95));
}

function withRenderTimeout<T>(promise: Promise<T>, timeoutMs = 5_000) {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("PDFium render timed out")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

function normalizeRect(rect: PdfRect): PdfRect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

type VisualRect = { left: number; top: number; right: number; bottom: number };

function mergeVisualRects(rects: VisualRect[], gapTolerance = 1.5) {
  const merged: VisualRect[] = [];

  rects
    .filter((rect) => rect.right - rect.left > 1 && rect.bottom - rect.top > 1)
    .sort((a, b) => {
      const smallestHeight = Math.min(a.bottom - a.top, b.bottom - b.top);
      return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= smallestHeight * .25
        ? a.left - b.left
        : a.top - b.top;
    })
    .forEach((rect) => {
      let candidate = { ...rect };
      let matchIndex = -1;

      // Chrome may expose the same PDF.js glyph through several nested spans.
      // Union only fragments that overlap on the same visual line; separated
      // columns and meaningful inline gaps remain independent rectangles.
      do {
        matchIndex = merged.findIndex((other) => {
          const verticalOverlap = Math.min(other.bottom, candidate.bottom) - Math.max(other.top, candidate.top);
          const smallestHeight = Math.min(other.bottom - other.top, candidate.bottom - candidate.top);
          const sameLine = verticalOverlap >= smallestHeight * .55;
          const touchesHorizontally = candidate.left <= other.right + gapTolerance
            && candidate.right >= other.left - gapTolerance;
          return sameLine && touchesHorizontally;
        });
        if (matchIndex >= 0) {
          const other = merged.splice(matchIndex, 1)[0];
          candidate = {
            left: Math.min(candidate.left, other.left),
            top: Math.min(candidate.top, other.top),
            right: Math.max(candidate.right, other.right),
            bottom: Math.max(candidate.bottom, other.bottom),
          };
        }
      } while (matchIndex >= 0);

      merged.push(candidate);
    });

  return merged.sort((a, b) => Math.abs(a.top - b.top) < 2 ? a.left - b.left : a.top - b.top);
}

function selectionClientRects(rects: DOMRect[], clip: DOMRect) {
  const clipped = rects
    .map((rect) => ({
      left: Math.max(clip.left, rect.left),
      top: Math.max(clip.top, rect.top),
      right: Math.min(clip.right, rect.right),
      bottom: Math.min(clip.bottom, rect.bottom),
    }));

  return mergeVisualRects(clipped);
}

function viewportRect(viewport: PageViewport, rect: PdfRect) {
  const converted = viewport.convertToViewportRectangle([rect.x1, rect.y1, rect.x2, rect.y2]);
  return {
    left: Math.min(converted[0], converted[2]),
    top: Math.min(converted[1], converted[3]),
    width: Math.abs(converted[2] - converted[0]),
    height: Math.abs(converted[3] - converted[1]),
  };
}

async function renderPdfCrop(
  document: PDFDocumentProxy,
  page: number,
  viewport: PageViewport,
  rotation: number,
  box: { left: number; top: number; width: number; height: number },
) {
  const pdfPage = await document.getPage(page);
  const screenRatio = window.devicePixelRatio || 1;
  // Keep crops useful in notes even when the source page is fitted very small.
  // 2.5 output pixels per PDF point is roughly 180 dpi; the selected-region
  // render avoids allocating a full high-resolution page for a small table.
  const preferredRatio = Math.min(6, Math.max(2.5, screenRatio, 2.5 / Math.max(.1, viewport.scale)));
  const ratio = boundedRenderRatio(
    box.width,
    box.height,
    preferredRatio,
    PDF_CROP_MAX_PIXELS,
    PDF_CROP_MAX_DIMENSION,
  );
  const output = window.document.createElement("canvas");
  output.width = Math.max(1, Math.round(box.width * ratio));
  output.height = Math.max(1, Math.round(box.height * ratio));
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Không thể tạo canvas crop PDF");
  const highResolutionViewport = pdfPage.getViewport({ scale: viewport.scale * ratio, rotation });
  const renderTask = pdfPage.render({
    canvas: output,
    canvasContext: context,
    viewport: highResolutionViewport,
    transform: [1, 0, 0, 1, -box.left * ratio, -box.top * ratio],
  });
  await renderTask.promise;
  return canvasToBlob(output);
}

function annotationRects(annotation: Exclude<PdfAnnotation, PdfInkAnnotation>) {
  return "rects" in annotation ? annotation.rects : [annotation.rect];
}

function drawInkStroke(context: CanvasRenderingContext2D, viewport: PageViewport, stroke: PdfInkAnnotation) {
  if (!stroke.points.length) return;
  const points = stroke.points.map((point) => {
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
    return { x, y, pressure: point.pressure };
  });
  context.save();
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = Math.max(1, stroke.width * viewport.scale);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, Math.max(1, context.lineWidth / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    context.lineWidth = Math.max(1, stroke.width * viewport.scale * (.72 + point.pressure * .5));
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + point.x) / 2, (previous.y + point.y) / 2);
  }
  context.stroke();
  context.restore();
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0;
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

type PdfInkLayerProps = {
  viewport: PageViewport;
  tool: PdfTool;
  color: string;
  width: number;
  annotations: PdfInkAnnotation[];
  allAnnotations: PdfAnnotation[];
  onCommit: (next: PdfAnnotation[], previous: PdfAnnotation[]) => void;
};

function PdfInkLayer({ viewport, tool, color, width, annotations, allAnnotations, onCommit }: PdfInkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<PdfInkAnnotation[]>(annotations);
  const workingRef = useRef<PdfInkAnnotation[]>(annotations);
  const currentRef = useRef<PdfInkAnnotation | null>(null);
  const modeRef = useRef<"idle" | "pen" | "eraser">("idle");
  const erasedAnnotationIdsRef = useRef<Set<string>>(new Set());

  const render = useCallback((items = workingRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = viewport.width;
    const cssHeight = viewport.height;
    if (canvas.width !== Math.floor(cssWidth * ratio) || canvas.height !== Math.floor(cssHeight * ratio)) {
      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(cssHeight * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    items.forEach((stroke) => drawInkStroke(context, viewport, stroke));
  }, [viewport]);

  useEffect(() => {
    workingRef.current = annotations;
    render(annotations);
  }, [annotations, render]);

  useEffect(() => () => releaseCanvas(canvasRef.current), []);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): PdfPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    return { x, y, pressure: event.pressure || .5 };
  };

  const eraseAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const eraserRadius = 14;
    workingRef.current = workingRef.current.filter((stroke) => {
      const points = stroke.points.map((point) => viewport.convertToViewportPoint(point.x, point.y));
      if (points.length === 1) return Math.hypot(px - points[0][0], py - points[0][1]) > eraserRadius;
      return !points.slice(1).some((point, index) => pointSegmentDistance(px, py, points[index][0], points[index][1], point[0], point[1]) <= eraserRadius + stroke.width * viewport.scale / 2);
    });
    allAnnotations.forEach((annotation) => {
      if (annotation.kind === "ink" || erasedAnnotationIdsRef.current.has(annotation.id)) return;
      const hit = annotationRects(annotation).some((annotationRect) => {
        const box = viewportRect(viewport, annotationRect);
        return px >= box.left - eraserRadius
          && px <= box.left + box.width + eraserRadius
          && py >= box.top - eraserRadius
          && py <= box.top + box.height + eraserRadius;
      });
      if (hit) erasedAnnotationIdsRef.current.add(annotation.id);
    });
    render();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "pen" && tool !== "eraser") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beforeRef.current = annotations;
    workingRef.current = annotations;
    erasedAnnotationIdsRef.current.clear();
    if (tool === "eraser") {
      modeRef.current = "eraser";
      eraseAt(event);
      return;
    }
    modeRef.current = "pen";
    currentRef.current = {
      id: `pdf-ink-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: "ink",
      page: 0,
      color,
      width: width / viewport.scale,
      points: [pointFromEvent(event)],
      createdAt: Date.now(),
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (modeRef.current === "idle") return;
    event.preventDefault();
    if (modeRef.current === "eraser") {
      eraseAt(event);
      return;
    }
    const stroke = currentRef.current;
    if (!stroke) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    samples.forEach((sample) => {
      const [x, y] = viewport.convertToPdfPoint(sample.clientX - rect.left, sample.clientY - rect.top);
      stroke.points.push({ x, y, pressure: sample.pressure || .5 });
    });
    render([...beforeRef.current, stroke]);
  };

  const finish = () => {
    const mode = modeRef.current;
    modeRef.current = "idle";
    if (mode === "pen" && currentRef.current) {
      const nextInk = [...beforeRef.current, currentRef.current];
      workingRef.current = nextInk;
      onCommit(
        [...allAnnotations.filter((annotation) => annotation.kind !== "ink"), ...nextInk],
        allAnnotations,
      );
    } else if (mode === "eraser") {
      const nextInk = workingRef.current;
      const erasedIds = erasedAnnotationIdsRef.current;
      if (nextInk.length !== beforeRef.current.length || erasedIds.size) {
        onCommit(
          [
            ...allAnnotations.filter((annotation) => annotation.kind !== "ink" && !erasedIds.has(annotation.id)),
            ...nextInk,
          ],
          allAnnotations,
        );
      }
    }
    currentRef.current = null;
    erasedAnnotationIdsRef.current.clear();
    render();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`pdf-ink-layer ${tool === "pen" || tool === "eraser" ? "active" : ""} tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-label="Lớp viết và tẩy chú thích trên PDF"
    />
  );
}

function PdfObjectLayer({ viewport, annotations }: { viewport: PageViewport; annotations: PdfObjectAnnotation[] }) {
  return (
    <div className="pdf-object-layer" aria-hidden="true">
      {annotations.map((annotation) => {
        const box = viewportRect(viewport, annotation.rect);
        const style = {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          "--pdf-object-color": annotation.color,
          "--pdf-object-width": `${Math.max(1, annotation.width * viewport.scale)}px`,
        } as React.CSSProperties;
        if (annotation.kind === "arrow") {
          return (
            <svg key={annotation.id} className="pdf-object pdf-object-arrow" style={style} viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="3" y1="4" x2="91" y2="91" vectorEffect="non-scaling-stroke" />
              <polyline points="72,91 91,91 91,72" vectorEffect="non-scaling-stroke" />
            </svg>
          );
        }
        return (
          <span
            key={annotation.id}
            className={`pdf-object pdf-object-${annotation.kind}`}
            style={style}
            title={annotation.text}
          >
            {annotation.kind === "note" ? "✎" : annotation.text}
          </span>
        );
      })}
    </div>
  );
}

export type PdfPageViewProps = {
  document: PDFDocumentProxy;
  pdfiumDocument?: PDFiumDocument | null;
  page: number;
  zoom: number;
  fitMode: PdfFitMode;
  rotation: number;
  continuous?: boolean;
  interactive?: boolean;
  renderPriority?: PdfWorkPriority;
  tool: PdfTool;
  inkColor: string;
  highlightColor: string;
  inkWidth: number;
  annotationText: string;
  annotations: PdfAnnotation[];
  searchQuery?: string;
  sourceFocus?: PdfRect | null;
  onSelection: (selection: PdfSelection | null) => void;
  onAnnotationCommit: (next: PdfAnnotation[], previous: PdfAnnotation[]) => void;
  onCrop: (result: PdfCropResult) => void | Promise<void>;
  onBitmapReady?: (page: number) => void;
};

export function PdfPageView({
  document,
  pdfiumDocument = null,
  page,
  zoom,
  fitMode,
  rotation,
  continuous = false,
  interactive = true,
  renderPriority = "visible",
  tool,
  inkColor,
  highlightColor,
  inkWidth,
  annotationText,
  annotations,
  searchQuery = "",
  sourceFocus,
  onSelection,
  onAnnotationCommit,
  onCrop,
  onBitmapReady,
}: PdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [hostSize, setHostSize] = useState({ width: 700, height: 850, pixelRatio: 1 });
  const [loading, setLoading] = useState(true);
  const hasRenderedRef = useRef(false);
  const hasNotifiedVisibleBitmapRef = useRef(false);
  const onBitmapReadyRef = useRef(onBitmapReady);
  const selectionTimerRef = useRef<number | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const areaHighlightStartRef = useRef<{ x: number; y: number } | null>(null);
  const objectStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const interactionModeRef = useRef<PdfTool | null>(null);
  const pointerInsideRef = useRef(false);
  const [cropBox, setCropBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [areaHighlightBox, setAreaHighlightBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [objectBox, setObjectBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);

  onBitmapReadyRef.current = onBitmapReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const stage = host.closest(".document-stage") as HTMLElement | null;
      // A mode switch hides the Reader with CSS but intentionally keeps it
      // mounted so its scroll/session state survives. Ignore the transient
      // zero-sized layout while hidden; otherwise every page is re-rendered at
      // the minimum size and the browser can clamp the saved scroll position.
      if (stage && (!stage.clientWidth || !stage.clientHeight)) return;
      const stageStyle = stage ? window.getComputedStyle(stage) : null;
      const horizontalPadding = stageStyle
        ? Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight)
        : 0;
      const verticalPadding = stageStyle
        ? Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom)
        : 0;
      const nextSize = {
        width: Math.max(280, (stage?.clientWidth ?? host.clientWidth) - horizontalPadding - 2),
        // Leave room for the page-number chip. This makes “Vừa toàn trang” a
        // true whole-page view instead of hiding the bottom edge below scroll.
        height: Math.max(320, (stage?.clientHeight ?? host.clientHeight) - verticalPadding - 28),
        pixelRatio: window.devicePixelRatio || 1,
      };
      setHostSize((current) => (
        current.width === nextSize.width
        && current.height === nextSize.height
        && current.pixelRatio === nextSize.pixelRatio
          ? current
          : nextSize
      ));
    };
    update();
    const observer = new ResizeObserver(update);
    const stage = host.closest(".document-stage");
    if (stage) observer.observe(stage);
    else observer.observe(host);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let scheduled: ScheduledPdfWork<void> | null = null;
    let refinement: ScheduledPdfWork<void> | null = null;
    let refinementTimer: number | null = null;
    if (!hasRenderedRef.current) setLoading(true);

    const notifyVisibleBitmap = () => {
      if (renderPriority !== "visible" || hasNotifiedVisibleBitmapRef.current) return;
      hasNotifiedVisibleBitmapRef.current = true;
      window.requestAnimationFrame(() => {
        if (!disposed) onBitmapReadyRef.current?.(page);
      });
    };

    const renderPdfJs = async (
      pdfPage: PDFPageProxy,
      nextViewport: PageViewport,
      ratio: number,
      preservePrevious: boolean,
      signal: AbortSignal,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas || signal.aborted) throw new DOMException("PDF render cancelled", "AbortError");
      const target = preservePrevious ? window.document.createElement("canvas") : canvas;
      target.width = Math.max(1, Math.round(nextViewport.width * ratio));
      target.height = Math.max(1, Math.round(nextViewport.height * ratio));
      const context = target.getContext("2d", { alpha: false });
      if (!context) throw new Error("Không thể tạo canvas PDF.js");
      const renderTask: PDFRenderTask = pdfPage.render({
        canvas: target,
        canvasContext: context,
        viewport: nextViewport,
        transform: [target.width / nextViewport.width, 0, 0, target.height / nextViewport.height, 0, 0],
      });
      const cancel = () => renderTask.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        await renderTask.promise;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
      if (signal.aborted || disposed) throw new DOMException("PDF render cancelled", "AbortError");
      if (target !== canvas) {
        canvas.width = target.width;
        canvas.height = target.height;
        const displayContext = canvas.getContext("2d", { alpha: false });
        if (!displayContext) throw new Error("Không thể tạo canvas hiển thị PDF.js");
        displayContext.drawImage(target, 0, 0);
        releaseCanvas(target);
      }
    };

    const renderPdfium = async (
      pdfPage: PDFPageProxy,
      nextViewport: PageViewport,
      ratio: number,
      signal: AbortSignal,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas || !pdfiumDocument || signal.aborted) return false;
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      const unrotatedViewport = pdfPage.getViewport({ scale: nextViewport.scale, rotation: 0 });
      const bitmap = await withRenderTimeout(
        Promise.resolve(pdfiumDocument.getPage(page - 1)).then((pdfiumPage) => (
          pdfiumPage.render({
            width: Math.max(1, Math.round(unrotatedViewport.width * ratio)),
            height: Math.max(1, Math.round(unrotatedViewport.height * ratio)),
          })
        )),
      );
      if (signal.aborted || disposed) throw new DOMException("PDF render cancelled", "AbortError");

      const swapsAxes = normalizedRotation === 90 || normalizedRotation === 270;
      canvas.width = swapsAxes ? bitmap.height : bitmap.width;
      canvas.height = swapsAxes ? bitmap.width : bitmap.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Không thể tạo canvas PDFium");
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (normalizedRotation === 0) {
        context.putImageData(bitmapImageData(bitmap), 0, 0);
      } else {
        const source = window.document.createElement("canvas");
        source.width = bitmap.width;
        source.height = bitmap.height;
        const sourceContext = source.getContext("2d", { alpha: false });
        if (!sourceContext) throw new Error("Không thể tạo canvas xoay PDFium");
        sourceContext.putImageData(bitmapImageData(bitmap), 0, 0);
        context.save();
        context.imageSmoothingEnabled = false;
        if (normalizedRotation === 90) {
          context.translate(canvas.width, 0);
          context.rotate(Math.PI / 2);
        } else if (normalizedRotation === 180) {
          context.translate(canvas.width, canvas.height);
          context.rotate(Math.PI);
        } else if (normalizedRotation === 270) {
          context.translate(0, canvas.height);
          context.rotate(-Math.PI / 2);
        }
        context.drawImage(source, 0, 0);
        context.restore();
        releaseCanvas(source);
      }
      return true;
    };

    const timer = window.setTimeout(() => {
      const firstPass = !hasRenderedRef.current;
      scheduled = pdfWorkScheduler.schedule(renderPriority, async (signal) => {
        const pdfPage = await document.getPage(page);
        if (disposed || signal.aborted) throw new DOMException("PDF render cancelled", "AbortError");
        const base = pdfPage.getViewport({ scale: 1, rotation });
        const widthScale = hostSize.width / base.width;
        const pageScale = Math.min(widthScale, hostSize.height / base.height);
        const scale = Math.max(.2, (fitMode === "page" && !continuous ? pageScale : widthScale) * zoom);
        const nextViewport = pdfPage.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas || disposed) throw new DOMException("PDF render cancelled", "AbortError");
        const fullRatio = displayRenderRatio(nextViewport.width, nextViewport.height);
        const ratio = firstPass ? previewRenderRatio(nextViewport.width, nextViewport.height, fullRatio) : fullRatio;

        let renderedWithPdfium = false;
        if (!firstPass && pdfiumDocument && renderPriority === "visible") {
          try {
            renderedWithPdfium = await renderPdfium(pdfPage, nextViewport, ratio, signal);
          } catch {
            // PDF.js remains a safe fallback if PDFium cannot open a specific page.
          }
        }

        if (!renderedWithPdfium) {
          await renderPdfJs(pdfPage, nextViewport, ratio, hasRenderedRef.current, signal);
        }
        if (disposed || signal.aborted) throw new DOMException("PDF render cancelled", "AbortError");

        canvas.style.width = `${nextViewport.width}px`;
        canvas.style.height = `${nextViewport.height}px`;
        setViewport(nextViewport);
        hasRenderedRef.current = true;
        setLoading(false);
        notifyVisibleBitmap();

        // The first pass is deliberately a 1x preview. Refine it only after the
        // visible bitmap has been committed, and let newly visible pages jump
        // ahead of this quality pass.
        if (firstPass && fullRatio > ratio + .08) {
          refinementTimer = window.setTimeout(() => {
            if (disposed) return;
            refinement = pdfWorkScheduler.schedule("nearby", async (refinementSignal) => {
              await renderPdfJs(pdfPage, nextViewport, fullRatio, true, refinementSignal);
              if (!disposed && canvasRef.current) {
                canvasRef.current.style.width = `${nextViewport.width}px`;
                canvasRef.current.style.height = `${nextViewport.height}px`;
              }
            });
            void refinement.promise.catch(() => undefined);
          }, 80);
        }
      });
      void scheduled.promise.catch((error) => {
        if (!disposed && !isRenderCancellation(error)) setLoading(false);
      });
    }, hasRenderedRef.current ? 130 : 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (refinementTimer !== null) window.clearTimeout(refinementTimer);
      scheduled?.cancel();
      refinement?.cancel();
    };
  }, [continuous, document, fitMode, hostSize.height, hostSize.pixelRatio, hostSize.width, page, pdfiumDocument, renderPriority, rotation, zoom]);

  useEffect(() => {
    if (renderPriority !== "visible" || !hasRenderedRef.current || hasNotifiedVisibleBitmapRef.current) return;
    hasNotifiedVisibleBitmapRef.current = true;
    const frame = window.requestAnimationFrame(() => onBitmapReadyRef.current?.(page));
    return () => window.cancelAnimationFrame(frame);
  }, [page, renderPriority]);

  useEffect(() => {
    const textContainer = textLayerRef.current;
    if (!viewport || !textContainer || !interactive) {
      textContainer?.replaceChildren();
      return;
    }
    let disposed = false;
    let textLayer: { cancel: () => void } | null = null;
    let scheduled: ScheduledPdfWork<void> | null = null;
    textContainer.replaceChildren();
    textContainer.style.setProperty("--scale-factor", `${viewport.scale}`);
    textContainer.style.setProperty("--total-scale-factor", `${viewport.scale}`);
    textContainer.style.setProperty("--scale-round-x", "1px");
    textContainer.style.setProperty("--scale-round-y", "1px");
    const cancelIdle = scheduleIdleWork(() => {
      scheduled = pdfWorkScheduler.schedule(renderPriority === "visible" ? "interactive" : "secondary", async (signal) => {
        const pdfPage = await document.getPage(page);
        const [{ TextLayer }, textContent] = await Promise.all([
          import("pdfjs-dist"),
          pdfPage.getTextContent(),
        ]);
        if (disposed || signal.aborted) return;
        const layer = new TextLayer({ textContentSource: textContent, container: textContainer, viewport });
        textLayer = layer;
        const cancel = () => layer.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        try {
          await layer.render();
        } finally {
          signal.removeEventListener("abort", cancel);
        }
        if (disposed || signal.aborted) return;
        const query = searchQuery.trim().toLocaleLowerCase();
        if (query) {
          layer.textDivs.forEach((element, index) => {
            if (layer.textContentItemsStr[index]?.toLocaleLowerCase().includes(query)) element.classList.add("pdf-search-hit");
          });
        }
      });
      void scheduled.promise.catch(() => { /* a bitmap page remains readable if its text layer fails */ });
    }, renderPriority === "visible" ? 450 : 1_200);
    return () => {
      disposed = true;
      cancelIdle();
      scheduled?.cancel();
      textLayer?.cancel();
    };
  }, [document, interactive, page, renderPriority, searchQuery, viewport]);

  useEffect(() => () => {
    releaseCanvas(canvasRef.current);
    textLayerRef.current?.replaceChildren();
  }, []);

  const pageAnnotations = useMemo(() => annotations.filter((annotation) => annotation.page === page), [annotations, page]);
  const inkAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfInkAnnotation => annotation.kind === "ink"), [pageAnnotations]);
  const markupAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfMarkupAnnotation => "rects" in annotation), [pageAnnotations]);
  const objectAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfObjectAnnotation => "rect" in annotation), [pageAnnotations]);
  const highlightGroups = useMemo(() => {
    if (!viewport) return [];
    const groups = new Map<string, VisualRect[]>();
    markupAnnotations.forEach((annotation) => {
      if (annotation.kind !== "highlight" && annotation.kind !== "area-highlight") return;
      const boxes = annotation.rects.map((rect) => {
        const box = viewportRect(viewport, rect);
        return { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };
      });
      groups.set(annotation.color, [...(groups.get(annotation.color) ?? []), ...boxes]);
    });
    return Array.from(groups, ([color, boxes]) => ({ color, boxes: mergeVisualRects(boxes) }));
  }, [markupAnnotations, viewport]);

  const captureSelection = useCallback((delay = 18) => {
    if (!viewport || !surfaceRef.current || !textLayerRef.current || !["smart", "select", "highlight", "underline", "strikeout", "squiggly"].includes(tool)) return;
    if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const layer = textLayerRef.current;
      if (!layer || !selection.anchorNode || !selection.focusNode || !layer.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return;
      const text = selection.toString()
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (!text) return;
      const surface = surfaceRef.current!;
      const surfaceRect = surface.getBoundingClientRect();
      const contentRect = new DOMRect(
        surfaceRect.left + surface.clientLeft,
        surfaceRect.top + surface.clientTop,
        viewport.width,
        viewport.height,
      );
      const clientRects = selectionClientRects(Array.from(range.getClientRects()), contentRect);
      const rects = clientRects.map((rect) => {
        const [x1, y1] = viewport.convertToPdfPoint(rect.left - contentRect.left, rect.top - contentRect.top);
        const [x2, y2] = viewport.convertToPdfPoint(rect.right - contentRect.left, rect.bottom - contentRect.top);
        return normalizeRect({ x1, y1, x2, y2 });
      });
      if (!rects.length) return;
      const anchor = clientRects.at(-1)!;
      const menuHalfWidth = Math.min(190, Math.max(0, window.innerWidth / 2 - 10));
      const availableAbove = Math.max(0, anchor.top - 20);
      const availableBelow = Math.max(0, window.innerHeight - anchor.bottom - 20);
      const menuPlacement = availableAbove >= availableBelow ? "above" : "below";
      onSelection({
        page,
        text,
        rects,
        menuX: Math.min(window.innerWidth - menuHalfWidth, Math.max(menuHalfWidth, (anchor.left + anchor.right) / 2)),
        menuY: menuPlacement === "above" ? anchor.top - 10 : anchor.bottom + 10,
        menuPlacement,
        menuMaxHeight: Math.max(180, Math.min(520, menuPlacement === "above" ? availableAbove : availableBelow)),
      });
    }, delay);
  }, [onSelection, page, tool, viewport]);

  useEffect(() => {
    if (tool !== "smart" && tool !== "select") return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const layer = textLayerRef.current;
      if (!selection || selection.isCollapsed || !layer || !selection.anchorNode || !selection.focusNode) return;
      if (layer.contains(selection.anchorNode) && layer.contains(selection.focusNode)) captureSelection(55);
    };
    window.document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    };
  }, [captureSelection, tool]);

  useEffect(() => {
    if (tool !== "smart") {
      setSpacePanning(false);
      return;
    }
    const editableTarget = (target: EventTarget | null) => (
      target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || editableTarget(event.target) || !pointerInsideRef.current) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      setSpacePanning(true);
    };
    const stopSpacePan = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePanning(false);
    };
    const onWindowBlur = () => setSpacePanning(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", stopSpacePan);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", stopSpacePan);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [tool]);

  useEffect(() => {
    if (spacePanning || interactionModeRef.current !== "pan") return;
    interactionModeRef.current = null;
    panStartRef.current = null;
  }, [spacePanning]);

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current!;
    const rect = surface.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(viewport?.width ?? rect.width, event.clientX - rect.left - surface.clientLeft)),
      y: Math.max(0, Math.min(viewport?.height ?? rect.height, event.clientY - rect.top - surface.clientTop)),
    };
  };

  const onInteractionDown = (event: React.PointerEvent<HTMLDivElement>, requestedMode: PdfTool = tool) => {
    if (!viewport || !["crop", "area-highlight", "pan", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(requestedMode)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionModeRef.current = requestedMode;
    if (requestedMode === "crop") {
      const point = pointerPosition(event);
      cropStartRef.current = point;
      setCropBox({ left: point.x, top: point.y, width: 0, height: 0 });
      return;
    }
    if (requestedMode === "area-highlight") {
      window.getSelection()?.removeAllRanges();
      onSelection(null);
      const point = pointerPosition(event);
      areaHighlightStartRef.current = point;
      setAreaHighlightBox({ left: point.x, top: point.y, width: 0, height: 0 });
      return;
    }
    if (["rectangle", "ellipse", "arrow"].includes(requestedMode)) {
      const point = pointerPosition(event);
      objectStartRef.current = point;
      setObjectBox({ left: point.x, top: point.y, width: 0, height: 0 });
      return;
    }
    if (["note", "text", "stamp", "signature"].includes(requestedMode)) {
      const point = pointerPosition(event);
      const dimensions = requestedMode === "note"
        ? { width: 30, height: 30 }
        : requestedMode === "text"
          ? { width: 210, height: 72 }
          : requestedMode === "stamp"
            ? { width: 132, height: 44 }
            : { width: 168, height: 52 };
      const left = Math.min(Math.max(0, point.x - dimensions.width / 2), Math.max(0, viewport.width - dimensions.width));
      const top = Math.min(Math.max(0, point.y - dimensions.height / 2), Math.max(0, viewport.height - dimensions.height));
      const [x1, y1] = viewport.convertToPdfPoint(left, top);
      const [x2, y2] = viewport.convertToPdfPoint(left + dimensions.width, top + dimensions.height);
      const annotation: PdfObjectAnnotation = {
        id: `pdf-${requestedMode}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: requestedMode as PdfObjectAnnotation["kind"],
        page,
        color: inkColor,
        width: Math.max(1, inkWidth / viewport.scale),
        rect: normalizeRect({ x1, y1, x2, y2 }),
        text: annotationText.trim() || (requestedMode === "stamp" ? "ĐÃ XEM" : requestedMode === "signature" ? "Ký tên" : "Ghi chú"),
        createdAt: Date.now(),
      };
      onAnnotationCommit([...pageAnnotations, annotation], pageAnnotations);
      return;
    }
    const stage = surfaceRef.current?.closest(".document-stage") as HTMLElement | null;
    if (!stage) return;
    window.getSelection()?.removeAllRanges();
    onSelection(null);
    panStartRef.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  };

  const onInteractionMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const mode = interactionModeRef.current;
    if (mode === "crop" && cropStartRef.current) {
      event.preventDefault();
      const point = pointerPosition(event);
      const start = cropStartRef.current;
      setCropBox({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      return;
    }
    if (mode === "area-highlight" && areaHighlightStartRef.current) {
      event.preventDefault();
      const point = pointerPosition(event);
      const start = areaHighlightStartRef.current;
      setAreaHighlightBox({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      return;
    }
    if (mode && ["rectangle", "ellipse", "arrow"].includes(mode) && objectStartRef.current) {
      event.preventDefault();
      const point = pointerPosition(event);
      const start = objectStartRef.current;
      setObjectBox({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      return;
    }
    if (mode === "pan" && panStartRef.current) {
      event.preventDefault();
      const stage = surfaceRef.current?.closest(".document-stage") as HTMLElement | null;
      if (!stage) return;
      stage.scrollLeft = panStartRef.current.left - (event.clientX - panStartRef.current.x);
      stage.scrollTop = panStartRef.current.top - (event.clientY - panStartRef.current.y);
    }
  };

  const finishInteraction = () => {
    const mode = interactionModeRef.current;
    interactionModeRef.current = null;
    panStartRef.current = null;
    pointerInsideRef.current = Boolean(surfaceRef.current?.matches(":hover"));
    if (mode === "area-highlight") {
      const box = areaHighlightBox;
      areaHighlightStartRef.current = null;
      setAreaHighlightBox(null);
      if (!box || !viewport || box.width < 4 || box.height < 4) return;
      const [x1, y1] = viewport.convertToPdfPoint(box.left, box.top);
      const [x2, y2] = viewport.convertToPdfPoint(box.left + box.width, box.top + box.height);
      const annotation: PdfMarkupAnnotation = {
        id: `pdf-area-highlight-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: "area-highlight",
        page,
        color: highlightColor,
        rects: [normalizeRect({ x1, y1, x2, y2 })],
        text: "",
        createdAt: Date.now(),
      };
      onAnnotationCommit([...pageAnnotations, annotation], pageAnnotations);
      return;
    }
    if (mode && ["rectangle", "ellipse", "arrow"].includes(mode)) {
      const box = objectBox;
      objectStartRef.current = null;
      setObjectBox(null);
      if (!box || !viewport || box.width < 5 || box.height < 5) return;
      const [x1, y1] = viewport.convertToPdfPoint(box.left, box.top);
      const [x2, y2] = viewport.convertToPdfPoint(box.left + box.width, box.top + box.height);
      const annotation: PdfObjectAnnotation = {
        id: `pdf-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: mode as PdfObjectAnnotation["kind"],
        page,
        color: inkColor,
        width: Math.max(1, inkWidth / viewport.scale),
        rect: normalizeRect({ x1, y1, x2, y2 }),
        text: "",
        createdAt: Date.now(),
      };
      onAnnotationCommit([...pageAnnotations, annotation], pageAnnotations);
      return;
    }
    if (mode !== "crop" || !cropStartRef.current || !cropBox || !viewport || cropBox.width < 10 || cropBox.height < 10) {
      cropStartRef.current = null;
      if (mode === "crop") setCropBox(null);
      return;
    }
    const box = cropBox;
    const activeViewport = viewport;
    const sourceCanvas = canvasRef.current;
    const [x1, y1] = activeViewport.convertToPdfPoint(box.left, box.top);
    const [x2, y2] = activeViewport.convertToPdfPoint(box.left + box.width, box.top + box.height);
    const rect = normalizeRect({ x1, y1, x2, y2 });
    cropStartRef.current = null;
    setCropBox(null);

    void (async () => {
      let blob: Blob | null = null;
      try {
        // Render the selected PDF region again from vector/source content. Crop
        // quality is therefore independent of the current fit-to-page bitmap.
        blob = await renderPdfCrop(document, page, activeViewport, rotation, box);
      } catch {
        // Keep crop available for unusual PDFs that PDF.js cannot re-render.
        if (sourceCanvas) {
          const scaleX = sourceCanvas.width / activeViewport.width;
          const scaleY = sourceCanvas.height / activeViewport.height;
          const output = window.document.createElement("canvas");
          output.width = Math.max(1, Math.round(box.width * scaleX));
          output.height = Math.max(1, Math.round(box.height * scaleY));
          output.getContext("2d")?.drawImage(
            sourceCanvas,
            box.left * scaleX,
            box.top * scaleY,
            box.width * scaleX,
            box.height * scaleY,
            0,
            0,
            output.width,
            output.height,
          );
          blob = await canvasToBlob(output);
        }
      }
      if (blob) await onCrop({ page, blob, rect });
    })();
  };

  return (
    <div className="pdf-page-host" ref={hostRef} data-page={page}>
      {loading && <div className="pdf-loading">Đang dựng trang {page}…</div>}
      <div
        ref={surfaceRef}
        className={`pdf-page-surface pdf-tool-${tool}`}
        style={viewport ? { width: viewport.width, height: viewport.height } : undefined}
        onPointerUp={() => captureSelection(16)}
        onPointerEnter={() => { pointerInsideRef.current = true; }}
        onPointerLeave={() => { if (!panStartRef.current) pointerInsideRef.current = false; }}
      >
        <canvas ref={canvasRef} className="pdf-page-canvas" />
        {viewport && interactive && (
          <div className="pdf-markup-layer" aria-hidden="true">
            {highlightGroups.length > 0 && (
              <svg className="pdf-highlight-svg" viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none">
                {highlightGroups.map(({ color, boxes }) => (
                  <path
                    key={color}
                    className="pdf-highlight-shape"
                    fill={color}
                    d={boxes.map((box) => `M ${box.left} ${box.top} H ${box.right} V ${box.bottom} H ${box.left} Z`).join(" ")}
                  />
                ))}
              </svg>
            )}
            {markupAnnotations.filter((annotation) => annotation.kind !== "highlight" && annotation.kind !== "area-highlight").flatMap((annotation) => annotation.rects.map((rect, index) => {
              const box = viewportRect(viewport, rect);
              return <span key={`${annotation.id}-${index}`} className={`pdf-markup pdf-markup-${annotation.kind}`} style={{ left: box.left, top: box.top, width: box.width, height: box.height, "--markup-color": annotation.color } as React.CSSProperties} />;
            }))}
            {sourceFocus && (() => {
              const box = viewportRect(viewport, sourceFocus);
              return <span className="pdf-source-focus" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />;
            })()}
          </div>
        )}
        <div ref={textLayerRef} className={`textLayer pdf-text-layer ${["smart", "select", "highlight", "underline", "strikeout", "squiggly"].includes(tool) ? "selectable" : ""} ${tool === "smart" ? "smart-selectable" : ""}`} />
        {viewport && interactive && <PdfObjectLayer viewport={viewport} annotations={objectAnnotations} />}
        {viewport && interactive && <PdfInkLayer viewport={viewport} tool={tool} color={inkColor} width={inkWidth} annotations={inkAnnotations} allAnnotations={pageAnnotations} onCommit={onAnnotationCommit} />}
        {interactive && tool === "smart" && !spacePanning && (
          <div className="pdf-smart-pan-layer" onPointerDown={(event) => onInteractionDown(event, "pan")} onPointerMove={onInteractionMove} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} />
        )}
        {interactive && (spacePanning || ["crop", "area-highlight", "pan", "note", "text", "rectangle", "ellipse", "arrow", "stamp", "signature"].includes(tool)) && (
          <div className={`pdf-interaction-layer ${spacePanning ? "pan space-pan" : tool}`} onPointerDown={(event) => onInteractionDown(event, spacePanning ? "pan" : tool)} onPointerMove={onInteractionMove} onPointerUp={finishInteraction} onPointerCancel={finishInteraction}>
            {cropBox && <span className="pdf-crop-box" style={{ left: cropBox.left, top: cropBox.top, width: cropBox.width, height: cropBox.height }} />}
            {areaHighlightBox && <span className="pdf-area-highlight-box" style={{ left: areaHighlightBox.left, top: areaHighlightBox.top, width: areaHighlightBox.width, height: areaHighlightBox.height, "--markup-color": highlightColor } as React.CSSProperties} />}
            {objectBox && <span className={`pdf-object-preview preview-${tool}`} style={{ left: objectBox.left, top: objectBox.top, width: objectBox.width, height: objectBox.height, "--pdf-object-color": inkColor, "--pdf-object-width": `${inkWidth}px` } as React.CSSProperties} />}
          </div>
        )}
      </div>
      <span className="pdf-page-number">{page}</span>
    </div>
  );
}

type LazyPdfPageViewProps = PdfPageViewProps & {
  estimatedHeight?: number;
  onHeightChange?: (page: number, height: number) => void;
};

function pdfCanvasBytes(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLCanvasElement>("canvas"))
    .reduce((total, canvas) => total + Math.max(0, canvas.width) * Math.max(0, canvas.height) * 4, 0);
}

function releasePdfCanvases(host: HTMLElement) {
  host.querySelectorAll<HTMLCanvasElement>("canvas").forEach(releaseCanvas);
}

export function LazyPdfPageView({ estimatedHeight, onHeightChange, ...props }: LazyPdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const nearbyRef = useRef(false);
  const hotRef = useRef(false);
  const [proximity, setProximity] = useState<"cold" | "nearby" | "visible">("cold");
  const [cacheAllowed, setCacheAllowed] = useState(true);
  const [measuredHeight, setMeasuredHeight] = useState(estimatedHeight ?? 780);
  const onHeightChangeRef = useRef(onHeightChange);
  const cacheKeyRef = useRef(`pdf-page-${props.page}-${Math.random().toString(16).slice(2)}`);
  const cacheKey = cacheKeyRef.current;

  onHeightChangeRef.current = onHeightChange;

  const updateProximity = useCallback(() => {
    const next = hotRef.current ? "visible" : nearbyRef.current ? "nearby" : "cold";
    if (next === "cold" && hostRef.current) releasePdfCanvases(hostRef.current);
    if (next === "visible") {
      setCacheAllowed(true);
      pdfCanvasBudget.touch(cacheKey);
    }
    setProximity((current) => current === next ? current : next);
  }, [cacheKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.closest(".document-stage");
    if (!root) return;
    const stopObserving = observePdfPageProximity(host, root, ({ nearby, visible }) => {
      nearbyRef.current = nearby;
      hotRef.current = visible;
      updateProximity();
    });
    return () => {
      nearbyRef.current = false;
      hotRef.current = false;
      stopObserving();
      releasePdfCanvases(host);
    };
  }, [updateProximity]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || proximity === "cold" || !cacheAllowed) {
      pdfCanvasBudget.remove(cacheKey);
      return;
    }
    const activeHost = host;

    let disposed = false;
    let evicting = false;
    const observedCanvases = new Set<HTMLCanvasElement>();
    const resizeObserver = new ResizeObserver(() => report());
    const observeCanvases = () => {
      activeHost.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
        if (observedCanvases.has(canvas)) return;
        observedCanvases.add(canvas);
        resizeObserver.observe(canvas);
      });
    };
    const evict = () => {
      if (disposed || evicting || hotRef.current) return;
      evicting = true;
      releasePdfCanvases(activeHost);
      setCacheAllowed(false);
    };
    function report() {
      if (disposed || evicting) return;
      observeCanvases();
      const bytes = pdfCanvasBytes(activeHost);
      if (bytes) pdfCanvasBudget.report(cacheKey, bytes, evict, () => hotRef.current);
    }
    const mutationObserver = new MutationObserver(report);
    mutationObserver.observe(activeHost, { subtree: true, childList: true, attributes: true, attributeFilter: ["width", "height", "style"] });
    window.requestAnimationFrame(report);
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      pdfCanvasBudget.remove(cacheKey);
    };
  }, [cacheAllowed, cacheKey, proximity]);

  useEffect(() => {
    const host = hostRef.current;
    const pageElement = host?.querySelector(".pdf-page-host");
    if (proximity === "cold" || !cacheAllowed || !pageElement) return;
    const update = () => {
      const height = Math.max(260, pageElement.getBoundingClientRect().height);
      setMeasuredHeight((current) => Math.abs(current - height) > 1 ? height : current);
      onHeightChangeRef.current?.(props.page, height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pageElement);
    return () => observer.disconnect();
  }, [cacheAllowed, proximity]);

  useEffect(() => {
    if (proximity !== "cold" || estimatedHeight === undefined) return;
    setMeasuredHeight((current) => Math.abs(current - estimatedHeight) > 1 ? estimatedHeight : current);
  }, [estimatedHeight, proximity]);

  const mounted = proximity !== "cold" && cacheAllowed;

  return (
    <div ref={hostRef} className="lazy-pdf-page" data-pdf-page={props.page} style={{ minHeight: mounted ? undefined : measuredHeight }}>
      {mounted ? (
        <PdfPageView
          {...props}
          continuous
          interactive={proximity === "visible"}
          renderPriority={proximity === "visible" ? "visible" : "nearby"}
        />
      ) : <div className="pdf-page-placeholder"><span>Trang {props.page}</span></div>}
    </div>
  );
}
