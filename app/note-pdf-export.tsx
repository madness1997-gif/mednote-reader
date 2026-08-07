import html2canvas from "html2canvas";
import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PDFDocument } from "pdf-lib";
import { currentContext, pageGroups, type SheetPage } from "./page-sheet-state";

const CONTROL_SELECTOR = [
  ".excerpt-object-controls",
  ".excerpt-resize-handle",
  ".excerpt-rotate-handle",
  ".callout-anchor-handle",
  ".mode-hint",
  ".citation-chip",
  ".note-selection-box",
].join(",");

const MOBILE_QUERY = "(max-width: 900px), (pointer: coarse)";
const CAPTURE_TIMEOUT_MS = 18_000;
const PDF_SAVE_TIMEOUT_MS = 10_000;

type ExportScope = "notebook" | "section" | "page" | "sheet";
type ExportPlan = {
  scope: ExportScope;
  title: string;
  detail: string;
  fileName: string;
  pageIndices: number[];
};
type ExportProgress = {
  page: number;
  total: number;
  scope: ExportScope;
  phase: "prepare" | "capture" | "save";
};
type ReadyPdf = { url: string; fileName: string; bytes: number };

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isMobile() {
  return window.matchMedia?.(MOBILE_QUERY).matches ?? window.innerWidth <= 900;
}

async function settleLayout() {
  await nextFrame();
  await nextFrame();
  await delay(isMobile() ? 20 : 35);
}

function safeFileName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "MedNote";
}

function uniqueIndices(indices: number[]) {
  return [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0))];
}

function buildExportPlans(): ExportPlan[] {
  const context = currentContext();
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!context) {
    return thumbnails.length ? [{
      scope: "notebook",
      title: "Notebook",
      detail: `${thumbnails.length} Sheet`,
      fileName: "MedNote.pdf",
      pageIndices: thumbnails.map((_, index) => index),
    }] : [];
  }

  const { notebook, record, activeSection, activeSheet } = context;
  const physicalSheets = (notebook.pages || []) as SheetPage[];
  const indexById = new Map(physicalSheets.map((sheet, index) => [String(sheet.id), index]));
  const indicesForIds = (ids: string[]) => uniqueIndices(
    ids.map((id) => indexById.get(id)).filter((index): index is number => typeof index === "number"),
  );
  const sheetIdsForSection = (sectionId: string) => {
    const section = record.sections.find((item) => item.id === sectionId);
    return section ? pageGroups(notebook, section).flatMap((group) => group.sheets.map((sheet) => String(sheet.id))) : [];
  };

  const orderedNotebookIds = record.sections.flatMap((section) => sheetIdsForSection(section.id));
  const included = new Set(orderedNotebookIds);
  for (const sheet of physicalSheets) {
    const id = String(sheet.id);
    if (!included.has(id)) orderedNotebookIds.push(id);
  }

  const activeSheetId = String(activeSheet?.id || notebook.activePageId || "");
  const groups = pageGroups(notebook, activeSection);
  const activeGroup = groups.find((group) => group.sheets.some((sheet) => String(sheet.id) === activeSheetId)) || groups[0];
  const activeSheetIndex = activeGroup?.sheets.findIndex((sheet) => String(sheet.id) === activeSheetId) ?? -1;
  const notebookTitle = String(record.title || notebook.title || "Notebook").trim() || "Notebook";
  const sectionTitle = String(activeSection.title || "Section").trim() || "Section";
  const pageTitle = String(activeGroup?.title || "Page").trim() || "Page";
  const sheetLabel = activeSheetIndex >= 0 ? `Sheet ${activeSheetIndex + 1}` : "Sheet hiện tại";

  const plans: ExportPlan[] = [
    {
      scope: "notebook",
      title: "Notebook",
      detail: `${notebookTitle} · ${orderedNotebookIds.length} Sheet`,
      fileName: `${safeFileName(notebookTitle)}.pdf`,
      pageIndices: indicesForIds(orderedNotebookIds),
    },
    {
      scope: "section",
      title: "Section",
      detail: `${sectionTitle} · ${sheetIdsForSection(activeSection.id).length} Sheet`,
      fileName: `${safeFileName(`${notebookTitle} - ${sectionTitle}`)}.pdf`,
      pageIndices: indicesForIds(sheetIdsForSection(activeSection.id)),
    },
  ];

  if (activeGroup) {
    const ids = activeGroup.sheets.map((sheet) => String(sheet.id));
    plans.push({
      scope: "page",
      title: "Page",
      detail: `${pageTitle} · ${ids.length} Sheet`,
      fileName: `${safeFileName(`${notebookTitle} - ${pageTitle}`)}.pdf`,
      pageIndices: indicesForIds(ids),
    });
  }

  if (activeSheetId && indexById.has(activeSheetId)) {
    plans.push({
      scope: "sheet",
      title: "Sheet",
      detail: `${pageTitle} · ${sheetLabel}`,
      fileName: `${safeFileName(`${notebookTitle} - ${pageTitle} - ${sheetLabel}`)}.pdf`,
      pageIndices: indicesForIds([activeSheetId]),
    });
  }

  return plans;
}

