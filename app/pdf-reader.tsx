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
type TextPosition = { node: Text; offset: number };
type ClientBox = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type VisualBox = { left: number; top: number; width: number; height: number };

const TEXT_SELECTION_TOOLS: PdfTool[] = ["select", "highlight", "underline", "strikeout"];

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

function firstTextNode(node: Node | null): Text | null {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  const walker = node.ownerDocument?.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  return (walker?.nextNode() as Text | null) ?? null;
}

function characterOffsetFromPoint(textNode: Text, x: number, y: number) {
  const length = textNode.data.length;
  if (!length) return 0;
  const doc = textNode.ownerDocument;
  let low = 0;
  let high = length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const probe = doc.createRange();
    probe.setStart(textNode, 0);
    probe.setEnd(textNode, Math.min(length, middle + 1));
    const rects = Array.from(probe.getClientRects());
    const rect = rects.at(-1) ?? probe.getBoundingClientRect();
    const vertical = y >= rect.top - 4 && y <= rect.bottom + 4;
    const afterCharacter = vertical ? x > rect.right : y > rect.bottom;
    if (afterCharacter) low = middle + 1;
    else high = middle;
  }

  if (low < length) {
    const character = doc.createRange();
    character.setStart(textNode, low);
    character.setEnd(textNode, low + 1);
    const rect = character.getBoundingClientRect();
    if (x > rect.left + rect.width / 2) return low + 1;
  }
  return low;
}

function nearestTextPosition(root: HTMLElement, x: number, y: number): TextPosition | null {
  const doc = root.ownerDocument;
  const caretDoc = doc as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => CaretPosition | null;
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
  };

  const caretPosition = caretDoc.caretPositionFromPoint?.(x, y);
  if (caretPosition?.offsetNode && root.contains(caretPosition.offsetNode)) {
    const node = firstTextNode(caretPosition.offsetNode);
    if (node) {
      const offset = caretPosition.offsetNode === node
        ? Math.max(0, Math.min(node.data.length, caretPosition.offset))
        : characterOffsetFromPoint(node, x, y);
      return { node, offset };
    }
  }

  const caretRange = caretDoc.caretRangeFromPoint?.(x, y);
  if (caretRange?.startContainer && root.contains(caretRange.startContainer)) {
    const node = firstTextNode(caretRange.startContainer);
    if (node) {
      const offset = caretRange.startContainer === node
        ? Math.max(0, Math.min(node.data.length, caretRange.startOffset))
        : characterOffsetFromPoint(node, x, y);
      return { node, offset };
    }
  }

  let nearest: { span: HTMLElement; distance: number } | null = null;
  const spans = root.querySelectorAll<HTMLElement>("span");
  for (const span of spans) {
    if (!span.textContent) continue;
    const rect = span.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!nearest || distance < nearest.distance) nearest = { span, distance };
  }

  if (!nearest || nearest.distance > 28) return null;
  const node = firstTextNode(nearest.span);
  return node ? { node, offset: characterOffsetFromPoint(node, x, y) } : null;
}

function orderedRange(start: TextPosition, end: TextPosition) {
  const doc = start.node.ownerDocument;
  const startProbe = doc.createRange();
  startProbe.setStart(start.node, start.offset);
  startProbe.collapse(true);
  const endProbe = doc.createRange();
  endProbe.setStart(end.node, end.offset);
  endProbe.collapse(true);
  const forward = startProbe.compareBoundaryPoints(Range.START_TO_START, endProbe) <= 0;
  const range = doc.createRange();
  range.setStart(forward ? start.node : end.node, forward ? start.offset : end.offset);
  range.setEnd(forward ? end.node : start.node, forward ? end.offset : start.offset);
  return range;
}

function mergeSelectionBoxes(range: Range): ClientBox[] {
  const boxes = Array.from(range.getClientRects())
    .filter((rect) => rect.width > .6 && rect.height > 1)
    .map((rect) => {
      const verticalInset = Math.min(1.4, rect.height * .07);
      const top = rect.top + verticalInset;
      const bottom = rect.bottom - verticalInset;
      return {
        left: rect.left,
        top,
        right: rect.right,
        bottom,
        width: rect.width,
        height: Math.max(1, bottom - top),
      };
    })
    .filter((box, index, all) => !all.some((other, otherIndex) => (
      otherIndex !== index
      && other.left <= box.left + .5
      && other.right >= box.right - .5
      && other.top <= box.top + .5
      && other.bottom >= box.bottom - .5
      && other.width * other.height < box.width * box.height * 1.08
    )))
    .sort((a, b) => Math.abs(a.top - b.top) < 2 ? a.left - b.left : a.top - b.top);

  return boxes.reduce<ClientBox[]>((merged, box) => {
    const previous = merged.at(-1);
    if (!previous) return [box];
    const sameLine = Math.abs((previous.top + previous.bottom) / 2 - (box.top + box.bottom) / 2)
      <= Math.max(2.2, Math.min(previous.height, box.height) * .34);
    const gap = box.left - previous.right;
    if (!sameLine || gap > Math.max(4, Math.min(previous.height, box.height) * .42) || box.left < previous.left - 2) {
      return [...merged, box];
    }
    const left = Math.min(previous.left, box.left);
    const top = Math.min(previous.top, box.top);
    const right = Math.max(previous.right, box.right);
    const bottom = Math.max(previous.bottom, box.bottom);
    merged[merged.length - 1] = { left, top, right, bottom, width: right - left, height: bottom - top };
    return merged;
  }, []);
}

