const BUTTON_CLASS = "mednote-pdf-search-button";
const STYLE_ID = "mednote-pdf-search-toolbar-style";

const style = `
.${BUTTON_CLASS}{gap:5px!important}
.${BUTTON_CLASS} svg{width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:720px){.${BUTTON_CLASS} span{display:none!important}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function openPdfSearch() {
  const reveal = document.querySelector<HTMLButtonElement>(
    '.reader-pane .pdf-toolbar button[aria-label="Hiện bảng điều hướng"]',
  );
  reveal?.click();

  const activate = () => {
    const searchTab = document.querySelector<HTMLButtonElement>(
      '.pdf-thumbnails .pdf-rail-tabs button[aria-label="Tìm kiếm"]',
    );
    searchTab?.click();
    window.setTimeout(() => {
      document.getElementById("pdf-search-input")?.focus();
    }, 0);
  };

  requestAnimationFrame(() => requestAnimationFrame(activate));
}

function ensureSearchButton(toolbar: HTMLElement) {
  const primary = toolbar.querySelector<HTMLElement>(":scope > .toolbar-row-primary");
  if (!primary || primary.querySelector(`.${BUTTON_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `pdf-toolbar-button ${BUTTON_CLASS}`;
  button.title = "Tìm trong PDF (Ctrl+F)";
  button.setAttribute("aria-label", "Tìm trong PDF");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><span>Tìm</span>';
  button.addEventListener("click", openPdfSearch);

  const divider = primary.querySelector<HTMLElement>(":scope > .toolbar-divider");
  if (divider) primary.insertBefore(button, divider);
  else primary.append(button);
}

function mount() {
  document.querySelectorAll<HTMLElement>(".reader-pane .pdf-toolbar").forEach(ensureSearchButton);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    mount();
  });
}

injectStyle();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 1200);

export {};
