"use client";

import type { PDFDocumentProxy, PDFPageProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PdfTool = "pan" | "select" | "highlight" | "underline" | "strikeout" | "pen" | "eraser" | "crop";
export type PdfFitMode = "width" | "page";
export type PdfViewMode = "single" | "continuous";

export type PdfPoint = { x: number; y: number; pressure: number };
export type PdfRect = { x1: number; y1: number; x2: number; y2: number };

export type PdfMarkupAnnotation = {
  id: string;
  kind: "highlight" | "underline" | "strikeout";
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

export type PdfAnnotation = PdfMarkupAnnotation | PdfInkAnnotation;

export type PdfSelection = {
  page: number;
  text: string;
  rects: PdfRect[];
  menuX: number;
  menuY: number;
};

export type PdfCropResult = {
  page: number;
  blob: Blob;
  rect: PdfRect;
};

type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;

function normalizeRect(rect: PdfRect): PdfRect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
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
  onCommit: (next: PdfInkAnnotation[], previous: PdfInkAnnotation[]) => void;
};

function PdfInkLayer({ viewport, tool, color, width, annotations, onCommit }: PdfInkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<PdfInkAnnotation[]>(annotations);
  const workingRef = useRef<PdfInkAnnotation[]>(annotations);
  const currentRef = useRef<PdfInkAnnotation | null>(null);
  const modeRef = useRef<"idle" | "pen" | "eraser">("idle");

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

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): PdfPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    return { x, y, pressure: event.pressure || .5 };
  };

  const eraseAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    workingRef.current = workingRef.current.filter((stroke) => {
      const points = stroke.points.map((point) => viewport.convertToViewportPoint(point.x, point.y));
      if (points.length === 1) return Math.hypot(px - points[0][0], py - points[0][1]) > 14;
      return !points.slice(1).some((point, index) => pointSegmentDistance(px, py, points[index][0], points[index][1], point[0], point[1]) <= 14 + stroke.width * viewport.scale / 2);
    });
    render();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "pen" && tool !== "eraser") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    beforeRef.current = annotations;
    workingRef.current = annotations;
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
      const next = [...beforeRef.current, currentRef.current];
      workingRef.current = next;
      onCommit(next, beforeRef.current);
    } else if (mode === "eraser") {
      const next = workingRef.current;
      if (next.length !== beforeRef.current.length) onCommit(next, beforeRef.current);
    }
    currentRef.current = null;
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
      aria-label="Lớp viết tay trên PDF"
    />
  );
}

type PdfPageViewProps = {
  document: PDFDocumentProxy;
  page: number;
  zoom: number;
  fitMode: PdfFitMode;
  rotation: number;
  continuous?: boolean;
  tool: PdfTool;
  inkColor: string;
  inkWidth: number;
  annotations: PdfAnnotation[];
  searchQuery?: string;
  sourceFocus?: PdfRect | null;
  onSelection: (selection: PdfSelection) => void;
  onInkCommit: (next: PdfInkAnnotation[], previous: PdfInkAnnotation[]) => void;
  onCrop: (result: PdfCropResult) => void | Promise<void>;
};