async function activateNotePage(index: number) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  const thumbnail = thumbnails[index];
  if (!thumbnail) throw new Error(`Không tìm thấy Sheet ${index + 1}`);
  if (!thumbnail.classList.contains("active")) thumbnail.click();

  for (let attempt = 0; attempt < 45; attempt += 1) {
    const current = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"))
      .findIndex((item) => item.classList.contains("active"));
    if (current === index) break;
    await nextFrame();
    if (attempt === 44) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);
  }

  await settleLayout();
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (!paper) throw new Error("Không tìm thấy Sheet để xuất");
  return paper;
}

function paperNaturalSize(source: HTMLElement) {
  const computed = window.getComputedStyle(source);
  const width = Number.parseFloat(computed.getPropertyValue("--note-natural-width"))
    || Number.parseFloat(computed.getPropertyValue("--paper-max-width"))
    || source.scrollWidth
    || source.offsetWidth;
  const ratioText = computed.getPropertyValue("--paper-ratio");
  const ratioMatch = ratioText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  const ratio = ratioMatch
    ? Number(ratioMatch[1]) / Math.max(0.001, Number(ratioMatch[2]))
    : width / Math.max(1, source.scrollHeight || source.offsetHeight);
  const height = Number.parseFloat(computed.getPropertyValue("--note-natural-height"))
    || width / Math.max(0.001, ratio);
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  const blob = await withTimeout(new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Không mã hóa được ảnh Sheet")),
      "image/jpeg",
      isMobile() ? 0.88 : 0.93,
    );
  }), 7000, "Mã hóa ảnh Sheet quá lâu");
  return new Uint8Array(await blob.arrayBuffer());
}

async function capturePaper(source: HTMLElement, sheetNumber: number) {
  const { width, height } = paperNaturalSize(source);
  source.classList.add("note-pdf-exporting");
  await settleLayout();

  try {
    const canvas = await withTimeout(html2canvas(source, {
      backgroundColor: "#ffffff",
      scale: isMobile() ? 0.9 : 1.25,
      logging: false,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      removeContainer: true,
      imageTimeout: 5000,
      width,
      height,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(width, document.documentElement.clientWidth),
      windowHeight: Math.max(height, document.documentElement.clientHeight),
      ignoreElements: (element) => element instanceof Element && Boolean(element.closest(CONTROL_SELECTOR)),
      onclone: (_document, clonedElement) => {
        clonedElement.querySelectorAll<HTMLElement>(CONTROL_SELECTOR).forEach((element) => element.remove());
        clonedElement.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
        clonedElement.querySelectorAll<HTMLElement>(".selected,.editable,.movable").forEach((element) => {
          element.classList.remove("selected", "editable", "movable");
        });
      },
    }), CAPTURE_TIMEOUT_MS, `Sheet ${sheetNumber} dựng quá ${CAPTURE_TIMEOUT_MS / 1000} giây`);
    return { jpeg: await canvasToJpegBytes(canvas), width, height };
  } finally {
    source.classList.remove("note-pdf-exporting");
  }
}

