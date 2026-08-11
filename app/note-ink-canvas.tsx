import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PenStyle, Point, ShapeKind, Stroke } from "./note-runtime-adapter";

export type NoteInkTool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function drawStroke(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stroke: Stroke) {
  if (!stroke.points.length) return;
  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;
  const first = stroke.points[0];
  const last = stroke.points.at(-1)!;
  const startX = first.x * canvasWidth;
  const startY = first.y * canvasHeight;
  const endX = last.x * canvasWidth;
  const endY = last.y * canvasHeight;
  context.save();
  const penStyle = stroke.penStyle ?? "ballpoint";
  context.globalAlpha = stroke.tool === "highlight" ? 0.3 : penStyle === "pencil" ? 0.58 : 1;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.tool === "shape") {
    context.beginPath();
    if (stroke.shape === "rectangle") {
      context.rect(startX, startY, endX - startX, endY - startY);
    } else if (stroke.shape === "ellipse" || stroke.shape === "circle") {
      context.ellipse((startX + endX) / 2, (startY + endY) / 2, Math.abs(endX - startX) / 2, Math.abs(endY - startY) / 2, 0, 0, Math.PI * 2);
    } else {
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
    }
    context.stroke();
    if (stroke.shape === "arrow") {
      const angle = Math.atan2(endY - startY, endX - startX);
      const head = Math.max(10, stroke.width * 4.5);
      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(endX - head * Math.cos(angle - Math.PI / 7), endY - head * Math.sin(angle - Math.PI / 7));
      context.moveTo(endX, endY);
      context.lineTo(endX - head * Math.cos(angle + Math.PI / 7), endY - head * Math.sin(angle + Math.PI / 7));
      context.stroke();
    }
    context.restore();
    return;
  }

  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(startX, startY, Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  const widthForPoint = (point: Point) => {
    if (stroke.tool === "highlight") return stroke.width;
    if (penStyle === "fountain") return stroke.width * (0.48 + point.pressure * 1.02);
    if (penStyle === "brush") return stroke.width * (0.35 + point.pressure * 1.5);
    if (penStyle === "pencil") return stroke.width * (0.72 + point.pressure * 0.28);
    return stroke.width * (0.9 + point.pressure * 0.18);
  };
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    const previous = stroke.points[index - 1];
    context.beginPath();
    context.moveTo(previous.x * canvasWidth, previous.y * canvasHeight);
    context.lineWidth = widthForPoint(point);
    context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    context.stroke();
  }
  context.restore();
}

function pointsForStroke(stroke: Stroke): Point[] {
  if (stroke.tool !== "shape" || stroke.points.length < 2) return stroke.points;
  const start = stroke.points[0];
  const end = stroke.points.at(-1)!;
  if (stroke.shape === "rectangle") {
    return [start, { x: end.x, y: start.y, pressure: .5 }, end, { x: start.x, y: end.y, pressure: .5 }, start];
  }
  if (stroke.shape === "ellipse" || stroke.shape === "circle") {
    return Array.from({ length: 41 }, (_, index) => {
      const angle = (index / 40) * Math.PI * 2;
      return {
        x: (start.x + end.x) / 2 + Math.cos(angle) * Math.abs(end.x - start.x) / 2,
        y: (start.y + end.y) / 2 + Math.sin(angle) * Math.abs(end.y - start.y) / 2,
        pressure: .5,
      };
    });
  }
  return [start, end];
}

