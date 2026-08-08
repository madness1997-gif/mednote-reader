const STYLE_ID = "relation-note-right-layout-style";
const WORKSPACE_CLASS = "onenote-right-navigation-layout";
const NAV_SELECTOR = ":scope > .note-navigation-host > .mednote-page-sheet-nav";

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.workspace.${WORKSPACE_CLASS}{--onenote-nav-width:clamp(220px,24vw,300px)}
.workspace.${WORKSPACE_CLASS}:not(.workspace-mode-reader):not(.workspace-mode-note):not(.pdf-rail-collapsed):not(.pdf-rail-wide){grid-template-columns:108px minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr)) var(--onenote-nav-width)!important}
.workspace.${WORKSPACE_CLASS}.pdf-rail-wide:not(.workspace-mode-reader):not(.workspace-mode-note){grid-template-columns:264px minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr)) var(--onenote-nav-width)!important}
.workspace.${WORKSPACE_CLASS}.pdf-rail-collapsed:not(.workspace-mode-reader):not(.workspace-mode-note){grid-template-columns:minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr)) var(--onenote-nav-width)!important}
.workspace.${WORKSPACE_CLASS}.workspace-mode-note{grid-template-columns:minmax(0,1fr) var(--onenote-nav-width)!important}
.workspace.${WORKSPACE_CLASS}:not(.workspace-mode-reader)>.note-navigation-host.onenote-navigation-active{order:initial!important;grid-column:auto!important;width:100%!important;min-width:0!important;max-width:none!important;height:100%!important;align-self:stretch!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;padding:0!important;border-left:1px solid #d5d5d5!important;border-right:0!important;background:#fff!important;resize:none!important}
.workspace.${WORKSPACE_CLASS}.workspace-mode-reader>.note-navigation-host.onenote-navigation-active{display:none!important}
.workspace.${WORKSPACE_CLASS}>.note-navigation-host.onenote-navigation-active.onenote-navigation-collapsed{width:100%!important;min-width:0!important;max-width:none!important}
.workspace.${WORKSPACE_CLASS}>.note-navigation-host>.mednote-page-sheet-nav{width:100%!important;min-width:0!important;max-width:none!important;height:100%!important}
@media(max-width:900px){.workspace.${WORKSPACE_CLASS}{--onenote-nav-width:220px}}
@media(max-width:650px){.workspace.${WORKSPACE_CLASS}{--onenote-nav-width:200px}}
`;
  document.head.append(style);
}

function applyRightLayout() {
  injectStyle();
  for (const workspace of Array.from(document.querySelectorAll<HTMLElement>(".workspace"))) {
    const navigation = workspace.querySelector<HTMLElement>(NAV_SELECTOR);
    const aside = workspace.querySelector<HTMLElement>(":scope > .note-navigation-host");
    if (!navigation || !aside) {
      workspace.classList.remove(WORKSPACE_CLASS);
      continue;
    }
    workspace.classList.add(WORKSPACE_CLASS);
    if (aside.dataset.rightNavigationLayout === "1") continue;
    aside.dataset.rightNavigationLayout = "1";
    aside.style.setProperty("order", "initial", "important");
    aside.style.setProperty("width", "100%", "important");
    aside.style.setProperty("min-width", "0", "important");
    aside.style.setProperty("max-width", "none", "important");
    aside.style.setProperty("border-left", "1px solid #d5d5d5", "important");
    aside.style.setProperty("border-right", "0", "important");
    aside.style.setProperty("resize", "none", "important");
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applyRightLayout();
  });
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 1000);

export {};
