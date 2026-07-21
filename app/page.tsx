"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  FileText,
  FolderOpen,
  Highlighter,
  Lasso,
  Menu,
  Minus,
  MousePointer2,
  NotebookTabs,
  PenTool,
  Plus,
  Redo2,
  Shapes,
  TextCursorInput,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Tool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text";
type InkTool = "pen" | "highlight" | "shape";
type ShapeKind = "line" | "arrow" | "rectangle" | "ellipse";
type PaperSize = "a4" | "a5" | "b5" | "letter" | "square";
type PaperOrientation = "portrait" | "landscape";
type PaperTemplate = "blank" | "ruled" | "grid" | "dotted" | "cornell";
type PaperColor = "white" | "ivory" | "yellow" | "mint" | "blue" | "dark";
type Point = { x: number; y: number; pressure: number };
type Stroke = {
  id: string;
  tool: InkTool;
  shape?: ShapeKind;
  color: string;
  width: number;
  points: Point[];
};
type PaperSettings = {
  size: PaperSize;
  orientation: PaperOrientation;
  template: PaperTemplate;
  color: PaperColor;
};
type NotePage = {
  id: string;
  title: string;
  body: string;
  citationPage: number | null;
  strokes: Stroke[];
  paper: PaperSettings;
};

type Notebook = {
  id: string;
  title: string;
  pages: NotePage[];
  activePageId: string;
  createdAt: number;
};

type LibraryDocument = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
};

type WorkspaceItem = {
  id: string;
  kind: "document" | "collection" | "demo" | "empty";
  name: string;
  documents: LibraryDocument[];
  activeDocumentId: string | null;
  notebooks: Notebook[];
  activeNotebookId: string;
  sourcePage: number;
};

type PersistedLibrary = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
};

type LegacyNotebookState = {
  pages?: NotePage[];
  activeNoteId?: string;
  readerShare?: number;
};

type StrokeHistory = Record<string, { undo: Stroke[][]; redo: Stroke[][] }>;

const STORAGE_KEY = "mednote-library-v2";
const LEGACY_STORAGE_KEY = "mednote-notebook-v1";
const DB_NAME = "mednote-local";
const DB_STORE = "documents";
const DEMO_PAGES = [123, 124, 125, 126, 127, 128];
const DEFAULT_PAPER: PaperSettings = { size: "a4", orientation: "portrait", template: "ruled", color: "white" };

const PAPER_SIZES: Record<PaperSize, { label: string; dimensions: string; width: number; height: number; maxWidth: number }> = {
  a4: { label: "A4", dimensions: "210 × 297 mm", width: 210, height: 297, maxWidth: 720 },
  a5: { label: "A5", dimensions: "148 × 210 mm", width: 148, height: 210, maxWidth: 590 },
  b5: { label: "B5", dimensions: "176 × 250 mm", width: 176, height: 250, maxWidth: 650 },
  letter: { label: "Letter", dimensions: "216 × 279 mm", width: 216, height: 279, maxWidth: 740 },
  square: { label: "Vuông", dimensions: "210 × 210 mm", width: 210, height: 210, maxWidth: 720 },
};

const PAPER_TEMPLATES: { id: PaperTemplate; label: string }[] = [
  { id: "blank", label: "Trắng" },
  { id: "ruled", label: "Dòng kẻ" },
  { id: "grid", label: "Ô vuông" },
  { id: "dotted", label: "Chấm" },
  { id: "cornell", label: "Cornell" },
];

const PAPER_COLORS: { id: PaperColor; label: string; swatch: string }[] = [
  { id: "white", label: "Trắng", swatch: "#ffffff" },
  { id: "ivory", label: "Kem", swatch: "#fffaf0" },
  { id: "yellow", label: "Vàng nhạt", swatch: "#fff8cf" },
  { id: "mint", label: "Xanh bạc hà", swatch: "#eefaf3" },
  { id: "blue", label: "Xanh nhạt", swatch: "#eef7fc" },
  { id: "dark", label: "Tối", swatch: "#263139" },
];

const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "pointer", label: "Chọn", icon: MousePointer2 },
  { id: "pen", label: "Bút", icon: PenTool },
  { id: "highlight", label: "Tô sáng", icon: Highlighter },
  { id: "eraser", label: "Tẩy chính xác", icon: Eraser },
  { id: "lasso", label: "Khoanh chọn", icon: Lasso },
  { id: "shape", label: "Hình học", icon: Shapes },
  { id: "text", label: "Nhập chữ", icon: TextCursorInput },
];

const starterStrokes: Stroke[] = [
  {
    id: "starter-red-underline",
    tool: "pen",
    color: "#c94b50",
    width: 2.4,
    points: Array.from({ length: 18 }, (_, index) => ({
      x: 0.19 + index * 0.035,
      y: 0.135 + Math.sin(index / 2.6) * 0.002,
      pressure: 0.55,
    })),
  },
  {
    id: "starter-blue-note",
    tool: "pen",
    color: "#2465a8",
    width: 2.2,
    points: [
      { x: 0.7, y: 0.55, pressure: 0.5 },
      { x: 0.75, y: 0.54, pressure: 0.5 },
      { x: 0.79, y: 0.56, pressure: 0.5 },
      { x: 0.83, y: 0.53, pressure: 0.5 },
    ],
  },
];

