const STYLE_ID = "mednote-pdf-export-scope-overlay-style";
const LAYER_CLASS = "mednote-pdf-export-scope-layer";
const FLOATING_CLASS = "mednote-pdf-export-scope-floating";
const MANUAL_LINK_ATTR = "mednotePdfManual";
let suppressExportButtonClick = false;
let statusTimer = 0;

const style = `
.${LAYER_CLASS}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:76px 12px 24px;background:rgba(18,31,39,.30);backdrop-filter:blur(1.5px)}
.${LAYER_CLASS} .${FLOATING_CLASS}{position:relative!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:min(360px,calc(100vw - 24px))!important;max-height:calc(100dvh - 100px);overflow:auto!important;margin:0!important;padding:7px!important;border:1px solid #d6dfe2!important;border-radius:12px!important;background:#fff!important;box-shadow:0 18px 55px rgba(17,35,45,.28)!important}
.${LAYER_CLASS} .note-pdf-export-menu-title{padding:8px 9px!important;font-size:11px!important;color:#6d7b82!important}
.${LAYER_CLASS} .${FLOATING_CLASS}>button{min-height:50px!important;padding:9px 11px!important;border-radius:8px!important}
.${LAYER_CLASS} .${FLOATING_CLASS}>button+button{margin-top:2px!important}
.${LAYER_CLASS} .${FLOATING_CLASS} strong{font-size:13px!important}
.${LAYER_CLASS} .${FLOATING_CLASS} small{font-size:10px!important}
.mednote-pdf-status{padding:14px 13px 12px}
.mednote-pdf-status strong{display:block;color:#263238;font-size:15px!important}
.mednote-pdf-status small{display:block;margin-top:5px;color:#6d7b82;font-size:11px!important;line-height:1.45}
.mednote-pdf-status-progress{height:4px;margin-top:14px;overflow:hidden;border-radius:999px;background:#e6ebed}
.mednote-pdf-status-progress>i{display:block;width:0;height:100%;border-radius:inherit;background:#0e6b70;transition:width .18s ease}
.mednote-pdf-ready-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.mednote-pdf-ready-actions a{min-height:42px;display:flex;align-items:center;justify-content:center;padding:8px 10px;border:1px solid #cfdadd;border-radius:8px;background:#fff;color:#40525b;font-size:12px;font-weight:700;text-decoration:none}
.mednote-pdf-ready-actions a.primary{border-color:#0e6b70;background:#0e6b70;color:#fff}
.mednote-pdf-ready-actions a:active{transform:translateY(1px)}
.mednote-pdf-ready-name{margin-top:8px;overflow:hidden;color:#7b878d;font-size:10px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.mednote-pdf-ready-close{width:100%;height:38px;margin-top:9px;border:1px solid #d6dfe2;border-radius:8px;background:#fff;color:#5c6a70;font-size:11px;font-weight:650;cursor:pointer}
@media(max-width:650px){.${LAYER_CLASS}{padding:64px 10px 18px}.${LAYER_CLASS} .${FLOATING_CLASS}{width:100%!important;max-height:calc(100dvh - 82px)}.mednote-pdf-ready-actions{grid-template-columns:1fr}.mednote-pdf-ready-actions a{min-height:46px}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function stopStatusTimer() {
  if (!statusTimer) return;
  window.clearInterval(statusTimer);
  statusTimer = 0;
}

function removeLayer() {
  stopStatusTimer();
  document.querySelectorAll<HTMLElement>(`.${LAYER_CLASS}`).forEach((layer) => layer.remove());
}

function closeOriginalMenu() {
  const button = document.querySelector<HTMLButtonElement>(".note-pdf-export-button[aria-expanded='true']");
  if (!button) return;
  suppressExportButtonClick = true;
  button.click();
}

function createLayer() {
  removeLayer();
  const layer = document.createElement("div");
  layer.className = LAYER_CLASS;
  const panel = document.createElement("div");
  panel.className = FLOATING_CLASS;
  layer.append(panel);
  document.body.append(layer);
  return { layer, panel };
}

function showMessage(titleText: string, detailText: string, closeMenu = false) {
  const { layer, panel } = createLayer();
  const body = document.createElement("div");
  body.className = "mednote-pdf-status";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const detail = document.createElement("small");
  detail.textContent = detailText;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mednote-pdf-ready-close";
  close.textContent = "Đóng";
  close.addEventListener("click", () => {
    layer.remove();
    if (closeMenu) closeOriginalMenu();
  });
  body.append(title, detail, close);
  panel.append(body);
  layer.addEventListener("click", (event) => {
    if (event.target !== layer) return;
    layer.remove();
    if (closeMenu) closeOriginalMenu();
  });
}

function showFailure() {
  showMessage("Không mở được lựa chọn Xuất PDF", "Hãy tải lại trang một lần. Nếu vẫn còn lỗi, module xuất PDF sẽ cần được kiểm tra tiếp.", true);
}

function showGenerating(label = "") {
  const { layer, panel } = createLayer();
  layer.dataset.pdfState = "generating";
  const body = document.createElement("div");
  body.className = "mednote-pdf-status";
  const title = document.createElement("strong");
  title.textContent = "Đang tạo PDF…";
  const detail = document.createElement("small");
  detail.dataset.pdfProgressDetail = "1";
  detail.textContent = label ? `Đang chuẩn bị ${label}…` : "Đang chuẩn bị các Sheet…";
  const progress = document.createElement("div");
  progress.className = "mednote-pdf-status-progress";
  const bar = document.createElement("i");
  bar.dataset.pdfProgressBar = "1";
  progress.append(bar);
  body.append(title, detail, progress);
  panel.append(body);

  statusTimer = window.setInterval(() => {
    if (!document.body.contains(layer)) stopStatusTimer();
  }, 500);
}

function showPdfReady(href: string, fileName: string) {
  const { layer, panel } = createLayer();
  layer.dataset.pdfState = "ready";
  const body = document.createElement("div");
  body.className = "mednote-pdf-status";
  const title = document.createElement("strong");
  title.textContent = "PDF đã tạo xong";
  const detail = document.createElement("small");
  detail.textContent = "Chọn Tải PDF để lưu file. Nếu trình duyệt không tải trực tiếp, chọn Mở PDF rồi lưu từ trình xem PDF.";
  const name = document.createElement("div");
  name.className = "mednote-pdf-ready-name";
  name.textContent = fileName;

  const actions = document.createElement("div");
  actions.className = "mednote-pdf-ready-actions";
  const download = document.createElement("a");
  download.href = href;
  download.download = fileName;
  download.className = "primary";
  download.dataset[MANUAL_LINK_ATTR] = "1";
  download.textContent = "Tải PDF";
  const open = document.createElement("a");
  open.href = href;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.dataset[MANUAL_LINK_ATTR] = "1";
  open.textContent = "Mở PDF";
  actions.append(download, open);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mednote-pdf-ready-close";
  close.textContent = "Đóng";
  close.addEventListener("click", () => layer.remove());
  body.append(title, detail, name, actions, close);
  panel.append(body);
  layer.addEventListener("click", (event) => { if (event.target === layer) layer.remove(); });
}

function mirrorOriginalMenu(original: HTMLElement) {
  removeLayer();
  const layer = document.createElement("div");
  layer.className = LAYER_CLASS;
  layer.setAttribute("role", "presentation");
  const floating = original.cloneNode(true) as HTMLElement;
  floating.classList.add(FLOATING_CLASS);
  floating.style.removeProperty("display");
  floating.style.removeProperty("visibility");
  floating.style.removeProperty("opacity");

  const sourceButtons = Array.from(original.querySelectorAll<HTMLButtonElement>(":scope > button"));
  const floatingButtons = Array.from(floating.querySelectorAll<HTMLButtonElement>(":scope > button"));
  floatingButtons.forEach((button, index) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = sourceButtons[index];
      const label = button.querySelector("strong")?.textContent?.trim() || button.textContent?.trim() || "PDF";
      layer.remove();
      source?.click();
      window.setTimeout(() => showGenerating(label), 0);
    });
  });

  layer.addEventListener("click", (event) => {
    if (event.target !== layer) return;
    layer.remove();
    closeOriginalMenu();
  });
  layer.append(floating);
  document.body.append(layer);
  original.style.setProperty("visibility", "hidden", "important");
}

function revealMenu(attempt = 0) {
  const original = document.querySelector<HTMLElement>(".note-pdf-export-wrap .note-pdf-export-menu");
  if (original) {
    mirrorOriginalMenu(original);
    return;
  }
  if (attempt < 12) {
    window.setTimeout(() => revealMenu(attempt + 1), attempt < 3 ? 16 : 35);
    return;
  }
  const expanded = document.querySelector(".note-pdf-export-button[aria-expanded='true']");
  if (expanded) showFailure();
}

function handleExportButtonClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>(".note-pdf-export-button");
  if (!button || button.disabled) return;
  if (suppressExportButtonClick) {
    suppressExportButtonClick = false;
    return;
  }
  window.setTimeout(() => revealMenu(), 0);
}

function handleGeneratedPdfClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href^='blob:'][download]");
  if (!link || link.dataset[MANUAL_LINK_ATTR] === "1") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showPdfReady(link.href, link.download || "MedNote.pdf");
}

function handleProgress(event: Event) {
  const detail = (event as CustomEvent<{ page?: number; total?: number; phase?: string }>).detail || {};
  const layer = document.querySelector<HTMLElement>(`.${LAYER_CLASS}[data-pdf-state='generating']`);
  if (!layer) return;
  const text = layer.querySelector<HTMLElement>("[data-pdf-progress-detail='1']");
  const bar = layer.querySelector<HTMLElement>("[data-pdf-progress-bar='1']");
  const page = Math.max(0, Number(detail.page) || 0);
  const total = Math.max(1, Number(detail.total) || 1);
  if (text) text.textContent = detail.phase === "save" ? "Đang ghép và lưu PDF…" : `Đang dựng Sheet ${page}/${total}…`;
  if (bar) bar.style.width = `${detail.phase === "save" ? 96 : Math.min(92, Math.max(6, (page - 0.35) / total * 92))}%`;
}

function handleExportError(event: Event) {
  const detail = (event as CustomEvent<{ message?: string }>).detail;
  showMessage("Xuất PDF thất bại", detail?.message || "Không thể tạo PDF trên thiết bị này.");
}

function handleKey(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const layer = document.querySelector<HTMLElement>(`.${LAYER_CLASS}`);
  if (!layer) return;
  layer.remove();
  closeOriginalMenu();
}

injectStyle();
document.addEventListener("click", handleGeneratedPdfClick, true);
document.addEventListener("click", handleExportButtonClick, true);
document.addEventListener("keydown", handleKey, true);
document.addEventListener("mednote:pdf-export-progress", handleProgress as EventListener);
document.addEventListener("mednote:pdf-export-error", handleExportError as EventListener);

export {};
