"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileText,
  FolderOpen,
  Highlighter,
  Menu,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
  Redo2,
  TextCursorInput,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask as PDFRenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Tool = "pointer" | "pen" | "highlight" | "eraser" | "text";
type InkTool = "pen" | "highlight";
type Point = { x: number; y: number; pressure: number };
type Stroke = {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  points: Point[];
};
type NotePage = {
  id: string;
  title: string;
  body: string;
  citationPage: number | null;
  strokes: Stroke[];
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
  kind: "document" | "collection" | "demo";
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

const STORAGE_KEY = "mednote-library-v2";
const LEGACY_STORAGE_KEY = "mednote-notebook-v1";
const DB_NAME = "mednote-local";
const DB_STORE = "documents";
const DEMO_PAGES = [123, 124, 125, 126, 127, 128];

const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "pointer", label: "Chọn", icon: MousePointer2 },
  { id: "pen", label: "Bút", icon: PenTool },
  { id: "highlight", label: "Tô sáng", icon: Highlighter },
  { id: "eraser", label: "Tẩy nét", icon: Eraser },
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

function createBlankPage(citationPage = 1, index = 1): NotePage {
  return {
    id: uid("page"),
    title: `GHI CHÚ ${index}`,
    body: "",
    citationPage,
    strokes: [],
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
  context.save();
  context.globalAlpha = stroke.tool === "highlight" ? 0.3 : 1;
  context.strokeStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";
  const first = stroke.points[0];
  context.beginPath();
  context.moveTo(first.x * canvas.clientWidth, first.y * canvas.clientHeight);
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    const previous = stroke.points[index - 1];
    context.lineWidth = stroke.width * (0.7 + point.pressure * 0.5);
    const midX = ((previous.x + point.x) / 2) * canvas.clientWidth;
    const midY = ((previous.y + point.y) / 2) * canvas.clientHeight;
    context.quadraticCurveTo(previous.x * canvas.clientWidth, previous.y * canvas.clientHeight, midX, midY);
  }
  context.stroke();
  context.restore();
}