function expandToWord(position: TextPosition) {
  const text = position.node.data;
  if (!text) return { start: position, end: position };
  let cursor = Math.min(Math.max(position.offset, 0), text.length - 1);
  const wordCharacter = (value: string) => /[\p{L}\p{N}_]/u.test(value);
  if (!wordCharacter(text[cursor]) && cursor > 0 && wordCharacter(text[cursor - 1])) cursor -= 1;
  let start = cursor;
  let end = cursor;
  if (wordCharacter(text[cursor])) {
    while (start > 0 && wordCharacter(text[start - 1])) start -= 1;
    while (end < text.length && wordCharacter(text[end])) end += 1;
  } else {
    end = Math.min(text.length, cursor + 1);
  }
  return {
    start: { node: position.node, offset: start },
    end: { node: position.node, offset: end },
  };
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

  const render = useCallback((items: PdfInkAnnotation[] = workingRef.current) => {
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
  const selectionStartRef = useRef<TextPosition | null>(null);
  const selectionPointerRef = useRef<number | null>(null);
  const selectionPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionFrameRef = useRef<number | null>(null);
  const selectionMovedRef = useRef(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [hostSize, setHostSize] = useState({ width: 700, height: 850 });
  const [loading, setLoading] = useState(true);
  const [liveSelectionBoxes, setLiveSelectionBoxes] = useState<VisualBox[]>([]);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [cropBox, setCropBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selectionEnabled = TEXT_SELECTION_TOOLS.includes(tool);

  const clearSelectionVisual = useCallback(() => {
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
    selectionFrameRef.current = null;
    selectionStartRef.current = null;
    selectionPointerRef.current = null;
    selectionPointRef.current = null;
    selectionMovedRef.current = false;
    setLiveSelectionBoxes([]);
    window.getSelection()?.removeAllRanges();
  }, []);

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
    clearSelectionVisual();
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
  }, [clearSelectionVisual, continuous, document, fitMode, hostSize.height, hostSize.width, page, rotation, searchQuery, zoom]);

  useEffect(() => {
    if (!selectionEnabled) clearSelectionVisual();
  }, [clearSelectionVisual, selectionEnabled]);

  useEffect(() => {
    const onDocumentPointerDown = (event: PointerEvent) => {
      const surface = surfaceRef.current;
      if (surface && !surface.contains(event.target as Node)) setLiveSelectionBoxes([]);
    };
    window.document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => window.document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, []);

  const pageAnnotations = useMemo(() => annotations.filter((annotation) => annotation.page === page), [annotations, page]);
  const inkAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfInkAnnotation => annotation.kind === "ink"), [pageAnnotations]);
  const markupAnnotations = useMemo(() => pageAnnotations.filter((annotation): annotation is PdfMarkupAnnotation => annotation.kind !== "ink"), [pageAnnotations]);

  const publishSelection = useCallback((start: TextPosition, end: TextPosition, pointerX: number, pointerY: number, commit: boolean) => {
    const textLayer = textLayerRef.current;
    if (!viewport || !textLayer) return false;
    const range = orderedRange(start, end);
    const text = range.toString().replace(/\s+/g, " ").trim();
    const boxes = mergeSelectionBoxes(range);
    if (!text || !boxes.length) {
      setLiveSelectionBoxes([]);
      return false;
    }

    const layerRect = textLayer.getBoundingClientRect();
    setLiveSelectionBoxes(boxes.map((box) => ({
      left: box.left - layerRect.left,
      top: box.top - layerRect.top,
      width: box.width,
      height: box.height,
    })));

    if (!commit) return true;
    const rects = boxes.map((box) => {
      const [x1, y1] = viewport.convertToPdfPoint(box.left - layerRect.left, box.top - layerRect.top);
      const [x2, y2] = viewport.convertToPdfPoint(box.right - layerRect.left, box.bottom - layerRect.top);
      return normalizeRect({ x1, y1, x2, y2 });
    });
    const anchor = boxes.reduce((closest, box) => {
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
      return !closest || distance < closest.distance ? { box, distance } : closest;
    }, null as { box: ClientBox; distance: number } | null)?.box ?? boxes.at(-1)!;

    onSelection({
      page,
      text,
      rects,
      menuX: Math.min(window.innerWidth - 14, Math.max(14, anchor.left + anchor.width / 2)),
      menuY: Math.max(62, anchor.top - 9),
    });
    window.getSelection()?.removeAllRanges();
    return true;
  }, [onSelection, page, viewport]);

  const updateSelectionAtPoint = useCallback((x: number, y: number, commit = false) => {
    const textLayer = textLayerRef.current;
    const start = selectionStartRef.current;
    if (!textLayer || !start) return false;
    const end = nearestTextPosition(textLayer, x, y);
    return end ? publishSelection(start, end, x, y, commit) : false;
  }, [publishSelection]);

  const scheduleSelectionUpdate = useCallback((x: number, y: number) => {
    selectionPointRef.current = { x, y };
    if (selectionFrameRef.current !== null) return;
    selectionFrameRef.current = requestAnimationFrame(() => {
      selectionFrameRef.current = null;
      const point = selectionPointRef.current;
      if (point) updateSelectionAtPoint(point.x, point.y, false);
    });
  }, [updateSelectionAtPoint]);

  const autoScrollForSelection = (clientY: number) => {
    const stage = surfaceRef.current?.closest(".document-stage") as HTMLElement | null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const edge = Math.min(58, rect.height * .12);
    let delta = 0;
    if (clientY < rect.top + edge) delta = -Math.ceil((rect.top + edge - clientY) / 4);
    else if (clientY > rect.bottom - edge) delta = Math.ceil((clientY - (rect.bottom - edge)) / 4);
    if (delta) stage.scrollTop += Math.max(-22, Math.min(22, delta));
  };

  const onSelectionPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectionEnabled || event.button !== 0) return;
    const textLayer = textLayerRef.current;
    if (!textLayer) return;
    const position = nearestTextPosition(textLayer, event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    setLiveSelectionBoxes([]);
    selectionStartRef.current = position;
    selectionPointerRef.current = event.pointerId;
    selectionPointRef.current = { x: event.clientX, y: event.clientY };
    selectionMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onSelectionPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectionPointerRef.current !== event.pointerId || !selectionStartRef.current) return;
    event.preventDefault();
    const origin = selectionPointRef.current;
    if (!origin || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 2) selectionMovedRef.current = true;
    autoScrollForSelection(event.clientY);
    scheduleSelectionUpdate(event.clientX, event.clientY);
  };

  const finishTextSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectionPointerRef.current !== event.pointerId || !selectionStartRef.current) return;
    event.preventDefault();
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
    selectionFrameRef.current = null;
    const committed = selectionMovedRef.current && updateSelectionAtPoint(event.clientX, event.clientY, true);
    if (!committed) setLiveSelectionBoxes([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    selectionStartRef.current = null;
    selectionPointerRef.current = null;
    selectionPointRef.current = null;
    selectionMovedRef.current = false;
  };

  const cancelTextSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectionPointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    clearSelectionVisual();
  };

  const onSelectionDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectionEnabled) return;
    const textLayer = textLayerRef.current;
    if (!textLayer) return;
    const position = nearestTextPosition(textLayer, event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault();
    event.stopPropagation();
    const word = expandToWord(position);
    publishSelection(word.start, word.end, event.clientX, event.clientY, true);
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
      const scaleX = sourceCanvas.width / viewport.width;
      const scaleY = sourceCanvas.height / viewport.height;
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
        {liveSelectionBoxes.length > 0 && (
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
            {liveSelectionBoxes.map((box, index) => (
              <span
                key={`${box.left}-${box.top}-${index}`}
                style={{
                  position: "absolute",
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                  borderRadius: 2,
                  background: "rgba(37, 132, 193, .28)",
                  boxShadow: "inset 0 0 0 .5px rgba(22, 105, 161, .2)",
                }}
              />
            ))}
          </div>
        )}
        <div
          ref={textLayerRef}
          className={`textLayer pdf-text-layer ${selectionEnabled ? "selectable" : ""}`}
          style={selectionEnabled ? { zIndex: 3, userSelect: "none", WebkitUserSelect: "none", touchAction: "none", cursor: "text" } : undefined}
          onPointerDown={onSelectionPointerDown}
          onPointerMove={onSelectionPointerMove}
          onPointerUp={finishTextSelection}
          onPointerCancel={cancelTextSelection}
          onDoubleClick={onSelectionDoubleClick}
        />
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
