import type { PDFDocument } from "pdf-lib";

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
const CAPTURE_TIMEOUT_MS = 30_000;
const PDF_SAVE_TIMEOUT_MS = 15_000;
const JPEG_TIMEOUT_MS = 10_000;
const MOBILE_CAPTURE_SCALE = 2;
const DESKTOP_CAPTURE_SCALE = 2.5;
const MOBILE_MAX_CAPTURE_PIXELS = 6_000_000;
const DESKTOP_MAX_CAPTURE_PIXELS = 12_000_000;
const CAPTURE_HOST_CLASS = "note-pdf-capture-host";
const CAPTURE_HOST_Z_INDEX = 2_147_482_999;
const RICH_TEXT_SELECTOR = ".fa-rich-editor,.excerpt-rich-editor,.rich-text-editor";
const PDF_INLINE_BACKGROUND_LAYER = "data-pdf-inline-background-layer";

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

async function settleCaptureAssets(source: HTMLElement) {
  const fonts = document.fonts?.ready;
  if (fonts) await Promise.race([fonts, delay(2500)]).catch(() => undefined);
  const images = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  await Promise.allSettled(images.map(async (image) => {
    if (image.complete) {
      await image.decode?.().catch(() => undefined);
      return;
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
      delay(2500),
    ]);
  }));
  await settleLayout();
}

function colorIsTransparent(value: string) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (normalized === "transparent") return true;
  const rgba = normalized.match(/^rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)$/);
  if (rgba) return Number(rgba[1]) === 0;
  const modernAlpha = normalized.match(/\/([\d.]+)(%)?\)$/);
  return Boolean(modernAlpha && Number(modernAlpha[1]) === 0);
}

/**
 * html2canvas paints an inline element's background from its union bounding
 * box. When a highlighted span wraps, that rectangle can cover text siblings
 * on the next line even though Chromium paints one background fragment per
 * line. Materialize those browser line fragments as ordinary positioned boxes
 * before html2canvas performs its own document clone.
 */
export function materializePdfInlineBackgrounds(source: HTMLElement) {
  let fragmentCount = 0;
  source.querySelectorAll<HTMLElement>(RICH_TEXT_SELECTOR).forEach((editor) => {
    if (editor.hasAttribute(PDF_INLINE_BACKGROUND_LAYER)) return;
    const editorRect = editor.getBoundingClientRect();
    if (!editorRect.width || !editorRect.height) return;

    const fragments: Array<{ left: number; top: number; width: number; height: number; color: string }> = [];
    editor.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.closest(`[${PDF_INLINE_BACKGROUND_LAYER}]`)) return;
      const style = window.getComputedStyle(element);
      if (style.display !== "inline" || colorIsTransparent(style.backgroundColor)) return;
      Array.from(element.getClientRects()).forEach((rect) => {
        if (rect.width <= 0 || rect.height <= 0) return;
        fragments.push({
          left: rect.left - editorRect.left,
          top: rect.top - editorRect.top,
          width: rect.width,
          height: rect.height,
          color: style.backgroundColor,
        });
      });
      element.style.setProperty("background-color", "transparent", "important");
      element.style.setProperty("background-image", "none", "important");
    });
    if (!fragments.length) return;

    const layer = document.createElement("span");
    layer.setAttribute(PDF_INLINE_BACKGROUND_LAYER, "1");
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.zIndex = "-1";
    layer.style.display = "block";
    layer.style.overflow = "visible";
    layer.style.pointerEvents = "none";
    editor.style.position = "relative";
    editor.style.zIndex = "0";
    editor.style.isolation = "isolate";
    fragments.forEach((fragment) => {
      const box = document.createElement("i");
      box.style.position = "absolute";
      box.style.left = `${fragment.left}px`;
      box.style.top = `${fragment.top}px`;
      box.style.width = `${fragment.width}px`;
      box.style.height = `${fragment.height}px`;
      box.style.backgroundColor = fragment.color;
      box.style.pointerEvents = "none";
      layer.append(box);
    });
    editor.prepend(layer);
    editor.setAttribute(PDF_INLINE_BACKGROUND_LAYER, "ready");
    fragmentCount += fragments.length;
  });
  return fragmentCount;
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

