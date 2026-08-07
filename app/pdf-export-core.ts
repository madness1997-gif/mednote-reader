import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";

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

export async function createPdfDocument() {
  return PDFDocument.create();
}

export async function appendPaperToPdf(pdf: PDFDocument, source: HTMLElement, sheetNumber: number) {
  const rendered = await capturePaper(source, sheetNumber);
  const embedded = await pdf.embedJpg(rendered.jpeg);
  const size = pdfPageSize(rendered.width, rendered.height);
  const page = pdf.addPage([size.width, size.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
}

export async function saveVerifiedPdf(pdf: PDFDocument) {
  const bytes = await withTimeout(pdf.save(), PDF_SAVE_TIMEOUT_MS, "Ghép PDF quá lâu");
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (bytes.length < 5 || header !== "%PDF-") throw new Error("File tạo ra không phải PDF hợp lệ");
  return bytes;
}

export async function runPdfCoreSelfTest() {
  const fixture = document.createElement("div");
  fixture.className = "note-paper";
  fixture.style.setProperty("--note-natural-width", "420px");
  fixture.style.setProperty("--note-natural-height", "594px");
  fixture.style.width = "420px";
  fixture.style.height = "594px";
  fixture.style.position = "fixed";
  fixture.style.left = "-10000px";
  fixture.style.top = "0";
  fixture.style.background = "#fff";
  fixture.style.color = "#15242b";
  fixture.style.fontFamily = "Arial, sans-serif";
  fixture.innerHTML = `
    <div style="padding:28px">
      <div style="height:26px;background:#0e6b70;color:#fff;font-weight:700;padding:7px 10px">MEDNOTE PDF SELF TEST</div>
      <h2 style="margin:24px 0 10px;font-size:22px">Sheet test</h2>
      <p style="font-size:15px;line-height:1.5">Nếu nội dung này được rasterize và nhúng vào PDF, bộ xuất PDF hoạt động.</p>
      <div style="margin-top:24px;width:120px;height:120px;border-radius:60px;background:#c7d8eb"></div>
    </div>`;
  document.body.append(fixture);

  try {
    const pdf = await createPdfDocument();
    await appendPaperToPdf(pdf, fixture, 1);
    const bytes = await saveVerifiedPdf(pdf);
    return {
      ok: true,
      bytes: bytes.length,
      header: new TextDecoder().decode(bytes.slice(0, 5)),
      pages: pdf.getPageCount(),
    };
  } finally {
    fixture.remove();
  }
}
