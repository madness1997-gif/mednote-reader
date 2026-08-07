const STYLE_ID = "mednote-pdf-export-scope-overlay-style";
const LAYER_CLASS = "mednote-pdf-export-scope-layer";
const FLOATING_CLASS = "mednote-pdf-export-scope-floating";
let suppressExportButtonClick = false;

const style = `
.${LAYER_CLASS}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:76px 12px 24px;background:rgba(18,31,39,.30);backdrop-filter:blur(1.5px)}
.${LAYER_CLASS} .${FLOATING_CLASS}{position:relative!important;inset:auto!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;width:min(360px,calc(100vw - 24px))!important;max-height:calc(100dvh - 100px);overflow:auto!important;margin:0!important;padding:7px!important;border:1px solid #d6dfe2!important;border-radius:12px!important;background:#fff!important;box-shadow:0 18px 55px rgba(17,35,45,.28)!important}
.${LAYER_CLASS} .note-pdf-export-menu-title{padding:8px 9px!important;font-size:11px!important;color:#6d7b82!important}
.${LAYER_CLASS} .${FLOATING_CLASS}>button{min-height:50px!important;padding:9px 11px!important;border-radius:8px!important}
.${LAYER_CLASS} .${FLOATING_CLASS}>button+button{margin-top:2px!important}
.${LAYER_CLASS} .${FLOATING_CLASS} strong{font-size:13px!important}
.${LAYER_CLASS} .${FLOATING_CLASS} small{font-size:10px!important}
@media(max-width:650px){.${LAYER_CLASS}{padding:64px 10px 18px}.${LAYER_CLASS} .${FLOATING_CLASS}{width:100%!important;max-height:calc(100dvh - 82px)}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function removeLayer() {
  document.querySelectorAll<HTMLElement>(`.${LAYER_CLASS}`).forEach((layer) => layer.remove());
}

function closeOriginalMenu() {
  const button = document.querySelector<HTMLButtonElement>(".note-pdf-export-button[aria-expanded='true']");
  if (!button) return;
  suppressExportButtonClick = true;
  button.click();
}

function showFailure() {
  removeLayer();
  const layer = document.createElement("div");
  layer.className = LAYER_CLASS;
  const panel = document.createElement("div");
  panel.className = FLOATING_CLASS;
  panel.innerHTML = `<div style="padding:12px"><strong style="display:block;margin-bottom:5px">Không mở được lựa chọn Xuất PDF</strong><small style="display:block;color:#6d7b82;line-height:1.45">Hãy tải lại trang một lần. Nếu vẫn còn lỗi, module xuất PDF sẽ cần được kiểm tra tiếp.</small><button type="button" style="margin-top:12px;width:100%;height:38px;border:1px solid #d6dfe2;border-radius:8px;background:#fff">Đóng</button></div>`;
  panel.querySelector("button")?.addEventListener("click", () => {
    layer.remove();
    closeOriginalMenu();
  });
  layer.addEventListener("click", (event) => {
    if (event.target !== layer) return;
    layer.remove();
    closeOriginalMenu();
  });
  layer.append(panel);
  document.body.append(layer);
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
      layer.remove();
      source?.click();
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

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>(".note-pdf-export-button");
  if (!button || button.disabled) return;
  if (suppressExportButtonClick) {
    suppressExportButtonClick = false;
    return;
  }
  window.setTimeout(() => revealMenu(), 0);
}

function handleKey(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const layer = document.querySelector<HTMLElement>(`.${LAYER_CLASS}`);
  if (!layer) return;
  layer.remove();
  closeOriginalMenu();
}

injectStyle();
document.addEventListener("click", handleClick, true);
document.addEventListener("keydown", handleKey, true);

export {};