type PaperCandidate = { widthMm: number; heightMm: number; naturalWidth: number };
const PAPER_CANDIDATES: PaperCandidate[] = [
  { widthMm: 210, heightMm: 297, naturalWidth: 720 },
  { widthMm: 148, heightMm: 210, naturalWidth: 590 },
  { widthMm: 176, heightMm: 250, naturalWidth: 650 },
  { widthMm: 216, heightMm: 279, naturalWidth: 740 },
  { widthMm: 210, heightMm: 210, naturalWidth: 720 },
];

function pdfPageSize(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  const candidates = PAPER_CANDIDATES.flatMap((candidate) => [
    { widthMm: candidate.widthMm, heightMm: candidate.heightMm, expectedWidth: candidate.naturalWidth },
    { widthMm: candidate.heightMm, heightMm: candidate.widthMm, expectedWidth: Math.min(920, candidate.naturalWidth * 1.32) },
  ]);
  const best = candidates.reduce((current, candidate) => {
    const candidateRatio = candidate.widthMm / candidate.heightMm;
    const score = Math.abs(Math.log(ratio / candidateRatio)) * 100 + Math.abs(width - candidate.expectedWidth) / 120;
    return score < current.score ? { ...candidate, score } : current;
  }, { ...candidates[0], score: Number.POSITIVE_INFINITY });
  const pointsPerMm = 72 / 25.4;
  return { width: best.widthMm * pointsPerMm, height: best.heightMm * pointsPerMm };
}

async function exportPlanToPdfBytes(plan: ExportPlan, onProgress: (progress: ExportProgress) => void) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!thumbnails.length) throw new Error("Notebook chưa có Sheet nào");
  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);

  const originalIndex = Math.max(0, thumbnails.findIndex((thumbnail) => thumbnail.classList.contains("active")));
  const pdf = await PDFDocument.create();
  document.body.classList.add("note-pdf-export-active");

  try {
    for (let position = 0; position < plan.pageIndices.length; position += 1) {
      const displayPage = position + 1;
      onProgress({ page: displayPage, total: plan.pageIndices.length, scope: plan.scope, phase: "prepare" });
      const paper = await activateNotePage(plan.pageIndices[position]);
      onProgress({ page: displayPage, total: plan.pageIndices.length, scope: plan.scope, phase: "capture" });
      const rendered = await capturePaper(paper, displayPage);
      const embedded = await pdf.embedJpg(rendered.jpeg);
      const size = pdfPageSize(rendered.width, rendered.height);
      const page = pdf.addPage([size.width, size.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
      await nextFrame();
    }
  } finally {
    document.querySelectorAll<HTMLElement>(".note-pdf-exporting").forEach((paper) => paper.classList.remove("note-pdf-exporting"));
    await activateNotePage(originalIndex).catch(() => undefined);
    document.body.classList.remove("note-pdf-export-active");
  }

  onProgress({ page: plan.pageIndices.length, total: plan.pageIndices.length, scope: plan.scope, phase: "save" });
  const bytes = await withTimeout(pdf.save(), PDF_SAVE_TIMEOUT_MS, "Ghép PDF quá lâu");
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("File tạo ra không phải PDF hợp lệ");
  }
  return bytes;
}

function makePdfUrl(bytes: Uint8Array) {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
}

