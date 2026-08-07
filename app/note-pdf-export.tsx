import { ChevronDown, FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
].join(",");

const MOBILE_EXPORT_QUERY = "(max-width: 900px), (pointer: coarse)";
const IMAGE_WAIT_TIMEOUT = 4500;
const SHEET_RENDER_TIMEOUT = 12000;

type ExportScope = "notebook" | "section" | "page" | "sheet";
type ExportPlan = {
  scope: ExportScope;
  title: string;
  detail: string;
  fileName: string;
  pageIndices: number[];
};
type ExportProgress = { page: number; total: number; scope: ExportScope };

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
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

function isMobileExport() {
  return window.matchMedia?.(MOBILE_EXPORT_QUERY).matches ?? window.innerWidth <= 900;
}

async function settleLayout() {
  await nextFrame();
  await nextFrame();
  await delay(isMobileExport() ? 24 : 45);
}

function safeFileName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "MedNote";
}

let cachedStyleText: string | null = null;
function styleSheetText() {
  if (cachedStyleText !== null) return cachedStyleText;
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .filter((rule) => rule.type !== CSSRule.FONT_FACE_RULE && rule.type !== CSSRule.KEYFRAMES_RULE)
        .map((rule) => rule.cssText)
        .join("\n");
      if (css) chunks.push(css);
    } catch {
      // Ignore stylesheets the browser does not allow us to read.
    }
  }
  cachedStyleText = chunks.join("\n");
  return cachedStyleText;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Không thể đọc hình"));
    reader.readAsDataURL(blob);
  });
}

async function imageSourceAsDataUrl(image: HTMLImageElement) {
  if (!image.src || image.src.startsWith("data:")) return image.src;
  if (image.src.startsWith("blob:")) {
    try {
      return await withTimeout(fetch(image.src).then((response) => response.blob()).then(blobToDataUrl), IMAGE_WAIT_TIMEOUT, "Hình trong Sheet tải quá lâu");
    } catch {
      return "";
    }
  }
  try {
    const response = await withTimeout(fetch(image.src), IMAGE_WAIT_TIMEOUT, "Hình trong Sheet tải quá lâu");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await withTimeout(blobToDataUrl(await response.blob()), IMAGE_WAIT_TIMEOUT, "Không thể đọc hình trong Sheet");
  } catch {
    // A missing optional image must not prevent the whole notebook from exporting.
    return "";
  }
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  const wait = Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
  await withTimeout(wait.then(() => undefined), IMAGE_WAIT_TIMEOUT, "Hình trong Sheet chưa tải xong").catch(() => undefined);
}

async function prepareClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(CONTROL_SELECTOR).forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
  clone.querySelectorAll<HTMLElement>(".selected,.editable,.movable").forEach((element) => {
    element.classList.remove("selected", "editable", "movable");
  });

  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  const cloneImages = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  await withTimeout(Promise.all(sourceImages.map(async (image, index) => {
    const target = cloneImages[index];
    if (!target) return;
    const sourceUrl = await imageSourceAsDataUrl(image);
    if (sourceUrl) target.src = sourceUrl;
    else target.removeAttribute("src");
  })).then(() => undefined), IMAGE_WAIT_TIMEOUT + 1500, "Chuẩn bị hình cho Sheet quá lâu").catch(() => undefined);

  const sourceCanvases = Array.from(source.querySelectorAll<HTMLCanvasElement>("canvas"));
  const cloneCanvases = Array.from(clone.querySelectorAll<HTMLCanvasElement>("canvas"));
  sourceCanvases.forEach((canvas, index) => {
    const target = cloneCanvases[index];
    if (!target) return;
    const image = document.createElement("img");
    try {
      image.src = canvas.toDataURL("image/png");
    } catch {
      image.src = "";
    }
    image.alt = "";
    image.setAttribute("style", target.getAttribute("style") ?? "");
    image.style.display = "block";
    image.style.width = target.style.width || "100%";
    image.style.height = target.style.height || "100%";
    target.replaceWith(image);
  });

  return clone;
}