export function captureScaleForSize(width: number, height: number) {
  const mobile = isMobile();
  const preferredScale = mobile ? MOBILE_CAPTURE_SCALE : DESKTOP_CAPTURE_SCALE;
  const maxPixels = mobile ? MOBILE_MAX_CAPTURE_PIXELS : DESKTOP_MAX_CAPTURE_PIXELS;
  const naturalPixels = Math.max(1, width * height);
  const memorySafeScale = Math.sqrt(maxPixels / naturalPixels);
  return Math.max(1, Math.min(preferredScale, memorySafeScale));
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement) {
  const blob = await withTimeout(new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Không mã hóa được ảnh Sheet")),
      "image/jpeg",
      isMobile() ? 0.95 : 0.97,
    );
  }), JPEG_TIMEOUT_MS, "Mã hóa ảnh Sheet quá lâu");
  return new Uint8Array(await blob.arrayBuffer());
}

function copyCanvasPixels(source: HTMLElement, clone: HTMLElement) {
  const sourceCanvases = Array.from(source.querySelectorAll<HTMLCanvasElement>("canvas"));
  const clonedCanvases = Array.from(clone.querySelectorAll<HTMLCanvasElement>("canvas"));
  sourceCanvases.forEach((canvas, index) => {
    const target = clonedCanvases[index];
    if (!target) return;
    target.width = canvas.width;
    target.height = canvas.height;
    try {
      target.getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {
      // A cross-origin canvas is optional note content. html2canvas will still
      // render the remaining DOM instead of failing the whole Sheet.
    }
  });
}

function createCaptureClone(source: HTMLElement, width: number, height: number) {
  const host = document.createElement("div");
  host.className = CAPTURE_HOST_CLASS;
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.inset = "0 auto auto 0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  // Keep the capture surface inside the viewport and above the document
  // background. A negative stacking level makes Chromium/Electron paint the
  // body background over this fixed element, so html2canvas receives a blank
  // page. The export overlay sits one level above this host and hides it from
  // the user while the capture is in progress.
  host.style.zIndex = String(CAPTURE_HOST_Z_INDEX);
  host.style.background = "#fff";

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add("note-pdf-exporting");
  clone.classList.remove("interactive", "typing", "object-mode");
  // The live paper normally gets its height from aspect-ratio. Export CSS
  // disables that ratio so every capture uses exact natural pixels; persist
  // those resolved dimensions on the detached clone before moving it out of
  // the note stage's inherited sizing context.
  clone.style.setProperty("--note-natural-width", `${width}px`);
  clone.style.setProperty("--note-natural-height", `${height}px`);
  clone.querySelectorAll<HTMLElement>(CONTROL_SELECTOR).forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
  clone.querySelectorAll<HTMLElement>(".selected,.editable,.movable").forEach((element) => {
    element.classList.remove("selected", "editable", "movable");
  });
  host.append(clone);
  document.body.append(host);
  copyCanvasPixels(source, clone);
  return { clone, remove: () => host.remove() };
}

function hasMeaningfulSourceContent(source: HTMLElement) {
  const probe = source.cloneNode(true) as HTMLElement;
  probe.querySelectorAll(`${CONTROL_SELECTOR},.note-sheet-preview-loading`).forEach((element) => element.remove());
  if ((probe.textContent || "").replace(/\s+/g, "").length > 0) return true;
  return Boolean(probe.querySelector("img[src],svg path,svg line,svg polyline,svg polygon"));
}

function canvasContentCoverage(canvas: HTMLCanvasElement) {
  const sample = document.createElement("canvas");
  const maxSide = 220;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height, 1));
  sample.width = Math.max(1, Math.round(canvas.width * scale));
  sample.height = Math.max(1, Math.round(canvas.height * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let visible = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 248 || pixels[index + 1] < 248 || pixels[index + 2] < 248) visible += 1;
  }
  return visible / Math.max(1, pixels.length / 4);
}

