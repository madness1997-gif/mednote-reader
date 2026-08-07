const STYLE_ID = "mednote-page-sheet-sidebar-functional-only-style";
const NAV_CLASS = "mednote-page-sheet-nav";
const SEARCH_BUTTON_CLASS = "mps-sidebar-search-button";
const SEARCH_CLOSE_CLASS = "mps-sidebar-search-close";

const FUNCTIONAL_BUTTON_SELECTORS = [
  "[data-new-notebook]",
  "[data-add-section]",
  "[data-add-page]",
  "[data-open-page]",
  "[data-open-sheet]",
  "[data-sidebar-more]",
  "[data-rename-section]",
  "[data-delete-section]",
  "[data-link-page]",
  "[data-link-sheet]",
  "[data-rename-page]",
  "[data-delete-page]",
  "[data-delete-sheet]",
  "[data-sheet-up]",
  "[data-sheet-down]",
  "[data-move-page]",
  "[data-note-navigation-close]",
  "[data-sidebar-mode-button]",
  "[data-search-open-kind][data-search-open-value]",
].join(",");

const style = `
/* Keep the OneNote-like Notebook -> Section -> Page hierarchy. Search is the
   only utility control kept because it has a real, complete interaction. */
.${NAV_CLASS}{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:42px minmax(0,1fr)!important}
.${NAV_CLASS}>.mps-onenote-rail{display:none!important}
.${NAV_CLASS} .mps-bookbar{grid-column:1!important;grid-row:1!important}
.${NAV_CLASS} .mps-layout{grid-column:1!important;grid-row:2!important;display:grid!important}
.${NAV_CLASS}[data-sidebar-mode="search"] .mps-layout{display:none!important}
.${NAV_CLASS}[data-sidebar-mode="recent"] .mps-layout{display:grid!important}
.${NAV_CLASS}>.mps-sidebar-utility{grid-column:1!important;grid-row:2!important}
.${NAV_CLASS}[data-sidebar-mode="navigation"]>.mps-sidebar-utility,
.${NAV_CLASS}[data-sidebar-mode="recent"]>.mps-sidebar-utility{display:none!important}
.${NAV_CLASS}[data-sidebar-mode="search"]>.mps-sidebar-utility{display:flex!important}
.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(315px,28vw,390px)!important}

.${NAV_CLASS} .${SEARCH_BUTTON_CLASS}{flex:0 0 30px!important;width:30px!important;height:30px!important;display:grid!important;place-items:center!important;border:0!important;border-radius:7px!important;background:transparent!important;color:#5f6368!important;font-size:17px!important;cursor:pointer!important}
.${NAV_CLASS} .${SEARCH_BUTTON_CLASS}:hover{background:#eeeeef!important;color:#333!important}
.${NAV_CLASS}[data-sidebar-mode="search"] .${SEARCH_BUTTON_CLASS}{background:#eee7f3!important;color:#6f238f!important}
.${NAV_CLASS} .${SEARCH_CLOSE_CLASS}{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#666;font-size:18px;cursor:pointer}
.${NAV_CLASS} .${SEARCH_CLOSE_CLASS}:hover{background:#ececee;color:#222}

/* Names are the main UI. Actions remain behind one real ellipsis menu. */
.${NAV_CLASS} .mps-page-tools,
.${NAV_CLASS} .mps-sheet-tools,
.${NAV_CLASS} .mps-section-actions{max-width:min(230px,calc(100vw - 24px))}
.${NAV_CLASS} button[disabled]{display:none!important}

@media(max-width:900px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:310px!important}}
@media(max-width:650px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:275px!important}}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function ensureSearchButton(nav: HTMLElement) {
  const bookbar = nav.querySelector<HTMLElement>(":scope > .mps-bookbar");
  if (!bookbar || bookbar.querySelector(`.${SEARCH_BUTTON_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mps-icon ${SEARCH_BUTTON_CLASS}`;
  button.dataset.sidebarModeButton = "search";
  button.title = "Tìm kiếm ghi chú";
  button.setAttribute("aria-label", "Tìm kiếm ghi chú");
  button.setAttribute("aria-pressed", "false");
  button.textContent = "⌕";
  const close = bookbar.querySelector<HTMLElement>("[data-note-navigation-close]");
  if (close) bookbar.insertBefore(button, close); else bookbar.append(button);
}

function ensureSearchClose(nav: HTMLElement) {
  if (nav.dataset.sidebarMode !== "search") return;
  const head = nav.querySelector<HTMLElement>(":scope > .mps-sidebar-utility .mps-utility-head");
  if (!head || head.querySelector(`.${SEARCH_CLOSE_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = SEARCH_CLOSE_CLASS;
  button.dataset.sidebarModeButton = "navigation";
  button.title = "Đóng tìm kiếm";
  button.setAttribute("aria-label", "Đóng tìm kiếm");
  button.textContent = "×";
  head.append(button);
}

function removeUnavailableActions(nav: HTMLElement) {
  const sectionCount = nav.querySelectorAll(".mps-section[data-open-section]").length;
  nav.querySelectorAll<HTMLElement>("[data-move-page]").forEach((button) => {
    if (sectionCount <= 1) button.remove();
  });

  nav.querySelectorAll<HTMLElement>(".mps-sheets").forEach((group) => {
    const sheets = Array.from(group.querySelectorAll<HTMLElement>(":scope > .mps-sheet"));
    sheets.forEach((sheet, index) => {
      if (index === 0) sheet.querySelector<HTMLElement>("[data-sheet-up]")?.remove();
      if (index === sheets.length - 1) sheet.querySelector<HTMLElement>("[data-sheet-down]")?.remove();
    });
  });
}

function removeFakeButtons(nav: HTMLElement) {
  nav.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (!button.matches(FUNCTIONAL_BUTTON_SELECTORS)) button.remove();
  });
}

function cleanNavigator(nav: HTMLElement) {
  if (nav.dataset.sidebarMode !== "search") nav.dataset.sidebarMode = "navigation";
  nav.querySelector<HTMLElement>(":scope > .mps-onenote-rail")?.remove();
  if (nav.dataset.sidebarMode === "navigation") nav.querySelector<HTMLElement>(":scope > .mps-sidebar-utility")?.remove();
  ensureSearchButton(nav);
  ensureSearchClose(nav);
  removeUnavailableActions(nav);
  removeFakeButtons(nav);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(`.${NAV_CLASS}`).forEach(cleanNavigator);
  });
}

injectStyle();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 900);

export {};
