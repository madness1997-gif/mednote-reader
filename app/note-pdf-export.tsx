import { FileDown } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PDFDocument } from "pdf-lib";

const CONTROL_SELECTOR = [
  ".excerpt-object-controls",
  ".excerpt-resize-handle",
  ".excerpt-rotate-handle",
  ".callout-anchor-handle",
  ".mode-hint",
  ".citation-chip",
].join(",");

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

async function settleLayout() {
  await nextFrame();
  await nextFrame();
  await delay(60);
}

function safeFileName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "MedNote";
}

function styleSheetText() {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      chunks.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"));
    } catch {
      // Ignore third-party stylesheets that the browser does not allow us to read.
    }
  }
  return chunks.join("\n");
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
  try {
    return await blobToDataUrl(await fetch(image.src).then((response) => response.blob()));
  } catch {
    return image.src;
  }
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
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
  await Promise.all(sourceImages.map(async (image, index) => {
    const target = cloneImages[index];
    if (target) target.src = await imageSourceAsDataUrl(image);
  }));

  const sourceCanvases = Array.from(source.querySelectorAll<HTMLCanvasElement>("canvas"));
  const cloneCanvases = Array.from(clone.querySelectorAll<HTMLCanvasElement>("canvas"));
  sourceCanvases.forEach((canvas, index) => {
    const target = cloneCanvases[index];
    if (!target) return;
    const image = document.createElement("img");
    image.src = canvas.toDataURL("image/png");
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
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể dựng ảnh trang note"));
    });
    const pixelRatio = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Thiết bị không hỗ trợ xuất ảnh trang note");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể tạo ảnh trang note")), "image/png", 1));
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

function pdfPageSize(paper: HTMLElement, width: number, height: number) {
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

async function activateNotePage(index: number) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  const thumbnail = thumbnails[index];
  if (!thumbnail) throw new Error(`Không tìm thấy trang note ${index + 1}`);
  if (!thumbnail.classList.contains("active")) thumbnail.click();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await nextFrame();
    const active = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb")).findIndex((item) => item.classList.contains("active"));
    if (active === index) break;
  }
  await settleLayout();
  const paper = document.querySelector<HTMLElement>(".note-stage .note-paper");
  if (!paper) throw new Error("Không tìm thấy trang note để xuất");
  await waitForImages(paper);
  await (document.fonts?.ready ?? Promise.resolve());
  return paper;
}

async function exportNotebookToPdf(onProgress: (page: number, total: number) => void) {
  const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb"));
  if (!thumbnails.length) throw new Error("Sổ note chưa có trang nào");
  const originalIndex = Math.max(0, thumbnails.findIndex((thumbnail) => thumbnail.classList.contains("active")));
  const pdf = await PDFDocument.create();
  document.body.classList.add("note-pdf-export-active");
  try {
    for (let index = 0; index < thumbnails.length; index += 1) {
      onProgress(index + 1, thumbnails.length);
      const paper = await activateNotePage(index);
      paper.classList.add("note-pdf-exporting");
      await settleLayout();
      const computed = window.getComputedStyle(paper);
      const naturalWidth = Number.parseFloat(computed.getPropertyValue("--note-natural-width")) || Number.parseFloat(computed.getPropertyValue("--paper-max-width")) || paper.offsetWidth;
      const ratioText = computed.getPropertyValue("--paper-ratio");
      const ratioMatch = ratioText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      const ratio = ratioMatch ? Number(ratioMatch[1]) / Number(ratioMatch[2]) : paper.offsetWidth / Math.max(1, paper.offsetHeight);
      const naturalHeight = Number.parseFloat(computed.getPropertyValue("--note-natural-height")) || naturalWidth / ratio;
      const png = await elementToPng(paper, Math.round(naturalWidth), Math.round(naturalHeight));
      const embedded = await pdf.embedPng(png);
      const size = pdfPageSize(paper, naturalWidth, naturalHeight);
      const page = pdf.addPage([size.width, size.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
      paper.classList.remove("note-pdf-exporting");
    }
  } finally {
    document.querySelectorAll<HTMLElement>(".note-pdf-exporting").forEach((paper) => paper.classList.remove("note-pdf-exporting"));
    await activateNotePage(originalIndex).catch(() => undefined);
    document.body.classList.remove("note-pdf-export-active");
  }

  const notebookName = document.querySelector<HTMLOptionElement>(".notes-heading select option:checked")?.textContent?.trim()
    || document.querySelector<HTMLElement>(".document-title span")?.textContent?.trim()
    || "MedNote";
  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(notebookName)}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function NotePdfExporter() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);

  useEffect(() => {
    const findTarget = () => setTarget(document.querySelector<HTMLElement>(".note-file-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;
  const exporting = progress !== null;
  return createPortal(
    <button
      className="note-create-button note-pdf-export-button"
      disabled={exporting}
      onClick={() => {
        setProgress({ page: 0, total: document.querySelectorAll(".note-thumbnails .note-thumb").length });
        void exportNotebookToPdf((page, total) => setProgress({ page, total }))
          .catch((error) => window.alert(error instanceof Error ? `Không thể xuất PDF: ${error.message}` : "Không thể xuất PDF"))
          .finally(() => setProgress(null));
      }}
      title="Xuất toàn bộ sổ note thành PDF nhiều trang"
      aria-label="Xuất note thành PDF"
    >
      <FileDown size={16} />
      <span>{exporting ? `PDF ${progress.page}/${progress.total}` : "Xuất PDF"}</span>
    </button>,
    target,
  );
}
