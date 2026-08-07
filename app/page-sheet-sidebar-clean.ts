const STYLE_ID = "mednote-page-sheet-sidebar-clean-style";
const NAV_CLASS = "mednote-page-sheet-nav";
const MORE_CLASS = "mps-sidebar-more";
const OPEN_CLASS = "mps-tools-open";

const style = `
/* The Page→Tờ navigator is the single source of truth. Never stack the legacy navigator under it. */
.note-thumbnails:has(> .${NAV_CLASS}) > .onenote-note-navigation,
.note-thumbnails:has(> .${NAV_CLASS}) > .notes-heading,
.note-thumbnails:has(> .${NAV_CLASS}) > .note-thumb-wrap,
.note-thumbnails:has(> .${NAV_CLASS}) > .new-page{display:none!important;visibility:hidden!important;pointer-events:none!important}
.note-thumbnails:has(> .${NAV_CLASS}) > .${NAV_CLASS}{display:flex!important;visibility:visible!important;opacity:1!important}

.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(205px,22vw,260px)!important}
.note-thumbnails.onenote-navigation-active:has(> .${NAV_CLASS}){width:100%!important;min-width:0!important;max-width:none!important;resize:none!important;background:#f8f9fa!important;border-left:1px solid #e2e5e7!important}
.${NAV_CLASS}{background:#f8f9fa!important;color:#263238!important}
.${NAV_CLASS} .mps-bookbar{height:42px!important;gap:4px!important;padding:5px 7px!important;background:#fff!important;border-bottom:1px solid #e5e8ea!important}
.${NAV_CLASS} .mps-book-icon{display:none!important}
.${NAV_CLASS} .mps-book-select{height:30px!important;padding:0 6px!important;font-size:12px!important;color:#263238!important}
.${NAV_CLASS} .mps-icon{width:28px!important;height:28px!important;color:#5f6368!important}

/* One vertical hierarchy instead of two cramped side-by-side columns. */
.${NAV_CLASS} .mps-layout{display:flex!important;flex-direction:column!important;min-height:0!important;background:#f8f9fa!important}
.${NAV_CLASS} .mps-sections{flex:0 0 auto!important;min-width:0!important;max-height:104px!important;border-right:0!important;border-bottom:1px solid #e5e8ea!important;background:#fff!important}
.${NAV_CLASS} .mps-sections>.mps-pane-head{min-height:32px!important;padding:3px 7px!important;border-bottom:0!important;background:#fff!important}
.${NAV_CLASS} .mps-sections>.mps-pane-head strong{font-size:10px!important;text-transform:uppercase!important;letter-spacing:.04em!important;color:#7b858b!important}
.${NAV_CLASS} .mps-add{height:26px!important;padding:0 6px!important;border-radius:6px!important;color:#6d3b8f!important;font-size:11px!important}
.${NAV_CLASS} .mps-section-list{display:flex!important;gap:5px!important;flex:0 0 auto!important;overflow-x:auto!important;overflow-y:visible!important;padding:2px 7px 7px!important;scrollbar-width:none!important}
.${NAV_CLASS} .mps-section-list::-webkit-scrollbar{display:none!important}
.${NAV_CLASS} .mps-section{position:relative!important;flex:0 0 auto!important;width:auto!important;max-width:132px!important;min-height:30px!important;align-items:center!important;border:1px solid #e2e6e8!important;border-radius:8px!important;background:#f7f8f9!important;overflow:visible!important}
.${NAV_CLASS} .mps-section::before{width:3px!important;align-self:stretch!important;border-radius:7px 0 0 7px!important}
.${NAV_CLASS} .mps-section-copy{display:block!important;padding:6px 7px 6px 6px!important}
.${NAV_CLASS} .mps-section-copy strong{display:block!important;max-width:94px!important;font-size:10px!important;font-weight:600!important}
.${NAV_CLASS} .mps-section-copy small{display:none!important}
.${NAV_CLASS} .mps-section.active{border-color:#c9b5d8!important;background:#f3edf7!important;box-shadow:0 0 0 1px #eadff1 inset!important}
.${NAV_CLASS} .mps-section:hover{background:#f0f2f3!important}

.${NAV_CLASS} .mps-pages{min-height:0!important;flex:1 1 auto!important;background:#f8f9fa!important}
.${NAV_CLASS} .mps-pages>.mps-pane-head{min-height:34px!important;padding:4px 8px!important;border-top:0!important;border-bottom:1px solid #e7eaec!important;background:#fff!important}
.${NAV_CLASS} .mps-pages>.mps-pane-head strong{font-size:11px!important;color:#4b555a!important}
.${NAV_CLASS} .mps-page-list{padding:6px!important;background:#f8f9fa!important}
.${NAV_CLASS} .mps-page-card{position:relative!important;margin-bottom:5px!important;border:1px solid #e3e7e9!important;border-radius:9px!important;background:#fff!important;overflow:visible!important}
.${NAV_CLASS} .mps-page-card.active{border-color:#d6c6e1!important;background:#faf7fc!important;box-shadow:0 0 0 1px #eee4f4 inset!important}
.${NAV_CLASS} .mps-page-head{min-height:38px!important;padding-right:3px!important}
.${NAV_CLASS} .mps-page-open{padding:7px 7px 7px 9px!important}
.${NAV_CLASS} .mps-page-open strong{font-size:11px!important;font-weight:650!important;color:#2f383d!important}
.${NAV_CLASS} .mps-page-open small{margin-top:1px!important;font-size:9px!important;color:#92999d!important}

.${NAV_CLASS} .mps-sheets{margin:0 6px 6px 13px!important;padding:2px 0 2px 7px!important;border-left:1px solid #d9cde1!important;background:transparent!important}
.${NAV_CLASS} .mps-sheet{position:relative!important;min-height:28px!important;border-top:0!important;border-radius:6px!important}
.${NAV_CLASS} .mps-sheet+.mps-sheet{margin-top:2px!important}
.${NAV_CLASS} .mps-sheet.active{background:#eee6f3!important}
.${NAV_CLASS} .mps-sheet-open{padding:6px 7px!important;font-size:10px!important;color:#596268!important}
.${NAV_CLASS} .mps-sheet.active .mps-sheet-open{color:#5d2b79!important}

/* Hide the icon swarm. A single more button opens the same original actions on demand. */
.${NAV_CLASS} .mps-page-tools,
.${NAV_CLASS} .mps-sheet-tools,
.${NAV_CLASS} .mps-section-actions{display:none!important;position:absolute!important;z-index:30!important;gap:2px!important;padding:3px!important;border:1px solid #dfe4e6!important;border-radius:8px!important;background:#fff!important;box-shadow:0 7px 22px #24323a26!important}
.${NAV_CLASS} .mps-page-card.${OPEN_CLASS} .mps-page-tools{display:flex!important;top:34px!important;right:4px!important}
.${NAV_CLASS} .mps-sheet.${OPEN_CLASS} .mps-sheet-tools{display:flex!important;top:25px!important;right:2px!important}
.${NAV_CLASS} .mps-section.${OPEN_CLASS} .mps-section-actions{display:flex!important;top:28px!important;right:2px!important}
.${NAV_CLASS} .mps-mini{width:25px!important;height:25px!important;border-radius:6px!important;font-size:11px!important}
.${NAV_CLASS} .${MORE_CLASS}{flex:0 0 auto;width:26px;height:26px;margin-right:3px;border:0;border-radius:6px;background:transparent;color:#727b80;font-size:16px;line-height:1;cursor:pointer}
.${NAV_CLASS} .${MORE_CLASS}:hover,.${NAV_CLASS} .${MORE_CLASS}:focus-visible{background:#eceff1;color:#343a3e;outline:none}
.${NAV_CLASS} .mps-section>.${MORE_CLASS}{width:22px;height:24px;margin-right:2px;font-size:14px}
.${NAV_CLASS} .mps-sheet>.${MORE_CLASS}{width:22px;height:23px;margin-right:1px;font-size:14px}

@media(max-width:900px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:220px!important}}
@media(max-width:650px){
  .workspace.onenote-right-navigation-layout{--onenote-nav-width:190px!important}
  .${NAV_CLASS} .mps-section{max-width:112px!important}
  .${NAV_CLASS} .mps-section-copy strong{max-width:78px!important}
  .${NAV_CLASS} .mps-page-list{padding:5px!important}
  .${NAV_CLASS} .mps-page-open strong{font-size:10.5px!important}
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function trimMetadata(nav: HTMLElement) {
  nav.querySelectorAll<HTMLElement>(".mps-page-open small").forEach((small) => {
    const first = (small.textContent || "").split("·")[0]?.trim();
    if (first && small.textContent !== first) small.textContent = first;
  });
  nav.querySelectorAll<HTMLButtonElement>(".mps-sheet-open").forEach((button) => {
    const first = (button.textContent || "").split("·")[0]?.trim();
    if (first && button.textContent !== first) button.textContent = first;
  });
}

function addMoreButton(owner: HTMLElement, toolsSelector: string) {
  if (owner.querySelector(`:scope > .${MORE_CLASS}`) || owner.querySelector(`:scope > .mps-page-head > .${MORE_CLASS}`)) return;
  const tools = owner.querySelector<HTMLElement>(toolsSelector);
  if (!tools) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = MORE_CLASS;
  button.dataset.sidebarMore = "1";
  button.setAttribute("aria-label", "Thêm thao tác");
  button.title = "Thêm thao tác";
  button.textContent = "⋯";
  if (owner.matches(".mps-page-card")) owner.querySelector(":scope > .mps-page-head")?.insertBefore(button, tools);
  else owner.insertBefore(button, tools);
}

function prepareNavigator(nav: HTMLElement) {
  nav.dataset.cleanSidebar = "1";
  const aside = nav.parentElement;
  if (aside?.classList.contains("note-thumbnails")) {
    const legacy = aside.querySelector<HTMLElement>(":scope > .onenote-note-navigation");
    if (legacy) {
      legacy.style.setProperty("display", "none", "important");
      legacy.style.setProperty("visibility", "hidden", "important");
      legacy.style.setProperty("pointer-events", "none", "important");
      legacy.setAttribute("aria-hidden", "true");
    }
  }
  trimMetadata(nav);
  nav.querySelectorAll<HTMLElement>(".mps-page-card").forEach((owner) => addMoreButton(owner, ":scope > .mps-page-head > .mps-page-tools"));
  nav.querySelectorAll<HTMLElement>(".mps-sheet").forEach((owner) => addMoreButton(owner, ":scope > .mps-sheet-tools"));
  nav.querySelectorAll<HTMLElement>(".mps-section").forEach((owner) => addMoreButton(owner, ":scope > .mps-section-actions"));
}

function closeOthers(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>(`.${NAV_CLASS} .${OPEN_CLASS}`).forEach((owner) => {
    if (owner !== except) owner.classList.remove(OPEN_CLASS);
  });
}

function handleWindowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const more = target?.closest<HTMLButtonElement>(`.${NAV_CLASS} .${MORE_CLASS}[data-sidebar-more]`);
  if (more) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const owner = more.closest<HTMLElement>(".mps-page-card,.mps-sheet,.mps-section");
    if (!owner) return;
    const opening = !owner.classList.contains(OPEN_CLASS);
    closeOthers(owner);
    owner.classList.toggle(OPEN_CLASS, opening);
    return;
  }
  if (!target?.closest(`.${NAV_CLASS} .mps-page-tools,.${NAV_CLASS} .mps-sheet-tools,.${NAV_CLASS} .mps-section-actions`)) closeOthers();
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(`.${NAV_CLASS}`).forEach(prepareNavigator);
  });
}

injectStyle();
window.addEventListener("click", handleWindowClick, true);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();

export {};