async function elementToPng(source: HTMLElement, width: number, height: number) {
  const clone = await prepareClone(source);
  const styles = styleSheetText().replace(/<\/style/gi, "<\\/style");
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${styles}</style>${serialized}</div></foreignObject></svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = svgUrl;
    await withTimeout(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể dựng ảnh Sheet"));
    }), SHEET_RENDER_TIMEOUT, "Dựng Sheet quá 12 giây");

    const pixelRatio = isMobileExport() ? 1 : 1.5;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Thiết bị không hỗ trợ dựng PDF");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const png = await withTimeout(new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Không thể tạo ảnh Sheet")),
      "image/png",
      isMobileExport() ? 0.9 : 1,
    )), 8000, "Mã hóa ảnh Sheet quá lâu");
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(svgUrl);
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
  const indicesForIds = (ids: string[]) => uniqueIndices(ids.map((id) => indexById.get(id)).filter((index): index is number => typeof index === "number"));
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
  const activeGroups = pageGroups(notebook, activeSection);
  const activeGroup = activeGroups.find((group) => group.sheets.some((sheet) => String(sheet.id) === activeSheetId)) || activeGroups[0];
  const activeGroupSheetIndex = activeGroup?.sheets.findIndex((sheet) => String(sheet.id) === activeSheetId) ?? -1;
  const notebookTitle = String(record.title || notebook.title || "Notebook").trim() || "Notebook";
  const sectionTitle = String(activeSection.title || "Section").trim() || "Section";
  const pageTitle = String(activeGroup?.title || "Page").trim() || "Page";
  const sheetLabel = activeGroupSheetIndex >= 0 ? `Sheet ${activeGroupSheetIndex + 1}` : "Sheet hiện tại";

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
    const pageSheetIds = activeGroup.sheets.map((sheet) => String(sheet.id));
    plans.push({
      scope: "page",
      title: "Page",
      detail: `${pageTitle} · ${pageSheetIds.length} Sheet`,
      fileName: `${safeFileName(`${notebookTitle} - ${pageTitle}`)}.pdf`,
      pageIndices: indicesForIds(pageSheetIds),
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

  let activeIndex = thumbnails.findIndex((item) => item.classList.contains("active"));
  for (let attempt = 0; attempt < 40 && activeIndex !== index; attempt += 1) {
    await nextFrame();
    activeIndex = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb")).findIndex((item) => item.classList.contains("active"));
  }
  if (activeIndex !== index) throw new Error(`Không thể chuyển tới Sheet ${index + 1}`);

  await settleLayout();
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (!paper) throw new Error("Không tìm thấy Sheet để xuất");
  await waitForImages(paper);
  await withTimeout(document.fonts?.ready ?? Promise.resolve(), 2500, "Font tải quá lâu").catch(() => undefined);
  return paper;
}

function downloadPdf(bytes: Uint8Array, fileName: string) {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportPlanToPdf(plan: ExportPlan, onProgress: (page: number, total: number) => void) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!thumbnails.length) throw new Error("Notebook chưa có Sheet nào");
  if (!plan.pageIndices.length) throw new Error(`${plan.title} này chưa có Sheet để xuất`);

  cachedStyleText = null;
  const originalIndex = Math.max(0, thumbnails.findIndex((thumbnail) => thumbnail.classList.contains("active")));
  const pdf = await PDFDocument.create();
  document.body.classList.add("note-pdf-export-active");
  try {
    for (let position = 0; position < plan.pageIndices.length; position += 1) {
      onProgress(position + 1, plan.pageIndices.length);
      document.dispatchEvent(new CustomEvent("mednote:pdf-export-progress", { detail: { page: position + 1, total: plan.pageIndices.length, scope: plan.scope } }));
      const paper = await activateNotePage(plan.pageIndices[position]);
      paper.classList.add("note-pdf-exporting");
      await settleLayout();
      const computed = window.getComputedStyle(paper);
      const naturalWidth = Number.parseFloat(computed.getPropertyValue("--note-natural-width"))
        || Number.parseFloat(computed.getPropertyValue("--paper-max-width"))
        || paper.offsetWidth;
      const ratioText = computed.getPropertyValue("--paper-ratio");
      const ratioMatch = ratioText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      const ratio = ratioMatch ? Number(ratioMatch[1]) / Number(ratioMatch[2]) : paper.offsetWidth / Math.max(1, paper.offsetHeight);
      const naturalHeight = Number.parseFloat(computed.getPropertyValue("--note-natural-height")) || naturalWidth / ratio;
      const png = await withTimeout(
        elementToPng(paper, Math.round(naturalWidth), Math.round(naturalHeight)),
        SHEET_RENDER_TIMEOUT + IMAGE_WAIT_TIMEOUT + 5000,
        `Sheet ${position + 1} xử lý quá lâu`,
      );
      const embedded = await pdf.embedPng(png);
      const size = pdfPageSize(naturalWidth, naturalHeight);
      const page = pdf.addPage([size.width, size.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
      paper.classList.remove("note-pdf-exporting");
      await nextFrame();
    }
  } finally {
    document.querySelectorAll<HTMLElement>(".note-pdf-exporting").forEach((paper) => paper.classList.remove("note-pdf-exporting"));
    await activateNotePage(originalIndex).catch(() => undefined);
    document.body.classList.remove("note-pdf-export-active");
  }

  downloadPdf(await pdf.save(), plan.fileName);
}

export default function NotePdfExporter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".note-file-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [menuOpen]);

  if (!target) return null;
  const exporting = progress !== null;
  const plans = buildExportPlans();

  const startExport = (plan: ExportPlan) => {
    setMenuOpen(false);
    setProgress({ page: 0, total: plan.pageIndices.length, scope: plan.scope });
    void exportPlanToPdf(plan, (page, total) => setProgress({ page, total, scope: plan.scope }))
      .catch((error) => window.alert(error instanceof Error ? `Không thể xuất PDF: ${error.message}` : "Không thể xuất PDF"))
      .finally(() => setProgress(null));
  };

  return createPortal(
    <div className="note-pdf-export-wrap" ref={wrapperRef}>
      <button
        className="note-create-button note-pdf-export-button"
        disabled={exporting || !plans.length}
        onClick={() => setMenuOpen((open) => !open)}
        title="Xuất PDF theo Notebook, Section, Page hoặc Sheet"
        aria-label="Xuất note thành PDF"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <FileDown size={16} />
        <span>{exporting ? `PDF ${progress.page}/${progress.total}` : "Xuất PDF"}</span>
        {!exporting && <ChevronDown size={13} />}
      </button>
      {menuOpen && !exporting && (
        <div className="note-pdf-export-menu" role="menu" aria-label="Chọn phạm vi xuất PDF">
          <div className="note-pdf-export-menu-title">Xuất PDF</div>
          {plans.map((plan) => (
            <button key={plan.scope} type="button" role="menuitem" onClick={() => startExport(plan)} disabled={!plan.pageIndices.length}>
              <strong>{plan.title}</strong>
              <small>{plan.detail}</small>
            </button>
          ))}
        </div>
      )}
    </div>,
    target,
  );
}