export function PdfPageView({
  document,
  page,
  zoom,
  fitMode,
  rotation,
  continuous = false,
  tool,
  inkColor,
  inkWidth,
  annotations,
  searchQuery = "",
  sourceFocus,
  onSelection,
  onInkCommit,
  onCrop,
}: PdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [hostSize, setHostSize] = useState({ width: 700, height: 850 });
  const [loading, setLoading] = useState(true);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [cropBox, setCropBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const stage = host.closest(".document-stage") as HTMLElement | null;
      setHostSize({
        width: Math.max(280, host.clientWidth - 2),
        height: Math.max(420, (stage?.clientHeight ?? host.clientHeight) - 18),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    const stage = host.closest(".document-stage");
    if (stage) observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let renderTask: PDFRenderTask | null = null;
    let textLayer: { cancel: () => void } | null = null;
    setLoading(true);
    void document.getPage(page).then(async (pdfPage) => {
      if (disposed) return;
      const base = pdfPage.getViewport({ scale: 1, rotation });
      const widthScale = hostSize.width / base.width;
      const pageScale = Math.min(widthScale, hostSize.height / base.height);
      const scale = Math.max(.2, (fitMode === "page" && !continuous ? pageScale : widthScale) * zoom);
      const nextViewport = pdfPage.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      const textContainer = textLayerRef.current;
      if (!canvas || !textContainer || disposed) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(nextViewport.width * ratio);
      canvas.height = Math.floor(nextViewport.height * ratio);
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport: nextViewport });
      await renderTask.promise;
      if (disposed) return;

      textContainer.replaceChildren();
      textContainer.style.setProperty("--scale-factor", `${nextViewport.scale}`);
      textContainer.style.setProperty("--total-scale-factor", `${nextViewport.scale}`);
      textContainer.style.setProperty("--scale-round-x", "1px");
      textContainer.style.setProperty("--scale-round-y", "1px");
      const [{ TextLayer }, textContent] = await Promise.all([
        import("pdfjs-dist"),
        pdfPage.getTextContent(),
      ]);
      if (disposed) return;
      const layer = new TextLayer({ textContentSource: textContent, container: textContainer, viewport: nextViewport });
      textLayer = layer;
      await layer.render();
      if (disposed) return;
      textContainer.querySelectorAll<HTMLElement>("span.markedContent").forEach((element) => {
        element.style.top = "0";
        element.style.height = "0";
      });
      const query = searchQuery.trim().toLocaleLowerCase();
      if (query) {
        layer.textDivs.forEach((element, index) => {
          if (layer.textContentItemsStr[index]?.toLocaleLowerCase().includes(query)) element.classList.add("pdf-search-hit");
        });
      }
      setViewport(nextViewport);
      setLoading(false);
    }).catch((error) => {
      if (!disposed && (error as Error).name !== "RenderingCancelledException") setLoading(false);
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [continuous, document, fitMode, hostSize.height, hostSize.width, page, rotation, searchQuery, zoom]);

  const pageAnnotations = useMemo(() => annotations.filter((annotation) => annotation.page === page), [annotations, page]);
  const inkAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfInkAnnotation => annotation.kind === "ink"), [pageAnnotations]);
  const markupAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfMarkupAnnotation => annotation.kind !== "ink"), [pageAnnotations]);

  const captureSelection = () => {
    if (!viewport || !surfaceRef.current || !textLayerRef.current || !["select", "highlight", "underline", "strikeout"].includes(tool)) return;
    window.setTimeout(() => {
      const selection = window.getSelection();
      const textLayer = textLayerRef.current;
      if (!selection || selection.isCollapsed || !selection.rangeCount || !textLayer) return;
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
      if (!ancestor || !textLayer.contains(ancestor)) return;
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text) return;

      type ClientBox = { left: number; top: number; right: number; bottom: number; width: number; height: number };
      const boxes: ClientBox[] = [];
      const spans = Array.from(textLayer.querySelectorAll("span"));

      spans.forEach((span) => {
        try {
          if (!range.intersectsNode(span)) return;
        } catch {
          return;
        }

        const walker = window.document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode() as Text | null;
        while (textNode) {
          const data = textNode.data;
          let start = 0;
          let end = data.length;

          if (range.startContainer === textNode) start = Math.max(0, Math.min(data.length, range.startOffset));
          else if (span.contains(range.startContainer) && range.startContainer === span) start = range.startOffset > 0 ? data.length : 0;

          if (range.endContainer === textNode) end = Math.max(0, Math.min(data.length, range.endOffset));
          else if (span.contains(range.endContainer) && range.endContainer === span) end = range.endOffset <= 0 ? 0 : data.length;

          while (start < end && /\s/.test(data[start])) start += 1;
          while (end > start && /\s/.test(data[end - 1])) end -= 1;

          if (end > start) {
            const characterRange = window.document.createRange();
            characterRange.setStart(textNode, start);
            characterRange.setEnd(textNode, end);
            Array.from(characterRange.getClientRects()).forEach((rect) => {
              if (rect.width <= .5 || rect.height <= 1) return;
              const verticalInset = Math.min(1.5, rect.height * .08);
              const top = rect.top + verticalInset;
              const bottom = rect.bottom - verticalInset;
              boxes.push({
                left: rect.left,
                top,
                right: rect.right,
                bottom,
                width: rect.width,
                height: Math.max(1, bottom - top),
              });
            });
          }

          textNode = walker.nextNode() as Text | null;
        }
      });

      const fallback = boxes.length
        ? boxes
        : Array.from(range.getClientRects())
          .filter((rect) => rect.width > 1 && rect.height > 1)
          .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }));

      const mergedBoxes = fallback.reduce<ClientBox[]>((merged, box) => {
        const previous = merged.at(-1);
        if (!previous) return [box];
        const sameLine = Math.abs(previous.top - box.top) <= Math.max(2, Math.min(previous.height, box.height) * .28);
        const smallGap = box.left - previous.right <= Math.max(2.5, Math.min(previous.height, box.height) * .32);
        if (!sameLine || !smallGap || box.left < previous.left - 2) return [...merged, box];
        const left = Math.min(previous.left, box.left);
        const top = Math.min(previous.top, box.top);
        const right = Math.max(previous.right, box.right);
        const bottom = Math.max(previous.bottom, box.bottom);
        merged[merged.length - 1] = { left, top, right, bottom, width: right - left, height: bottom - top };
        return merged;
      }, []);

      if (!mergedBoxes.length) return;
      const layerRect = textLayer.getBoundingClientRect();
      const rects = mergedBoxes.map((rect) => {
        const [x1, y1] = viewport.convertToPdfPoint(rect.left - layerRect.left, rect.top - layerRect.top);
        const [x2, y2] = viewport.convertToPdfPoint(rect.right - layerRect.left, rect.bottom - layerRect.top);
        return normalizeRect({ x1, y1, x2, y2 });
      });
      const anchor = mergedBoxes.at(-1)!;
      onSelection({
        page,
        text,
        rects,
        menuX: Math.min(window.innerWidth - 14, Math.max(14, anchor.left + anchor.width / 2)),
        menuY: Math.max(62, anchor.top - 10),
      });
    }, 0);
  };

  const pointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };

  const onInteractionDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewport || (tool !== "crop" && tool !== "pan")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "crop") {
      const point = pointerPosition(event);
      cropStartRef.current = point;
      setCropBox({ left: point.x, top: point.y, width: 0, height: 0 });
      return;
    }
    const stage = surfaceRef.current?.closest(".document-stage") as HTMLElement | null;
    if (!stage) return;
    panStartRef.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  };

  const onInteractionMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "crop" && cropStartRef.current) {
      event.preventDefault();
      const point = pointerPosition(event);
      const start = cropStartRef.current;
      setCropBox({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
      return;
    }
    if (tool === "pan" && panStartRef.current) {
      event.preventDefault();
      const stage = surfaceRef.current?.closest(".document-stage") as HTMLElement | null;
      if (!stage) return;
      stage.scrollLeft = panStartRef.current.left - (event.clientX - panStartRef.current.x);
      stage.scrollTop = panStartRef.current.top - (event.clientY - panStartRef.current.y);
    }
  };

  const finishInteraction = () => {
    panStartRef.current = null;
    if (tool !== "crop" || !cropStartRef.current || !cropBox || !viewport || cropBox.width < 10 || cropBox.height < 10) {
      cropStartRef.current = null;
      if (tool === "crop") setCropBox(null);
      return;
    }
    const sourceCanvas = canvasRef.current;
    if (sourceCanvas) {
      const cssWidth = viewport.width;
      const cssHeight = viewport.height;
      const scaleX = sourceCanvas.width / cssWidth;
      const scaleY = sourceCanvas.height / cssHeight;
      const output = window.document.createElement("canvas");
      output.width = Math.max(1, Math.floor(cropBox.width * scaleX));
      output.height = Math.max(1, Math.floor(cropBox.height * scaleY));
      output.getContext("2d")?.drawImage(
        sourceCanvas,
        cropBox.left * scaleX,
        cropBox.top * scaleY,
        cropBox.width * scaleX,
        cropBox.height * scaleY,
        0,
        0,
        output.width,
        output.height,
      );
      const [x1, y1] = viewport.convertToPdfPoint(cropBox.left, cropBox.top);
      const [x2, y2] = viewport.convertToPdfPoint(cropBox.left + cropBox.width, cropBox.top + cropBox.height);
      output.toBlob((blob) => {
        if (blob) void onCrop({ page, blob, rect: normalizeRect({ x1, y1, x2, y2 }) });
      }, "image/png", .92);
    }
    cropStartRef.current = null;
    setCropBox(null);
  };

  return (
    <div className="pdf-page-host" ref={hostRef} data-page={page}>
      {loading && <div className="pdf-loading">Đang dựng trang {page}…</div>}
      <div
        ref={surfaceRef}
        className={`pdf-page-surface pdf-tool-${tool}`}
        style={viewport ? { width: viewport.width, height: viewport.height } : undefined}
        onPointerUp={captureSelection}
      >
        <canvas ref={canvasRef} className="pdf-page-canvas" />
        {viewport && (
          <div className="pdf-markup-layer" aria-hidden="true">
            {markupAnnotations.flatMap((annotation) => annotation.rects.map((rect, index) => {
              const box = viewportRect(viewport, rect);
              return <span key={`${annotation.id}-${index}`} className={`pdf-markup pdf-markup-${annotation.kind}`} style={{ left: box.left, top: box.top, width: box.width, height: box.height, "--markup-color": annotation.color } as React.CSSProperties} />;
            }))}
            {sourceFocus && (() => {
              const box = viewportRect(viewport, sourceFocus);
              return <span className="pdf-source-focus" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />;
            })()}
          </div>
        )}
        <div ref={textLayerRef} className={`textLayer pdf-text-layer ${["select", "highlight", "underline", "strikeout"].includes(tool) ? "selectable" : ""}`} />
        {viewport && <PdfInkLayer viewport={viewport} tool={tool} color={inkColor} width={inkWidth} annotations={inkAnnotations} onCommit={(next, previous) => onInkCommit(next.map((annotation) => ({ ...annotation, page })), previous.map((annotation) => ({ ...annotation, page })))} />}
        {(tool === "crop" || tool === "pan") && (
          <div className={`pdf-interaction-layer ${tool}`} onPointerDown={onInteractionDown} onPointerMove={onInteractionMove} onPointerUp={finishInteraction} onPointerCancel={finishInteraction}>
            {cropBox && <span className="pdf-crop-box" style={{ left: cropBox.left, top: cropBox.top, width: cropBox.width, height: cropBox.height }} />}
          </div>
        )}
      </div>
      <span className="pdf-page-number">{page}</span>
    </div>
  );
}

type LazyPdfPageViewProps = PdfPageViewProps & { estimatedHeight?: number };

export function LazyPdfPageView(props: LazyPdfPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.closest(".document-stage");
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), { root, rootMargin: "1200px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="lazy-pdf-page" data-pdf-page={props.page} style={{ minHeight: visible ? undefined : props.estimatedHeight ?? 780 }}>
      {visible ? <PdfPageView {...props} continuous /> : <div className="pdf-page-placeholder"><span>Trang {props.page}</span></div>}
    </div>
  );
}