async function capturePaper(source: HTMLElement, sheetNumber: number) {
  const { width, height } = paperNaturalSize(source);
  const scale = captureScaleForSize(width, height);
  const capture = createCaptureClone(source, width, height);
  await settleCaptureAssets(capture.clone);
  const inlineBackgroundFragments = materializePdfInlineBackgrounds(capture.clone);
  await nextFrame();

  try {
    // Chromium/Electron may expose computed First Aid theme colors as CSS
    // Color 4 values (color(), color-mix(), lab(), ...). html2canvas-pro keeps
    // the html2canvas API while parsing those modern color functions.
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await withTimeout(html2canvas(capture.clone, {
      backgroundColor: "#ffffff",
      scale,
      logging: false,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      removeContainer: true,
      imageTimeout: 7000,
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
    const contentCoverage = canvasContentCoverage(canvas);
    if (hasMeaningfulSourceContent(source) && contentCoverage < 0.0002) {
      throw new Error(`Sheet ${sheetNumber} dựng ra trang trắng; đã dừng để không tạo PDF lỗi`);
    }
    return { jpeg: await canvasToJpegBytes(canvas), width, height, scale, contentCoverage, inlineBackgroundFragments };
  } finally {
    capture.remove();
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
  const best = candidates.reduce<(typeof candidates)[number] & { score: number }>((current, candidate) => {
    const candidateRatio = candidate.widthMm / candidate.heightMm;
    const score = Math.abs(Math.log(ratio / candidateRatio)) * 100 + Math.abs(width - candidate.expectedWidth) / 120;
    return score < current.score ? { ...candidate, score } : current;
  }, { ...candidates[0], score: Number.POSITIVE_INFINITY });
  const pointsPerMm = 72 / 25.4;
  return { width: best.widthMm * pointsPerMm, height: best.heightMm * pointsPerMm };
}

export async function createPdfDocument() {
  const { PDFDocument } = await import("pdf-lib");
  return PDFDocument.create();
}

export async function appendPaperToPdf(pdf: PDFDocument, source: HTMLElement, sheetNumber: number) {
  const rendered = await capturePaper(source, sheetNumber);
  const embedded = await pdf.embedJpg(rendered.jpeg);
  const size = pdfPageSize(rendered.width, rendered.height);
  const page = pdf.addPage([size.width, size.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
  return {
    scale: rendered.scale,
    pixelWidth: Math.round(rendered.width * rendered.scale),
    pixelHeight: Math.round(rendered.height * rendered.scale),
    contentCoverage: rendered.contentCoverage,
    inlineBackgroundFragments: rendered.inlineBackgroundFragments,
  };
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
      <div style="height:26px;background:color(srgb 0.055 0.42 0.44);color:#fff;font-weight:700;padding:7px 10px;box-shadow:0 2px 4px color-mix(in srgb, #0e6b70 40%, transparent)">MEDNOTE PDF SELF TEST</div>
      <h2 style="margin:24px 0 10px;font-size:22px">Sheet test</h2>
      <p style="font-size:15px;line-height:1.5">Nếu nội dung này được rasterize và nhúng vào PDF, bộ xuất PDF hoạt động.</p>
      <div class="fa-rich-editor" style="width:220px;margin-top:14px;font-size:15px;line-height:1.4">
        4. HDL dạng đĩa đi <span style="background-color:#ffe88a;font-weight:700">gom cholesterol tự do từ mô ngoại biên hoặc từ LP khác trong máu</span>
      </div>
      <div style="margin-top:24px;width:120px;height:120px;border-radius:60%;background:#c7d8eb"></div>
    </div>`;
  document.body.append(fixture);

  try {
    const pdf = await createPdfDocument();
    const rendered = await appendPaperToPdf(pdf, fixture, 1);
    const bytes = await saveVerifiedPdf(pdf);
    return {
      ok: true,
      bytes: bytes.length,
      header: new TextDecoder().decode(bytes.slice(0, 5)),
      pages: pdf.getPageCount(),
      scale: rendered.scale,
      pixelWidth: rendered.pixelWidth,
      pixelHeight: rendered.pixelHeight,
      contentCoverage: rendered.contentCoverage,
      inlineBackgroundFragments: rendered.inlineBackgroundFragments,
    };
  } finally {
    fixture.remove();
  }
}