export default function NotePdfExporter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [ready, setReady] = useState<ReadyPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".note-file-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (readyUrlRef.current) URL.revokeObjectURL(readyUrlRef.current);
  }, []);

  const plans = useMemo(() => buildExportPlans(), [target, menuOpen, progress, ready, error]);
  if (!target) return null;
  const exporting = progress !== null;

  const clearReady = () => {
    if (readyUrlRef.current) {
      URL.revokeObjectURL(readyUrlRef.current);
      readyUrlRef.current = null;
    }
    setReady(null);
  };

  const startExport = (plan: ExportPlan) => {
    setMenuOpen(false);
    setError(null);
    clearReady();
    setProgress({ page: 0, total: plan.pageIndices.length, scope: plan.scope, phase: "prepare" });

    void exportPlanToPdfBytes(plan, setProgress)
      .then((bytes) => {
        const url = makePdfUrl(bytes);
        readyUrlRef.current = url;
        setReady({ url, fileName: plan.fileName, bytes: bytes.length });
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Không thể xuất PDF");
      })
      .finally(() => setProgress(null));
  };

  const toolbar = createPortal(
    <div className="note-pdf-export-wrap">
      <button
        className="note-create-button note-pdf-export-button"
        disabled={exporting || !plans.length}
        onClick={() => {
          setError(null);
          setMenuOpen(true);
        }}
        title="Xuất PDF theo Notebook, Section, Page hoặc Sheet"
        aria-label="Xuất note thành PDF"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
      >
        <FileDown size={16} />
        <span>Xuất PDF</span>
        <ChevronDown size={13} />
      </button>
    </div>,
    target,
  );

  const overlay = (menuOpen || exporting || ready || error) ? createPortal(
    <div className="note-pdf-export-layer" role="presentation" onMouseDown={(event) => {
      if (event.target !== event.currentTarget || exporting) return;
      setMenuOpen(false);
      if (ready) clearReady();
      setError(null);
    }}>
      <div className="note-pdf-export-dialog" role="dialog" aria-modal="true" aria-label="Xuất PDF">
        {menuOpen && !exporting && !ready && !error && (
          <>
            <div className="note-pdf-export-dialog-title">Xuất PDF</div>
            <div className="note-pdf-export-dialog-hint">Chọn phạm vi cần xuất</div>
            <div className="note-pdf-export-menu note-pdf-export-menu-portal">
              {plans.map((plan) => (
                <button
                  key={plan.scope}
                  type="button"
                  onClick={() => startExport(plan)}
                  disabled={!plan.pageIndices.length}
                  data-export-scope={plan.scope}
                >
                  <strong>{plan.title}</strong>
                  <small>{plan.detail}</small>
                </button>
              ))}
            </div>
            <button type="button" className="note-pdf-export-close" onClick={() => setMenuOpen(false)}>Hủy</button>
          </>
        )}

        {exporting && progress && (
          <div className="note-pdf-export-status">
            <strong>Đang tạo PDF…</strong>
            <small>
              {progress.phase === "save"
                ? "Đang ghép và kiểm tra file PDF…"
                : progress.phase === "capture"
                  ? `Đang dựng Sheet ${progress.page}/${progress.total}…`
                  : `Đang chuẩn bị Sheet ${Math.max(1, progress.page)}/${progress.total}…`}
            </small>
            <div className="note-pdf-export-progress"><i style={{ width: `${progress.phase === "save" ? 96 : Math.max(8, (progress.page / Math.max(1, progress.total)) * 88)}%` }} /></div>
          </div>
        )}

        {ready && !exporting && (
          <div className="note-pdf-export-status">
            <strong>PDF đã tạo xong</strong>
            <small>{ready.fileName} · {Math.max(1, Math.round(ready.bytes / 1024))} KB</small>
            <div className="note-pdf-export-ready-actions">
              <a className="primary" href={ready.url} download={ready.fileName} data-pdf-download="1">Tải PDF</a>
              <a href={ready.url} target="_blank" rel="noopener noreferrer">Mở PDF</a>
            </div>
            <button type="button" className="note-pdf-export-close" onClick={clearReady}>Đóng</button>
          </div>
        )}

        {error && !exporting && (
          <div className="note-pdf-export-status">
            <strong>Xuất PDF thất bại</strong>
            <small>{error}</small>
            <button type="button" className="note-pdf-export-close" onClick={() => setError(null)}>Đóng</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return <>{toolbar}{overlay}</>;
}