function InkCanvas({ tool, color, width, strokes, onChange }: { tool: Tool; color: string; width: number; strokes: Stroke[]; onChange: (strokes: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const drawing = useRef(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * ratio);
    canvas.height = Math.floor(canvas.clientHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    strokes.forEach((stroke) => drawStroke(context, canvas, stroke));
  }, [strokes]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      pressure: event.pressure || 0.5,
    };
  };

  const eraseAt = (point: Point) => {
    const threshold = 0.025;
    const next = strokes.filter((stroke) => !stroke.points.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < threshold));
    if (next.length !== strokes.length) onChange(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "pen" && tool !== "highlight" && tool !== "eraser") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      eraseAt(point);
      return;
    }
    currentStroke.current = { id: uid("stroke"), tool, color, width: tool === "highlight" ? width * 4 : width, points: [point] };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      eraseAt(point);
      return;
    }
    if (!currentStroke.current) return;
    currentStroke.current.points.push(point);
    redraw();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) drawStroke(context, canvas, currentStroke.current);
  };

  const finishStroke = () => {
    drawing.current = false;
    if (currentStroke.current && currentStroke.current.points.length > 1) onChange([...strokes, currentStroke.current]);
    currentStroke.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={`ink-canvas tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      aria-label="Lớp viết tay"
    />
  );
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [inkColor, setInkColor] = useState("#2465a8");
  const [inkWidth, setInkWidth] = useState(2);
  const [sourceZoom, setSourceZoom] = useState(1);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(() => [createDemoWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("demo-workspace");
  const [redoStrokes, setRedoStrokes] = useState<Record<string, Stroke[]>>({});
  const [pdfSource, setPdfSource] = useState<{ blob: Blob; documentId: string } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadedDocumentId, setLoadedDocumentId] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const [readerShare, setReaderShare] = useState(50);
  const [toast, setToast] = useState("Đã tự lưu");
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showPdfRail, setShowPdfRail] = useState(true);

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
    if (!currentPdfDocument) return activeDocument ? [sourcePage] : DEMO_PAGES;
    const count = currentPdfDocument.numPages;
    if (count <= 8) return Array.from({ length: count }, (_, index) => index + 1);
    const start = Math.min(Math.max(1, sourcePage - 3), count - 7);
    return Array.from({ length: 8 }, (_, index) => start + index);
  }, [activeDocument, currentPdfDocument, sourcePage]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedLibrary;
          if (parsed.workspaces?.length && !cancelled) {
            setWorkspaces(parsed.workspaces);
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

      const legacyPages = legacy?.pages?.length ? legacy.pages : initialPages;
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
    setWorkspaces((items) => [workspace, ...items]);
    setActiveWorkspaceId(workspace.id);
    setActiveTool("text");
    setLibraryOpen(false);
    setToast(files.length === 1 ? "Đã tạo sổ ghi chú cho tài liệu" : "Đã tạo ghi chú cho cụm tài liệu");
  };

  const addNotePage = () => {
    const next = createBlankPage(sourcePage, activeNotebook.pages.length + 1);
    updateActiveNotebook((notebook) => ({ ...notebook, pages: [...notebook.pages, next], activePageId: next.id }));
    setActiveTool("text");
    setToast("Đã thêm trang A4");
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
    if (notePages.length === 1) { setToast("Sổ cần giữ lại ít nhất một trang"); return; }
    const index = notePages.findIndex((page) => page.id === activeNote.id);
    const nextPages = notePages.filter((page) => page.id !== activeNote.id);
    const nextActiveId = nextPages[Math.max(0, index - 1)].id;
    updateActiveNotebook((notebook) => ({ ...notebook, pages: nextPages, activePageId: nextActiveId }));
    setToast("Đã xóa trang");
  };

  const undo = () => {
    const last = activeNote.strokes.at(-1);
    if (!last) return;
    updateActiveNote({ strokes: activeNote.strokes.slice(0, -1) });
    setRedoStrokes((state) => ({ ...state, [activeNote.id]: [...(state[activeNote.id] ?? []), last] }));
  };

  const redo = () => {
    const stack = redoStrokes[activeNote.id] ?? [];
    const stroke = stack.at(-1);
    if (!stroke) return;
    updateActiveNote({ strokes: [...activeNote.strokes, stroke] });
    setRedoStrokes((state) => ({ ...state, [activeNote.id]: stack.slice(0, -1) }));
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
                  <button key={workspace.id} className={`library-item ${workspace.id === activeWorkspace.id ? "active" : ""}`} onClick={() => { setActiveWorkspaceId(workspace.id); setLibraryOpen(false); }}>
                    <span className="library-icon"><FileText size={19} /></span>
                    <span><strong>{workspace.name}</strong><small>{workspace.kind === "collection" ? `${workspace.documents.length} tài liệu` : workspace.kind === "demo" ? "Tài liệu mẫu" : "1 tài liệu"} · {workspace.notebooks.length} sổ · {pageCount} trang note</small></span>
                  </button>
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
            <div className="zoom-control"><button aria-label="Thu nhỏ" onClick={() => setSourceZoom((zoom) => Math.max(.6, zoom - .1))}><Minus size={15} /></button><span>{Math.round(sourceZoom * 100)}%</span><button aria-label="Phóng to" onClick={() => setSourceZoom((zoom) => Math.min(2, zoom + .1))}><Plus size={15} /></button></div>
            <div className="page-control"><button aria-label="Trang trước" onClick={() => setSourcePage((page) => Math.max(currentPdfDocument ? 1 : 123, page - 1))}><ChevronLeft size={14} /></button><span>{sourcePage} / {totalPages}</span><button aria-label="Trang sau" onClick={() => setSourcePage((page) => Math.min(totalPages, page + 1))}><ChevronRight size={14} /></button></div>
          </div>
          <div className="document-stage">
            {currentPdfDocument ? <PdfPageCanvas key={`${activeDocument?.id}-${sourcePage}`} document={currentPdfDocument} page={sourcePage} zoom={sourceZoom} /> : activeDocument ? (
              <div className="empty-document"><FileText size={34} /><strong>{pdfStatus === "error" ? "Không tìm thấy bản PDF đã lưu" : "Đang mở tài liệu…"}</strong>{pdfStatus === "error" && <button className="primary-button" onClick={() => fileInputRef.current?.click()}>Chọn lại PDF</button>}</div>
            ) : <DemoDocument page={sourcePage} />}
          </div>
        </section>

        <div className="split-divider" aria-label="Điều chỉnh độ rộng" onPointerDown={startResize}><span>•••</span></div>

        <section className="notes-pane">
          <div className="note-toolbar" role="toolbar" aria-label="Công cụ ghi chú">
            <button className="note-create-button primary" onClick={addNotePage}><Plus size={17} /><span>Trang mới</span></button>
            <button className="note-create-button" onClick={addNotebook}><FileText size={16} /><span>Sổ mới</span></button>
            <span className="toolbar-divider" />
            {tools.map(({ id, label, icon: Icon }) => <button key={id} className={`tool-button ${activeTool === id ? "active" : ""}`} onClick={() => setActiveTool(id)} aria-label={label} title={label}><Icon size={20} /></button>)}
            <span className="toolbar-divider" />
            <button className="icon-button compact" aria-label="Hoàn tác" onClick={undo} disabled={!activeNote.strokes.length}><Undo2 size={19} /></button>
            <button className="icon-button compact" aria-label="Làm lại" onClick={redo} disabled={!(redoStrokes[activeNote.id]?.length)}><Redo2 size={19} /></button>
            <button className="icon-button compact delete-tool" aria-label="Xóa trang" onClick={deleteNotePage}><Trash2 size={18} /></button>
            <span className="toolbar-divider" />
            {["#2465a8", "#c94b50", "#111111", "#f6d96b"].map((color, index) => <button key={color} className={`ink-dot ${inkColor === color ? "selected" : ""}`} style={{ background: color }} onClick={() => { setInkColor(color); setActiveTool("pen"); }} aria-label={`Màu mực ${index + 1}`} />)}
            <select className="stroke-width" value={inkWidth} onChange={(event) => setInkWidth(Number(event.target.value))} aria-label="Độ dày nét"><option value="1">1px</option><option value="2">2px</option><option value="3">3px</option><option value="5">5px</option></select>
          </div>

          <div className="note-stage">
            <article className={`note-paper interactive ${activeTool === "text" ? "typing" : ""}`}>
              <div className="ruled-lines" />
              <div className="typed-layer">
                <input className="note-title-input" value={activeNote.title} onChange={(event) => updateActiveNote({ title: event.target.value })} readOnly={activeTool !== "text"} aria-label="Tiêu đề ghi chú" />
                <textarea className="note-editor" value={activeNote.body} onChange={(event) => updateActiveNote({ body: event.target.value })} readOnly={activeTool !== "text"} placeholder="Bắt đầu nhập nội dung tại đây…" spellCheck={false} aria-label="Nội dung ghi chú" />
                {activeNote.citationPage && <button className="citation-chip" onClick={() => { setSourcePage(activeNote.citationPage!); setToast(`Đã quay lại trang ${activeNote.citationPage}`); }}>Trang {activeNote.citationPage}</button>}
              </div>
              <InkCanvas tool={activeTool} color={inkColor} width={inkWidth} strokes={activeNote.strokes} onChange={(strokes) => { updateActiveNote({ strokes }); setRedoStrokes((state) => ({ ...state, [activeNote.id]: [] })); }} />
              {activeTool === "text" && <div className="mode-hint">Chế độ nhập chữ</div>}
            </article>
            <div className="paper-size">A4 (210 × 297 mm) · {activeTool === "text" ? "Chạm vào trang để nhập chữ" : "Dùng chuột hoặc bút cảm ứng để viết"}</div>
          </div>
        </section>

        <aside className="note-thumbnails" aria-label="Trang ghi chú">
          <div className="notes-heading"><select value={activeNotebook.id} onChange={(event) => updateActiveWorkspace((workspace) => ({ ...workspace, activeNotebookId: event.target.value }))} aria-label="Chọn sổ ghi chú">{activeWorkspace.notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}</select><button className="round-add" aria-label="Thêm trang" onClick={addNotePage}><Plus size={18} /></button></div>
          {notePages.map((page, index) => <button className={`note-thumb ${page.id === activeNote.id ? "active" : ""}`} key={page.id} onClick={() => setActiveNoteId(page.id)}><span className="mini-note"><strong>{page.title.slice(0, 15)}</strong><i /><i /><i /></span><b>{index + 1}</b></button>)}
          <button className="new-page" onClick={addNotePage}><Plus size={21} /><span>Trang mới</span></button>
        </aside>
      </section>
    </main>
  );
}