function boundsForStrokes(strokes: Stroke[]) {
  const points = strokes.flatMap(pointsForStroke);
  if (!points.length) return null;
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegmentPixels(point: Point, start: Point, end: Point, canvas: HTMLCanvasElement) {
  const px = point.x * canvas.clientWidth;
  const py = point.y * canvas.clientHeight;
  const ax = start.x * canvas.clientWidth;
  const ay = start.y * canvas.clientHeight;
  const bx = end.x * canvas.clientWidth;
  const by = end.y * canvas.clientHeight;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

function eraseStrokeAtPoint(stroke: Stroke, point: Point, canvas: HTMLCanvasElement, radius: number): Stroke[] {
  const samples = pointsForStroke(stroke);
  if (stroke.tool === "shape") {
    const hit = samples.length === 1
      ? Math.hypot((samples[0].x - point.x) * canvas.clientWidth, (samples[0].y - point.y) * canvas.clientHeight) <= radius
      : samples.slice(1).some((sample, index) => distanceToSegmentPixels(point, samples[index], sample, canvas) <= radius + stroke.width / 2);
    return hit ? [] : [stroke];
  }
  if (stroke.points.length === 1) {
    return Math.hypot((stroke.points[0].x - point.x) * canvas.clientWidth, (stroke.points[0].y - point.y) * canvas.clientHeight) <= radius ? [] : [stroke];
  }

  const parts: Point[][] = [];
  let currentPart: Point[] = [];
  let touched = false;
  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    const start = stroke.points[index];
    const end = stroke.points[index + 1];
    if (distanceToSegmentPixels(point, start, end, canvas) <= radius + stroke.width / 2) {
      touched = true;
      if (currentPart.length > 1) parts.push(currentPart);
      currentPart = [];
    } else {
      if (!currentPart.length) currentPart.push(start);
      currentPart.push(end);
    }
  }
  if (currentPart.length > 1) parts.push(currentPart);
  if (!touched) return [stroke];
  return parts.map((points, index) => ({ ...stroke, id: index === 0 ? stroke.id : uid("stroke-part"), points }));
}

type InkCanvasProps = {
  tool: NoteInkTool;
  color: string;
  width: number;
  penStyle: PenStyle;
  shape: ShapeKind;
  strokes: Stroke[];
  onCommit: (next: Stroke[], previous: Stroke[]) => void;
};

export function NoteInkCanvas({ tool, color, width, penStyle, shape, strokes, onCommit }: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef(strokes);
  const workingStrokes = useRef(strokes);
  const currentStroke = useRef<Stroke | null>(null);
  const beforeStrokes = useRef<Stroke[]>(strokes);
  const lassoPath = useRef<Point[]>([]);
  const interaction = useRef<"idle" | "draw" | "erase" | "lasso" | "move" | "resize">("idle");
  const gestureStart = useRef<Point | null>(null);
  const lastEraserPoint = useRef<Point | null>(null);
  const baseSelectionBounds = useRef<ReturnType<typeof boundsForStrokes>>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);

  const renderCanvas = useCallback((displayStrokes: Stroke[] = workingStrokes.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.floor(canvas.clientWidth * ratio) || canvas.height !== Math.floor(canvas.clientHeight * ratio)) {
      canvas.width = Math.floor(canvas.clientWidth * ratio);
      canvas.height = Math.floor(canvas.clientHeight * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    displayStrokes.forEach((stroke) => drawStroke(context, canvas, stroke));

    const selected = displayStrokes.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
    const bounds = boundsForStrokes(selected);
    if (bounds) {
      const left = bounds.left * canvas.clientWidth;
      const top = bounds.top * canvas.clientHeight;
      const boxWidth = Math.max(12, (bounds.right - bounds.left) * canvas.clientWidth);
      const boxHeight = Math.max(12, (bounds.bottom - bounds.top) * canvas.clientHeight);
      context.save();
      context.strokeStyle = "#0e6b70";
      context.fillStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.strokeRect(left - 5, top - 5, boxWidth + 10, boxHeight + 10);
      context.setLineDash([]);
      context.fillRect(left + boxWidth + 1, top + boxHeight + 1, 9, 9);
      context.strokeRect(left + boxWidth + 1, top + boxHeight + 1, 9, 9);
      context.restore();
    }

    if (lassoPath.current.length > 1) {
      context.save();
      context.strokeStyle = "#0e6b70";
      context.fillStyle = "rgba(14,107,112,.06)";
      context.lineWidth = 1.5;
      context.setLineDash([6, 4]);
      context.beginPath();
      context.moveTo(lassoPath.current[0].x * canvas.clientWidth, lassoPath.current[0].y * canvas.clientHeight);
      lassoPath.current.slice(1).forEach((point) => context.lineTo(point.x * canvas.clientWidth, point.y * canvas.clientHeight));
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }
  }, []);

  useEffect(() => {
    strokesRef.current = strokes;
    workingStrokes.current = strokes;
    selectedIdsRef.current = selectedIdsRef.current.filter((id) => strokes.some((stroke) => stroke.id === id));
    if (selectedIdsRef.current.length !== selectedIds.length) setSelectedIds(selectedIdsRef.current);
    renderCanvas(strokes);
  }, [renderCanvas, selectedIds.length, strokes]);

  useEffect(() => {
    if (tool !== "lasso" && selectedIdsRef.current.length) {
      selectedIdsRef.current = [];
      setSelectedIds([]);
      renderCanvas();
    }
  }, [renderCanvas, tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas();
    const observer = new ResizeObserver(() => renderCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderCanvas]);

  const pointFromClient = (clientX: number, clientY: number, pressure = .5): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      pressure: pressure || .5,
    };
  };

  const replaceSelection = (ids: string[]) => {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  };

  const eraseBetween = (from: Point, to: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const distance = Math.hypot((to.x - from.x) * canvas.clientWidth, (to.y - from.y) * canvas.clientHeight);
    const steps = Math.max(1, Math.ceil(distance / 6));
    for (let step = 1; step <= steps; step += 1) {
      const sample: Point = {
        x: from.x + (to.x - from.x) * step / steps,
        y: from.y + (to.y - from.y) * step / steps,
        pressure: .5,
      };
      workingStrokes.current = workingStrokes.current.flatMap((stroke) => eraseStrokeAtPoint(stroke, sample, canvas, 13));
    }
    renderCanvas(workingStrokes.current);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!["pen", "highlight", "eraser", "lasso", "shape"].includes(tool)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromClient(event.clientX, event.clientY, event.pressure);
    beforeStrokes.current = strokesRef.current;
    workingStrokes.current = strokesRef.current;
    gestureStart.current = point;

    if (tool === "eraser") {
      interaction.current = "erase";
      lastEraserPoint.current = point;
      eraseBetween(point, point);
      return;
    }

    if (tool === "lasso") {
      const selected = strokesRef.current.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
      const bounds = boundsForStrokes(selected);
      if (bounds && canvasRef.current) {
        const handleDistance = Math.hypot((point.x - bounds.right) * canvasRef.current.clientWidth, (point.y - bounds.bottom) * canvasRef.current.clientHeight);
        if (handleDistance <= 22) {
          interaction.current = "resize";
          baseSelectionBounds.current = bounds;
          return;
        }
        const paddingX = 10 / canvasRef.current.clientWidth;
        const paddingY = 10 / canvasRef.current.clientHeight;
        if (point.x >= bounds.left - paddingX && point.x <= bounds.right + paddingX && point.y >= bounds.top - paddingY && point.y <= bounds.bottom + paddingY) {
          interaction.current = "move";
          baseSelectionBounds.current = bounds;
          return;
        }
      }
      interaction.current = "lasso";
      replaceSelection([]);
      lassoPath.current = [point];
      renderCanvas();
      return;
    }

    interaction.current = "draw";
    currentStroke.current = {
      id: uid("stroke"),
      tool: tool === "shape" ? "shape" : tool === "highlight" ? "highlight" : "pen",
      penStyle: tool === "pen" ? penStyle : undefined,
      shape: tool === "shape" ? shape : undefined,
      color,
      width: tool === "highlight" ? width * 4 : width,
      points: [point],
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (interaction.current === "idle") return;
    event.preventDefault();
    let point = pointFromClient(event.clientX, event.clientY, event.pressure);

    if (interaction.current === "erase") {
      const previous = lastEraserPoint.current ?? point;
      eraseBetween(previous, point);
      lastEraserPoint.current = point;
      return;
    }

    if (interaction.current === "lasso") {
      lassoPath.current.push(point);
      renderCanvas();
      return;
    }

    if (interaction.current === "move" && gestureStart.current && baseSelectionBounds.current) {
      const bounds = baseSelectionBounds.current;
      const dx = Math.max(-bounds.left, Math.min(1 - bounds.right, point.x - gestureStart.current.x));
      const dy = Math.max(-bounds.top, Math.min(1 - bounds.bottom, point.y - gestureStart.current.y));
      workingStrokes.current = beforeStrokes.current.map((stroke) => selectedIdsRef.current.includes(stroke.id)
        ? { ...stroke, points: stroke.points.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy })) }
        : stroke);
      renderCanvas(workingStrokes.current);
      return;
    }

    if (interaction.current === "resize" && baseSelectionBounds.current) {
      const bounds = baseSelectionBounds.current;
      const baseDistance = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) || .01;
      const nextDistance = Math.hypot(point.x - bounds.left, point.y - bounds.top);
      const maxScaleX = (1 - bounds.left) / Math.max(.001, bounds.right - bounds.left);
      const maxScaleY = (1 - bounds.top) / Math.max(.001, bounds.bottom - bounds.top);
      const scale = Math.max(.2, Math.min(4, maxScaleX, maxScaleY, nextDistance / baseDistance));
      workingStrokes.current = beforeStrokes.current.map((stroke) => selectedIdsRef.current.includes(stroke.id)
        ? { ...stroke, points: stroke.points.map((item) => ({ ...item, x: bounds.left + (item.x - bounds.left) * scale, y: bounds.top + (item.y - bounds.top) * scale })) }
        : stroke);
      renderCanvas(workingStrokes.current);
      return;
    }

    if (!currentStroke.current) return;
    if (currentStroke.current.tool === "shape") {
      if (currentStroke.current.shape === "circle" && canvasRef.current) {
        const start = currentStroke.current.points[0];
        const dx = (point.x - start.x) * canvasRef.current.clientWidth;
        const dy = (point.y - start.y) * canvasRef.current.clientHeight;
        const side = Math.min(Math.abs(dx), Math.abs(dy));
        point = {
          ...point,
          x: start.x + Math.sign(dx || 1) * side / canvasRef.current.clientWidth,
          y: start.y + Math.sign(dy || 1) * side / canvasRef.current.clientHeight,
        };
      }
      currentStroke.current.points = [currentStroke.current.points[0], point];
    } else {
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      coalesced.forEach((sample) => currentStroke.current?.points.push(pointFromClient(sample.clientX, sample.clientY, sample.pressure)));
    }
    renderCanvas([...beforeStrokes.current, currentStroke.current]);
  };

  const finishInteraction = () => {
    const mode = interaction.current;
    interaction.current = "idle";
    if (mode === "draw" && currentStroke.current) {
      const minimumPoints = currentStroke.current.tool === "shape" ? 2 : 1;
      if (currentStroke.current.points.length >= minimumPoints) {
        const next = [...beforeStrokes.current, currentStroke.current];
        strokesRef.current = next;
        workingStrokes.current = next;
        onCommit(next, beforeStrokes.current);
      }
      currentStroke.current = null;
    } else if (mode === "erase" || mode === "move" || mode === "resize") {
      const next = workingStrokes.current;
      if (next !== beforeStrokes.current) {
        strokesRef.current = next;
        onCommit(next, beforeStrokes.current);
      }
    } else if (mode === "lasso") {
      const polygon = lassoPath.current;
      const ids = polygon.length > 2
        ? strokesRef.current.filter((stroke) => pointsForStroke(stroke).some((point) => pointInPolygon(point, polygon))).map((stroke) => stroke.id)
        : [];
      lassoPath.current = [];
      replaceSelection(ids);
      workingStrokes.current = strokesRef.current;
      renderCanvas();
    }
    lastEraserPoint.current = null;
    gestureStart.current = null;
    baseSelectionBounds.current = null;
    renderCanvas();
  };

  const selectionBounds = useMemo(() => boundsForStrokes(strokes.filter((stroke) => selectedIds.includes(stroke.id))), [selectedIds, strokes]);

  const duplicateSelection = () => {
    const selected = strokesRef.current.filter((stroke) => selectedIdsRef.current.includes(stroke.id));
    if (!selected.length) return;
    const copies = selected.map((stroke) => ({
      ...stroke,
      id: uid("stroke-copy"),
      points: stroke.points.map((point) => ({ ...point, x: Math.min(1, point.x + .025), y: Math.min(1, point.y + .025) })),
    }));
    const next = [...strokesRef.current, ...copies];
    onCommit(next, strokesRef.current);
    strokesRef.current = next;
    workingStrokes.current = next;
    replaceSelection(copies.map((stroke) => stroke.id));
    renderCanvas(next);
  };

  const deleteSelection = () => {
    if (!selectedIdsRef.current.length) return;
    const previous = strokesRef.current;
    const next = previous.filter((stroke) => !selectedIdsRef.current.includes(stroke.id));
    onCommit(next, previous);
    strokesRef.current = next;
    workingStrokes.current = next;
    replaceSelection([]);
    renderCanvas(next);
  };

  return (
    <div className={`ink-surface tool-${tool}`}>
      <canvas
        ref={canvasRef}
        className="ink-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-label="Lớp viết tay"
      />
      {tool === "lasso" && selectionBounds && (
        <div className="lasso-menu" style={{ left: `${Math.min(.82, Math.max(.18, (selectionBounds.left + selectionBounds.right) / 2)) * 100}%`, top: `${Math.max(.1, selectionBounds.top) * 100}%` }}>
          <span>Kéo để di chuyển · nút vuông để đổi cỡ</span>
          <button onPointerDown={(event) => event.stopPropagation()} onClick={duplicateSelection}><Copy size={14} /> Nhân đôi</button>
          <button className="danger" onPointerDown={(event) => event.stopPropagation()} onClick={deleteSelection}><Trash2 size={14} /> Xóa</button>
        </div>
      )}
    </div>
  );
}

