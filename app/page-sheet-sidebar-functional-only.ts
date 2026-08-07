const STYLE_ID = "mednote-page-sheet-sidebar-functional-only-style";
const NAV_CLASS = "mednote-page-sheet-nav";

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
].join(",");

const style = `
/* Keep the OneNote-like Notebook -> Section -> Page hierarchy, but do not show
   placeholder navigation/search/recent controls. Every visible button must do something. */
.${NAV_CLASS}{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:42px minmax(0,1fr)!important}
.${NAV_CLASS}>.mps-onenote-rail,.${NAV_CLASS}>.mps-sidebar-utility{display:none!important}
.${NAV_CLASS} .mps-bookbar{grid-column:1!important;grid-row:1!important}
.${NAV_CLASS} .mps-layout{grid-column:1!important;grid-row:2!important;display:grid!important}
.${NAV_CLASS}[data-sidebar-mode="search"] .mps-layout,
.${NAV_CLASS}[data-sidebar-mode="recent"] .mps-layout{display:grid!important}
.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(315px,28vw,390px)!important}

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
  nav.dataset.sidebarMode = "navigation";
  nav.querySelector<HTMLElement>(":scope > .mps-onenote-rail")?.remove();
  nav.querySelector<HTMLElement>(":scope > .mps-sidebar-utility")?.remove();
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