const initialPages: NotePage[] = [
  {
    id: "note-1",
    title: "BỆNH THẦN KINH ĐÁI THÁO ĐƯỜNG",
    body:
      "CƠ CHẾ BỆNH SINH\n\n• Tăng đường huyết mạn tính.\n• Hoạt hóa con đường polyol → tích lũy sorbitol.\n• Sản phẩm glycat hóa nâng cao (AGEs) → tổn thương thần kinh.\n• Stress oxy hóa → tổn thương ty thể và tế bào Schwann.\n• Thiếu máu vi mạch nuôi thần kinh.\n\nĐIỂM CẦN NHỚ\n\n• Thần kinh ngoại biên thường gặp nhất: đa dây thần kinh đối xứng.\n• Biểu hiện: tê bì, kiến bò, đau rát, giảm cảm giác.\n• Đánh giá: monofilament 10 g, âm thoa 128 Hz.\n• Điều trị: kiểm soát đường huyết, giảm đau và chăm sóc bàn chân.",
    citationPage: 126,
    strokes: starterStrokes,
    paper: DEFAULT_PAPER,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function normalizePaper(paper?: Partial<PaperSettings>): PaperSettings {
  return { ...DEFAULT_PAPER, ...paper };
}

function normalizePage(page: NotePage): NotePage {
  return {
    ...page,
    body: page.body ?? "",
    strokes: Array.isArray(page.strokes) ? page.strokes : [],
    paper: normalizePaper(page.paper),
  };
}

function normalizeWorkspace(workspace: WorkspaceItem): WorkspaceItem {
  return {
    ...workspace,
    notebooks: workspace.notebooks.map((notebook) => ({
      ...notebook,
      pages: notebook.pages.map(normalizePage),
    })),
  };
}

function createBlankPage(citationPage = 1, index = 1, paper: PaperSettings = DEFAULT_PAPER): NotePage {
  return {
    id: uid("page"),
    title: `GHI CHÚ ${index}`,
    body: "",
    citationPage,
    strokes: [],
    paper: { ...paper },
  };
}

function createNotebook(title: string, citationPage = 1): Notebook {
  const page = createBlankPage(citationPage);
  return {
    id: uid("notebook"),
    title,
    pages: [page],
    activePageId: page.id,
    createdAt: Date.now(),
  };
}

function createDemoWorkspace(pages: NotePage[] = initialPages): WorkspaceItem {
  const notebook: Notebook = {
    id: "demo-notebook",
    title: "Ghi chú mẫu",
    pages,
    activePageId: pages[0].id,
    createdAt: 0,
  };
  return {
    id: "demo-workspace",
    kind: "demo",
    name: "Diabetic Neuropathy — Chapter 3",
    documents: [],
    activeDocumentId: null,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 126,
  };
}

function createEmptyWorkspace(): WorkspaceItem {
  const notebook = createNotebook("Ghi chú mới");
  return {
    id: "empty-workspace",
    kind: "empty",
    name: "Chưa có tài liệu",
    documents: [],
    activeDocumentId: null,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  };
}

function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalPdf(blob: Blob, document: LibraryDocument) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put({ blob, name: document.name }, `pdf:${document.id}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readLocalPdf(documentId: string) {
  const db = await openLocalDb();
  const result = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(`pdf:${documentId}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function deleteLocalPdf(documentId: string) {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).delete(`pdf:${documentId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readLegacyPdf() {
  const db = await openLocalDb();
  const result = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get("current-pdf");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

function DemoDocument({ page }: { page: number }) {
  return (
    <article className="document-paper">
      <div className="page-meta"><strong>{page}</strong><em>Diabetes Mellitus: A Clinical Textbook, 5th Edition</em></div>
      <h1>3.4&nbsp;&nbsp; DIABETIC NEUROPATHY</h1>
      <div className="document-columns">
        <section>
          <h2>3.4.1&nbsp;&nbsp; Introduction</h2>
          <p>Diabetic neuropathy is the most common chronic complication of diabetes mellitus and a leading cause of morbidity. It may involve the peripheral and autonomic nervous systems.</p>
          <h2>3.4.3&nbsp;&nbsp; Clinical Features</h2>
          <p>Peripheral neuropathy typically presents with distal symmetrical sensory loss and neuropathic pain.</p>
          <ul><li>Numbness, tingling and burning pain</li><li>Loss of vibration and temperature sensation</li><li>Reduced ankle reflexes</li></ul>
          <div className="figure-card">
            <div className="mechanism-row"><span>Hyperglycemia</span><b>→</b><span>Polyol pathway</span><b>→</b><span>Nerve damage</span></div>
            <div className="nerve-illustration"><i /><i /><i /><i /><i /></div>
            <small>Figure 3.7. Proposed mechanisms in diabetic peripheral neuropathy.</small>
          </div>
        </section>
        <section>
          <h2>3.4.2&nbsp;&nbsp; Pathophysiology</h2>
          <p>The pathogenesis is multifactorial, involving metabolic, vascular and neurotrophic mechanisms.</p>
          <ul><li>Chronic hyperglycemia → polyol pathway activation</li><li>Advanced glycation end products (AGEs)</li><li>Oxidative stress and inflammation</li><li>Microvascular ischemia</li><li>Neurotrophic factor deficiency</li></ul>
          <h2>3.4.4&nbsp;&nbsp; Diagnosis</h2>
          <p>Diagnosis is primarily clinical and based on history and physical examination.</p>
          <ul><li>10-g monofilament test</li><li>Vibration perception (128-Hz tuning fork)</li><li>Nerve conduction studies when needed</li></ul>
          <h2>3.4.5&nbsp;&nbsp; Management</h2>
          <ul><li>Optimal glycemic control</li><li>Pain management</li><li>Foot care and ulcer prevention</li></ul>
        </section>
      </div>
    </article>
  );
}

function PdfPageCanvas({ document, page, zoom }: { document: PDFDocumentProxy; page: number; zoom: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let renderTask: PDFRenderTask | null = null;
    let requestNumber = 0;
    let rendering = false;
    const wrapper = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const drainRenderQueue = async () => {
      if (rendering) return;
      rendering = true;
      while (!disposed) {
        const currentRequest = requestNumber;
        const pdfPage = await document.getPage(page);
        if (disposed) break;
        if (currentRequest !== requestNumber) continue;
        const base = pdfPage.getViewport({ scale: 1 });
        const available = Math.max(260, wrapper.clientWidth - 2);
        const scale = (available / base.width) * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d");
        if (!context) break;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        try {
          await renderTask.promise;
        } catch (error) {
          if (!disposed && (error as Error).name !== "RenderingCancelledException") throw error;
        } finally {
          renderTask = null;
        }
        if (currentRequest === requestNumber) {
          if (!disposed) setLoading(false);
          break;
        }
      }
      rendering = false;
    };

    const requestRender = () => {
      requestNumber += 1;
      renderTask?.cancel();
      void drainRenderQueue();
    };

    const observer = new ResizeObserver(requestRender);
    observer.observe(wrapper);
    return () => {
      disposed = true;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [document, page, zoom]);

  return <div className="pdf-canvas-wrap" ref={wrapRef}>{loading && <div className="pdf-loading">Đang dựng trang…</div>}<canvas ref={canvasRef} /></div>;
}

function PdfThumbnail({ document, page, active, onClick }: { document: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let task: PDFRenderTask | null = null;
    void document.getPage(page).then((pdfPage) => {
      if (disposed || !canvasRef.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: 72 / base.width });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * 1.5);
      canvas.height = Math.floor(viewport.height * 1.5);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(1.5, 0, 0, 1.5, 0, 0);
      task = pdfPage.render({ canvas, canvasContext: context, viewport });
      return task.promise;
    }).catch(() => undefined);
    return () => { disposed = true; task?.cancel(); };
  }, [document, page]);
  return <button className={`pdf-thumb ${active ? "active" : ""}`} onClick={onClick}><span className="mini-paper pdf-mini"><canvas ref={canvasRef} /></span><span>{page}</span></button>;
}

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
  context.globalAlpha = stroke.tool === "highlight" ? 0.3 : 1;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.tool === "shape") {
    context.beginPath();
    if (stroke.shape === "rectangle") {
      context.rect(startX, startY, endX - startX, endY - startY);
    } else if (stroke.shape === "ellipse") {
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

  context.beginPath();
  context.moveTo(startX, startY);
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    const previous = stroke.points[index - 1];
    context.lineWidth = stroke.width * (0.7 + point.pressure * 0.5);
    const midX = ((previous.x + point.x) / 2) * canvasWidth;
    const midY = ((previous.y + point.y) / 2) * canvasHeight;
    context.quadraticCurveTo(previous.x * canvasWidth, previous.y * canvasHeight, midX, midY);
  }
  context.stroke();
  context.restore();
}

function pointsForStroke(stroke: Stroke): Point[] {
  if (stroke.tool !== "shape" || stroke.points.length < 2) return stroke.points;
  const start = stroke.points[0];
  const end = stroke.points.at(-1)!;
  if (stroke.shape === "rectangle") {
    return [start, { x: end.x, y: start.y, pressure: .5 }, end, { x: start.x, y: end.y, pressure: .5 }, start];
  }
  if (stroke.shape === "ellipse") {
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
  tool: Tool;
  color: string;
  width: number;
  shape: ShapeKind;
  strokes: Stroke[];
  onCommit: (next: Stroke[], previous: Stroke[]) => void;
};

function InkCanvas({ tool, color, width, shape, strokes, onCommit }: InkCanvasProps) {
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
      shape: tool === "shape" ? shape : undefined,
      color,
      width: tool === "highlight" ? width * 4 : width,
      points: [point],
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (interaction.current === "idle") return;
    event.preventDefault();
    const point = pointFromClient(event.clientX, event.clientY, event.pressure);

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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [inkColor, setInkColor] = useState("#2465a8");
  const [inkWidth, setInkWidth] = useState(2);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [sourceZoom, setSourceZoom] = useState(1);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createDemoWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("demo-workspace");
  const [strokeHistory, setStrokeHistory] = useState<StrokeHistory>({});
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const [readerShare, setReaderShare] = useState(50);
  const [toast, setToast] = useState("Đã tự lưu");
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showPdfRail, setShowPdfRail] = useState(true);
  const [paperPanelOpen, setPaperPanelOpen] = useState(false);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeNotebook = activeWorkspace.notebooks.find((notebook) => notebook.id === activeWorkspace.activeNotebookId) ?? activeWorkspace.notebooks[0];
  const notePages = activeNotebook.pages;
  const activeNote = notePages.find((page) => page.id === activeNotebook.activePageId) ?? notePages[0];
  const activeDocument = activeWorkspace.documents.find((document) => document.id === activeWorkspace.activeDocumentId) ?? activeWorkspace.documents[0] ?? null;
  const currentPdfDocument = activeDocument?.id === loadedDocumentId ? pdfDocument : null;
  const sourcePage = activeWorkspace.sourcePage;
  const documentName = activeWorkspace.name;
  const totalPages = currentPdfDocument?.numPages ?? (activeDocument ? 1 : 482);

  const updateActiveWorkspace = (updater: (workspace: WorkspaceItem) => WorkspaceItem) => {
    setWorkspaces((items) => items.map((workspace) => workspace.id === activeWorkspaceId ? updater(workspace) : workspace));
  };

  const updateActiveNotebook = (updater: (notebook: Notebook) => Notebook) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      notebooks: workspace.notebooks.map((notebook) => notebook.id === workspace.activeNotebookId ? updater(notebook) : notebook),
    }));
  };

  const setSourcePage = (value: number | ((page: number) => number)) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      sourcePage: typeof value === "function" ? value(workspace.sourcePage) : value,
    }));
  };

  const setActiveNoteId = (pageId: string) => {
    updateActiveNotebook((notebook) => ({ ...notebook, activePageId: pageId }));
  };

  const sourcePages = useMemo(() => {
    if (!currentPdfDocument) return activeDocument ? [sourcePage] : activeWorkspace.kind === "demo" ? DEMO_PAGES : [];
    const count = currentPdfDocument.numPages;
    if (count <= 8) return Array.from({ length: count }, (_, index) => index + 1);
    const start = Math.min(Math.max(1, sourcePage - 3), count - 7);
    return Array.from({ length: 8 }, (_, index) => start + index);
  }, [activeDocument, activeWorkspace.kind, currentPdfDocument, sourcePage]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedLibrary;
          if (parsed.workspaces?.length && !cancelled) {
            const normalized = parsed.workspaces.map(normalizeWorkspace);
            setWorkspaces(normalized);
            setActiveWorkspaceId(parsed.activeWorkspaceId || parsed.workspaces[0].id);
            setReaderShare(parsed.readerShare || 50);
            setReady(true);
            return;
          }
        }
      } catch { /* migrate the previous single-notebook format */ }

      let legacy: LegacyNotebookState | null = null;
      try {
        const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored) legacy = JSON.parse(stored) as LegacyNotebookState;
      } catch { /* keep demo data */ }

      const legacyPages = (legacy?.pages?.length ? legacy.pages : initialPages).map(normalizePage);
      let restoredWorkspace = createDemoWorkspace(legacyPages);
      restoredWorkspace.notebooks[0].activePageId = legacyPages.some((page) => page.id === legacy?.activeNoteId)
        ? legacy!.activeNoteId!
        : legacyPages[0].id;

      try {
        const storedPdf = await readLegacyPdf();
        if (storedPdf) {
          const document: LibraryDocument = {
            id: `doc-${stableId(`${storedPdf.name}:${storedPdf.blob.size}:legacy`)}`,
            name: storedPdf.name,
            size: storedPdf.blob.size,
            lastModified: 0,
          };
          await saveLocalPdf(storedPdf.blob, document);
          const notebook: Notebook = {
            id: uid("notebook"),
            title: `Ghi chú — ${storedPdf.name.replace(/\.pdf$/i, "")}`,
            pages: legacyPages,
            activePageId: restoredWorkspace.notebooks[0].activePageId,
            createdAt: Date.now(),
          };
          restoredWorkspace = {
            id: `workspace-${document.id}`,
            kind: "document",
            name: storedPdf.name.replace(/\.pdf$/i, ""),
            documents: [document],
            activeDocumentId: document.id,
            notebooks: [notebook],
            activeNotebookId: notebook.id,
            sourcePage: 1,
          };
        }
      } catch { /* IndexedDB may be unavailable */ }

      if (!cancelled) {
        setWorkspaces([restoredWorkspace]);
        setActiveWorkspaceId(restoredWorkspace.id);
        setReaderShare(legacy?.readerShare || 50);
        setReady(true);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, activeWorkspaceId, readerShare } satisfies PersistedLibrary));
    } catch { /* storage may be unavailable in private browsing */ }
  }, [workspaces, activeWorkspaceId, readerShare, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPdfSource(null);
    setPdfDocument(null);
    setLoadedDocumentId(null);
    if (!activeDocument) {
      setPdfStatus("idle");
      return;
    }
    setPdfStatus("loading");
    void readLocalPdf(activeDocument.id).then((stored) => {
      if (cancelled) return;
      if (!stored) {
        setPdfStatus("error");
        return;
      }
      setPdfSource({ blob: stored.blob, documentId: activeDocument.id });
    }).catch(() => !cancelled && setPdfStatus("error"));
    return () => { cancelled = true; };
  }, [activeDocument?.id, ready]);

  useEffect(() => {
    if (!pdfSource) return undefined;
    let disposed = false;
    let document: PDFDocumentProxy | null = null;
    void pdfSource.blob.arrayBuffer().then(async (buffer) => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      document = await task.promise;
      if (!disposed) {
        setPdfDocument(document);
        setLoadedDocumentId(pdfSource.documentId);
        setSourcePage((page) => Math.min(Math.max(1, page), document!.numPages));
        setPdfStatus("idle");
        setToast(`Đã mở ${document.numPages} trang`);
      }
    }).catch(() => {
      if (!disposed) {
        setPdfStatus("error");
        setToast("Không thể mở PDF này");
      }
    });
    return () => { disposed = true; void document?.destroy(); };
  }, [pdfSource]);

  useEffect(() => {
    if (!toast || toast === "Đã tự lưu") return;
    const timer = window.setTimeout(() => setToast("Đã tự lưu"), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateActiveNote = (changes: Partial<NotePage>) => {
    updateActiveNotebook((notebook) => ({
      ...notebook,
      pages: notebook.pages.map((page) => page.id === notebook.activePageId ? { ...page, ...changes } : page),
    }));
  };

  const handlePdfFiles = async (selection: FileList | null) => {
    const files = Array.from(selection ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      setToast("Vui lòng chọn tệp PDF");
      return;
    }
    const documents: LibraryDocument[] = files.map((file) => ({
      id: `doc-${stableId(`${file.name}:${file.size}:${file.lastModified}`)}`,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    }));
    try {
      await Promise.all(files.map((file, index) => saveLocalPdf(file, documents[index])));
    } catch {
      setToast("PDF mở được nhưng chưa lưu trên thiết bị");
    }

    const workspaceId = files.length === 1
      ? `workspace-${documents[0].id}`
      : `collection-${stableId(documents.map((document) => document.id).sort().join(":"))}`;
    const existing = workspaces.find((workspace) => workspace.id === workspaceId);
    if (existing) {
      setActiveWorkspaceId(existing.id);
      setLibraryOpen(false);
      setActiveTool("text");
      setToast("Đã mở lại ghi chú đã lưu");
      return;
    }

    const name = files.length === 1
      ? files[0].name.replace(/\.pdf$/i, "")
      : `Bộ tài liệu · ${files[0].name.replace(/\.pdf$/i, "")} +${files.length - 1}`;
    const notebook = createNotebook(`Ghi chú — ${name}`);
    const workspace: WorkspaceItem = {
      id: workspaceId,
      kind: files.length === 1 ? "document" : "collection",
      name,
      documents,
      activeDocumentId: documents[0].id,
      notebooks: [notebook],
      activeNotebookId: notebook.id,
      sourcePage: 1,
    };
    setWorkspaces((items) => [workspace, ...items.filter((item) => item.kind !== "empty")]);
    setActiveWorkspaceId(workspace.id);
    setActiveTool("text");
    setLibraryOpen(false);
    setToast(files.length === 1 ? "Đã tạo sổ ghi chú cho tài liệu" : "Đã tạo ghi chú cho cụm tài liệu");
  };

  const addNotePage = () => {
    const next = createBlankPage(sourcePage, activeNotebook.pages.length + 1, activeNote.paper);
    updateActiveNotebook((notebook) => ({ ...notebook, pages: [...notebook.pages, next], activePageId: next.id }));
    setActiveTool("text");
    setToast(`Đã thêm trang ${PAPER_SIZES[next.paper.size].label}`);
  };

  const addNotebook = () => {
    const notebook = createNotebook(`Sổ ${activeWorkspace.notebooks.length + 1} — ${activeWorkspace.name}`, sourcePage);
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      notebooks: [...workspace.notebooks, notebook],
      activeNotebookId: notebook.id,
    }));
    setActiveTool("text");
    setToast("Đã tạo sổ ghi chú mới");
  };

  const deleteNotePage = () => {
    if (!window.confirm(`Xóa trang note “${activeNote.title}”? Thao tác này không thể hoàn tác.`)) return;
    const deletedPageId = activeNote.id;
    if (notePages.length === 1) {
      const replacement = createBlankPage(sourcePage, 1, activeNote.paper);
      updateActiveNotebook((notebook) => ({ ...notebook, pages: [replacement], activePageId: replacement.id }));
      setStrokeHistory((history) => {
        const next = { ...history };
        delete next[deletedPageId];
        return next;
      });
      setActiveTool("text");
      setToast("Đã xóa trang và tạo một trang trống");
      return;
    }
    const index = notePages.findIndex((page) => page.id === activeNote.id);
    const nextPages = notePages.filter((page) => page.id !== activeNote.id);
    const nextActiveId = nextPages[Math.min(index, nextPages.length - 1)].id;
    updateActiveNotebook((notebook) => ({ ...notebook, pages: nextPages, activePageId: nextActiveId }));
    setStrokeHistory((history) => {
      const next = { ...history };
      delete next[deletedPageId];
      return next;
    });
    setToast("Đã xóa trang note");
  };

  const deleteNotebook = () => {
    const pageCount = activeNotebook.pages.length;
    const lastNotebook = activeWorkspace.notebooks.length === 1;
    const warning = lastNotebook
      ? `Xóa sổ note “${activeNotebook.title}” cùng ${pageCount} trang? Sau đó app sẽ tạo một sổ trống mới cho tài liệu này.`
      : `Xóa sổ note “${activeNotebook.title}” cùng ${pageCount} trang? Thao tác này không thể hoàn tác.`;
    if (!window.confirm(warning)) return;

    const deletedPageIds = new Set(activeNotebook.pages.map((page) => page.id));
    if (lastNotebook) {
      const replacement = createNotebook(`Ghi chú — ${activeWorkspace.name}`, sourcePage);
      updateActiveWorkspace((workspace) => ({ ...workspace, notebooks: [replacement], activeNotebookId: replacement.id }));
    } else {
      const index = activeWorkspace.notebooks.findIndex((notebook) => notebook.id === activeNotebook.id);
      const nextNotebooks = activeWorkspace.notebooks.filter((notebook) => notebook.id !== activeNotebook.id);
      const nextActiveId = nextNotebooks[Math.min(index, nextNotebooks.length - 1)].id;
      updateActiveWorkspace((workspace) => ({ ...workspace, notebooks: nextNotebooks, activeNotebookId: nextActiveId }));
    }
    setStrokeHistory((history) => Object.fromEntries(Object.entries(history).filter(([pageId]) => !deletedPageIds.has(pageId))));
    setPaperPanelOpen(false);
    setActiveTool("text");
    setToast(lastNotebook ? "Đã xóa sổ note và tạo sổ trống" : "Đã xóa sổ note");
  };

  const deleteWorkspace = async (workspaceId: string) => {
    const target = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    const pageCount = target.notebooks.reduce((sum, notebook) => sum + notebook.pages.length, 0);
    const targetLabel = target.kind === "collection" ? "cụm tài liệu" : "tài liệu";
    if (!window.confirm(`Xóa ${targetLabel} “${target.name}” cùng ${target.notebooks.length} sổ và ${pageCount} trang note? Thao tác này không thể hoàn tác.`)) return;

    await Promise.allSettled(target.documents.map((document) => deleteLocalPdf(document.id)));
    const deletedPageIds = new Set(target.notebooks.flatMap((notebook) => notebook.pages.map((page) => page.id)));
    const targetIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
    const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId);
    const nextWorkspaces = remaining.length ? remaining : [createEmptyWorkspace()];
    setWorkspaces(nextWorkspaces);
    if (activeWorkspaceId === workspaceId) {
      setActiveWorkspaceId(nextWorkspaces[Math.min(targetIndex, nextWorkspaces.length - 1)].id);
    }
    setStrokeHistory((history) => Object.fromEntries(Object.entries(history).filter(([pageId]) => !deletedPageIds.has(pageId))));
    setPaperPanelOpen(false);
    setToast(`Đã xóa ${targetLabel} và note liên quan`);
  };

  const deleteActiveDocument = async () => {
    if (!activeDocument) return;
    if (activeWorkspace.documents.length === 1) {
      await deleteWorkspace(activeWorkspace.id);
      return;
    }
    if (!window.confirm(`Xóa tài liệu “${activeDocument.name}” khỏi cụm? Các sổ note chung của cụm sẽ được giữ lại.`)) return;

    await Promise.allSettled([deleteLocalPdf(activeDocument.id)]);
    const index = activeWorkspace.documents.findIndex((document) => document.id === activeDocument.id);
    const nextDocuments = activeWorkspace.documents.filter((document) => document.id !== activeDocument.id);
    const nextActiveDocument = nextDocuments[Math.min(index, nextDocuments.length - 1)];
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      documents: nextDocuments,
      activeDocumentId: nextActiveDocument.id,
      sourcePage: 1,
    }));
    setToast("Đã xóa tài liệu khỏi cụm; note vẫn được giữ lại");
  };

  const commitStrokes = (next: Stroke[], previous: Stroke[]) => {
    const unchanged = next.length === previous.length && next.every((stroke, index) => stroke === previous[index]);
    if (unchanged) return;
    setStrokeHistory((state) => {
      const history = state[activeNote.id] ?? { undo: [], redo: [] };
      return { ...state, [activeNote.id]: { undo: [...history.undo, previous].slice(-60), redo: [] } };
    });
    updateActiveNote({ strokes: next });
  };

  const undo = () => {
    const history = strokeHistory[activeNote.id];
    const previous = history?.undo.at(-1);
    if (!previous) return;
    updateActiveNote({ strokes: previous });
    setStrokeHistory((state) => ({
      ...state,
      [activeNote.id]: { undo: history.undo.slice(0, -1), redo: [...history.redo, activeNote.strokes].slice(-60) },
    }));
  };

  const redo = () => {
    const history = strokeHistory[activeNote.id];
    const next = history?.redo.at(-1);
    if (!next) return;
    updateActiveNote({ strokes: next });
    setStrokeHistory((state) => ({
      ...state,
      [activeNote.id]: { undo: [...history.undo, activeNote.strokes].slice(-60), redo: history.redo.slice(0, -1) },
    }));
  };

  const updatePaper = (changes: Partial<PaperSettings>) => {
    updateActiveNote({ paper: { ...activeNote.paper, ...changes } });
    setToast("Đã lưu mẫu giấy cho trang này");
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const usable = rect.width - 236;
      const readerWidth = moveEvent.clientX - rect.left - 108;
      const nextShare = Math.min(65, Math.max(35, (readerWidth / usable) * 100));
      setReaderShare(nextShare);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const gridStyle = {
    "--reader-share": `${readerShare}fr`,
    "--notes-share": `${100 - readerShare}fr`,
  } as React.CSSProperties;
  const selectedPaperSize = PAPER_SIZES[activeNote.paper.size];
  const paperWidth = activeNote.paper.orientation === "portrait" ? selectedPaperSize.width : selectedPaperSize.height;
  const paperHeight = activeNote.paper.orientation === "portrait" ? selectedPaperSize.height : selectedPaperSize.width;
  const paperStyle = {
    "--paper-ratio": `${paperWidth} / ${paperHeight}`,
    "--paper-max-width": `${activeNote.paper.orientation === "portrait" ? selectedPaperSize.maxWidth : Math.min(920, selectedPaperSize.maxWidth * 1.32)}px`,
  } as React.CSSProperties;

  return (
    <main className="app-shell">
      <input ref={fileInputRef} className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void handlePdfFiles(event.target.files); event.currentTarget.value = ""; }} />
      <header className="topbar">
        <div className="brand-group">
          <button className="icon-button menu-button" aria-label="Mở thư viện" onClick={() => setLibraryOpen(true)}><Menu size={19} /></button>
          <div className="brand-mark">M</div><span className="brand-name">MedNote</span><span className="top-divider" />
          <button className="document-title" onClick={() => setLibraryOpen(true)}><span>{documentName}</span><ChevronDown size={15} /></button>
        </div>
        <div className="top-actions">
          <span className="autosave-status"><i />{toast}</span>
          <button className="primary-button" onClick={() => fileInputRef.current?.click()}><FolderOpen size={16} /> Thêm tài liệu</button>
        </div>
      </header>

      {libraryOpen && (
        <div className="library-backdrop" onPointerDown={() => setLibraryOpen(false)}>
          <aside className="library-panel" aria-label="Thư viện tài liệu" onPointerDown={(event) => event.stopPropagation()}>
            <div className="library-header"><div><strong>Thư viện</strong><span>Mỗi mục có sổ ghi chú riêng</span></div><button className="icon-button" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={19} /></button></div>
            <button className="library-import" onClick={() => fileInputRef.current?.click()}><FolderOpen size={18} /><span><strong>Thêm PDF hoặc cụm tài liệu</strong><small>Chọn nhiều PDF cùng lúc để tạo một cụm</small></span></button>
            <div className="library-list">
              {workspaces.map((workspace) => {
                const pageCount = workspace.notebooks.reduce((sum, notebook) => sum + notebook.pages.length, 0);
                return (
                  <div className="library-row" key={workspace.id}>
                    <button className={`library-item ${workspace.id === activeWorkspace.id ? "active" : ""}`} onClick={() => { setActiveWorkspaceId(workspace.id); setLibraryOpen(false); }}>
                      <span className="library-icon"><FileText size={19} /></span>
                      <span><strong>{workspace.name}</strong><small>{workspace.kind === "collection" ? `${workspace.documents.length} tài liệu` : workspace.kind === "demo" ? "Tài liệu mẫu" : "1 tài liệu"} · {workspace.notebooks.length} sổ · {pageCount} trang note</small></span>
                    </button>
                    {workspace.kind !== "empty" && <button className="library-delete" onClick={() => { void deleteWorkspace(workspace.id); }} aria-label={`Xóa ${workspace.name}`} title="Xóa tài liệu và note liên quan"><Trash2 size={17} /></button>}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <section className={`workspace ${showPdfRail ? "" : "pdf-rail-collapsed"}`} ref={workspaceRef} style={gridStyle}>
        <aside className="pdf-thumbnails" aria-label="Trang tài liệu">
          <div className="rail-heading"><FileText size={16} /><button className="icon-button compact" aria-label="Thu gọn" onClick={() => setShowPdfRail(false)}><ChevronLeft size={17} /></button></div>
          <div className="thumb-list">
            {sourcePages.map((page) => currentPdfDocument ? (
              <PdfThumbnail key={`${activeDocument?.id}-${page}`} document={currentPdfDocument} page={page} active={page === sourcePage} onClick={() => setSourcePage(page)} />
            ) : (
              <button className={`pdf-thumb ${page === sourcePage ? "active" : ""}`} key={page} onClick={() => setSourcePage(page)}><span className="mini-paper"><i /><i /><i /><i className="wide" /><b /></span><span>{page}</span></button>
            ))}
          </div>
        </aside>

        <section className="reader-pane">
          <div className="pane-toolbar">
            {!showPdfRail && <button className="icon-button compact" aria-label="Hiện danh sách trang" onClick={() => setShowPdfRail(true)}><FileText size={17} /></button>}
            {activeWorkspace.documents.length > 1 ? (
              <select className="document-switcher" value={activeDocument?.id ?? ""} onChange={(event) => updateActiveWorkspace((workspace) => ({ ...workspace, activeDocumentId: event.target.value, sourcePage: 1 }))} aria-label="Tài liệu trong cụm">
                {activeWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
              </select>
            ) : <span className="current-document-label">{activeDocument?.name ?? "Tài liệu mẫu"}</span>}
            <div className="toolbar-spacer" />
            {activeDocument && <button className="icon-button compact danger-icon" aria-label="Xóa tài liệu" title="Xóa tài liệu" onClick={() => { void deleteActiveDocument(); }}><Trash2 size={17} /></button>}
            <div className="zoom-control"><button aria-label="Thu nhỏ" onClick={() => setSourceZoom((zoom) => Math.max(.6, zoom - .1))}><Minus size={15} /></button><span>{Math.round(sourceZoom * 100)}%</span><button aria-label="Phóng to" onClick={() => setSourceZoom((zoom) => Math.min(2, zoom + .1))}><Plus size={15} /></button></div>
            {activeWorkspace.kind !== "empty" && <div className="page-control"><button aria-label="Trang trước" onClick={() => setSourcePage((page) => Math.max(currentPdfDocument ? 1 : 123, page - 1))}><ChevronLeft size={14} /></button><span>{sourcePage} / {totalPages}</span><button aria-label="Trang sau" onClick={() => setSourcePage((page) => Math.min(totalPages, page + 1))}><ChevronRight size={14} /></button></div>}
          </div>
          <div className="document-stage">
            {currentPdfDocument ? <PdfPageCanvas key={`${activeDocument?.id}-${sourcePage}`} document={currentPdfDocument} page={sourcePage} zoom={sourceZoom} /> : activeDocument ? (
              <div className="empty-document"><FileText size={34} /><strong>{pdfStatus === "error" ? "Không tìm thấy bản PDF đã lưu" : "Đang mở tài liệu…"}</strong>{pdfStatus === "error" && <button className="primary-button" onClick={() => fileInputRef.current?.click()}>Chọn lại PDF</button>}</div>
            ) : activeWorkspace.kind === "demo" ? <DemoDocument page={sourcePage} /> : (
              <div className="empty-document"><FolderOpen size={34} /><strong>Chưa có tài liệu</strong><span>Thêm PDF để đọc và tạo ghi chú đi kèm.</span><button className="primary-button" onClick={() => fileInputRef.current?.click()}>Thêm tài liệu</button></div>
            )}
          </div>
        </section>

        <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>

        <section className="notes-pane">
          <div className="note-toolbar" role="toolbar" aria-label="Công cụ ghi chú">
            <button className="note-create-button primary" onClick={addNotePage}><Plus size={17} /><span>Trang mới</span></button>
            <button className="note-create-button" onClick={addNotebook}><FileText size={16} /><span>Sổ mới</span></button>
            <button className="note-create-button danger" onClick={deleteNotebook}><Trash2 size={15} /><span>Xóa sổ</span></button>
            <span className="toolbar-divider" />
            {tools.map(({ id, label, icon: Icon }) => <button key={id} className={`tool-button ${activeTool === id ? "active" : ""}`} onClick={() => setActiveTool(id)} aria-label={label} title={label}><Icon size={20} /></button>)}
            {activeTool === "shape" && (
              <select className="shape-select" value={shapeKind} onChange={(event) => setShapeKind(event.target.value as ShapeKind)} aria-label="Loại hình">
                <option value="line">Đường thẳng</option>
                <option value="arrow">Mũi tên</option>
                <option value="rectangle">Chữ nhật</option>
                <option value="ellipse">Bầu dục</option>
              </select>
            )}
            <span className="toolbar-divider" />
            <button className="icon-button compact" aria-label="Hoàn tác" onClick={undo} disabled={!(strokeHistory[activeNote.id]?.undo.length)}><Undo2 size={19} /></button>
            <button className="icon-button compact" aria-label="Làm lại" onClick={redo} disabled={!(strokeHistory[activeNote.id]?.redo.length)}><Redo2 size={19} /></button>
            <button className="icon-button compact delete-tool" aria-label="Xóa trang note" title="Xóa trang" onClick={deleteNotePage}><Trash2 size={18} /></button>
            <span className="toolbar-divider" />
            {["#2465a8", "#c94b50", "#111111", "#f6d96b"].map((color, index) => <button key={color} className={`ink-dot ${inkColor === color ? "selected" : ""}`} style={{ background: color }} onClick={() => { setInkColor(color); setActiveTool("pen"); }} aria-label={`Màu mực ${index + 1}`} />)}
            <select className="stroke-width" value={inkWidth} onChange={(event) => setInkWidth(Number(event.target.value))} aria-label="Độ dày nét"><option value="1">1px</option><option value="2">2px</option><option value="3">3px</option><option value="5">5px</option></select>
            <span className="toolbar-divider" />
            <button className={`paper-button ${paperPanelOpen ? "active" : ""}`} onClick={() => setPaperPanelOpen((open) => !open)} aria-expanded={paperPanelOpen}><NotebookTabs size={17} /><span>Giấy</span></button>
          </div>

          {paperPanelOpen && (
            <div className="paper-panel" role="dialog" aria-label="Cài đặt giấy">
              <div className="paper-panel-heading"><div><strong>Mẫu giấy</strong><span>Áp dụng riêng cho trang hiện tại</span></div><button className="icon-button compact" onClick={() => setPaperPanelOpen(false)} aria-label="Đóng"><X size={17} /></button></div>
              <section>
                <label>Khổ giấy</label>
                <div className="paper-size-grid">
                  {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => {
                    const option = PAPER_SIZES[size];
                    return <button key={size} className={activeNote.paper.size === size ? "selected" : ""} onClick={() => updatePaper({ size })}><b>{option.label}</b><small>{option.dimensions}</small>{activeNote.paper.size === size && <Check size={14} />}</button>;
                  })}
                </div>
              </section>
              <section>
                <label>Hướng giấy</label>
                <div className="segmented-control"><button className={activeNote.paper.orientation === "portrait" ? "selected" : ""} onClick={() => updatePaper({ orientation: "portrait" })}>Dọc</button><button className={activeNote.paper.orientation === "landscape" ? "selected" : ""} onClick={() => updatePaper({ orientation: "landscape" })}>Ngang</button></div>
              </section>
              <section>
                <label>Dòng kẻ</label>
                <div className="template-grid">
                  {PAPER_TEMPLATES.map((template) => <button key={template.id} className={activeNote.paper.template === template.id ? "selected" : ""} onClick={() => updatePaper({ template: template.id })}><span className={`template-preview template-${template.id}`} /><b>{template.label}</b></button>)}
                </div>
              </section>
              <section>
                <label>Màu giấy</label>
                <div className="paper-color-row">
                  {PAPER_COLORS.map((paperColor) => <button key={paperColor.id} className={activeNote.paper.color === paperColor.id ? "selected" : ""} onClick={() => updatePaper({ color: paperColor.id })} title={paperColor.label} aria-label={paperColor.label}><span style={{ background: paperColor.swatch }} />{activeNote.paper.color === paperColor.id && <Check size={13} />}</button>)}
                </div>
              </section>
            </div>
          )}

          <div className="note-stage">
            <article className={`note-paper interactive ${activeTool === "text" ? "typing" : ""} paper-${activeNote.paper.color} template-${activeNote.paper.template}`} style={paperStyle}>
              <div className="paper-background" />
              <div className="typed-layer">
                <input className="note-title-input" value={activeNote.title} onChange={(event) => updateActiveNote({ title: event.target.value })} readOnly={activeTool !== "text"} aria-label="Tiêu đề ghi chú" />
                <textarea className="note-editor" value={activeNote.body} onChange={(event) => updateActiveNote({ body: event.target.value })} readOnly={activeTool !== "text"} placeholder="Bắt đầu nhập nội dung tại đây…" spellCheck={false} aria-label="Nội dung ghi chú" />
                {activeNote.citationPage && <button className="citation-chip" onClick={() => { setSourcePage(activeNote.citationPage!); setToast(`Đã quay lại trang ${activeNote.citationPage}`); }}>Trang {activeNote.citationPage}</button>}
              </div>
              <InkCanvas key={activeNote.id} tool={activeTool} color={inkColor} width={inkWidth} shape={shapeKind} strokes={activeNote.strokes} onCommit={commitStrokes} />
              {activeTool === "text" && <div className="mode-hint">Chế độ nhập chữ</div>}
            </article>
            <div className="paper-size">{selectedPaperSize.label} ({selectedPaperSize.dimensions}) · {activeNote.paper.orientation === "portrait" ? "Dọc" : "Ngang"} · {activeTool === "text" ? "Chạm vào trang để nhập chữ" : activeTool === "lasso" ? "Khoanh quanh nét cần chọn" : activeTool === "eraser" ? "Lướt để tẩy đúng phần nét chạm vào" : "Dùng chuột hoặc bút cảm ứng để viết"}</div>
          </div>
        </section>

        <aside className="note-thumbnails" aria-label="Trang ghi chú">
          <div className="notes-heading"><select value={activeNotebook.id} onChange={(event) => updateActiveWorkspace((workspace) => ({ ...workspace, activeNotebookId: event.target.value }))} aria-label="Chọn sổ ghi chú">{activeWorkspace.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}</select><button className="round-delete" aria-label="Xóa sổ note" title="Xóa sổ note" onClick={deleteNotebook}><Trash2 size={14} /></button><button className="round-add" aria-label="Thêm trang" onClick={addNotePage}><Plus size={18} /></button></div>
          {notePages.map((page, index) => {
            const paperColor = PAPER_COLORS.find((color) => color.id === page.paper.color)?.swatch;
            return <div className="note-thumb-wrap" key={page.id}><button className={`note-thumb ${page.id === activeNote.id ? "active" : ""}`} onClick={() => setActiveNoteId(page.id)}><span className={`mini-note template-${page.paper.template}`} style={{ backgroundColor: paperColor }}><strong>{page.title.slice(0, 15)}</strong><i /><i /><i /></span><b>{index + 1}</b></button>{page.id === activeNote.id && <button className="note-thumb-delete" aria-label={`Xóa trang ${index + 1}`} title="Xóa trang note" onClick={deleteNotePage}><Trash2 size={13} /></button>}</div>;
          })}
          <button className="new-page" onClick={addNotePage}><Plus size={21} /><span>Trang mới</span></button>
        </aside>
      </section>
    </main>
  );
}
