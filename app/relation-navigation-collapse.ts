const STYLE_ID = "relation-navigation-collapse-style";
const NOTE_HIDDEN_KEY = "mednote-note-navigation-hidden";
const NOTE_HIDDEN_CLASS = "onenote-note-navigation-hidden";
const NOTE_RESTORE_CLASS = "onenote-note-navigation-restore";
const NOTE_HIDE_CLASS = "onenote-note-navigation-hide-all";

function noteNavigationHidden() {
  return localStorage.getItem(NOTE_HIDDEN_KEY) === "1";
}

function setNoteNavigationHidden(hidden: boolean) {
  localStorage.setItem(NOTE_HIDDEN_KEY, hidden ? "1" : "0");
  schedule();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.workspace.${NOTE_HIDDEN_CLASS}{position:relative!important}
.workspace.${NOTE_HIDDEN_CLASS}>.note-thumbnails.onenote-navigation-active{display:none!important;width:0!important;min-width:0!important;max-width:0!important;border:0!important}
.workspace.onenote-right-navigation-layout.${NOTE_HIDDEN_CLASS}:not(.workspace-mode-reader):not(.workspace-mode-note):not(.pdf-rail-collapsed):not(.pdf-rail-wide){grid-template-columns:108px minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr))!important}
.workspace.onenote-right-navigation-layout.${NOTE_HIDDEN_CLASS}.pdf-rail-wide:not(.workspace-mode-reader):not(.workspace-mode-note):not(.pdf-rail-collapsed){grid-template-columns:264px minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr))!important}
.workspace.onenote-right-navigation-layout.${NOTE_HIDDEN_CLASS}.pdf-rail-collapsed:not(.workspace-mode-reader):not(.workspace-mode-note){grid-template-columns:minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr))!important}
.workspace.onenote-right-navigation-layout.${NOTE_HIDDEN_CLASS}.workspace-mode-note{grid-template-columns:minmax(0,1fr)!important}
.workspace.pdf-rail-collapsed>.pdf-thumbnails{display:none!important;width:0!important;min-width:0!important;max-width:0!important;border:0!important}
.${NOTE_RESTORE_CLASS}{position:absolute;z-index:35;right:0;top:50%;transform:translateY(-50%);width:28px;height:64px;display:grid;place-items:center;padding:0;border:1px solid #cfc6d7;border-right:0;border-radius:9px 0 0 9px;background:#fff;color:#5c2d91;box-shadow:0 3px 13px #2f233c2b;cursor:pointer;font-size:20px;font-weight:800}
.${NOTE_RESTORE_CLASS}:hover{background:#f1eaf6}
.workspace-mode-reader>.${NOTE_RESTORE_CLASS}{display:none!important}
.${NOTE_HIDE_CLASS}{flex:0 0 auto}
@media(max-width:650px){.${NOTE_RESTORE_CLASS}{width:25px;height:52px;font-size:18px}}
`;
  document.head.append(style);
}

function makeRestoreButton(workspace: HTMLElement) {
  let button = workspace.querySelector<HTMLButtonElement>(`:scope > .${NOTE_RESTORE_CLASS}`);
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = NOTE_RESTORE_CLASS;
  button.textContent = "‹";
  button.title = "Hiện thanh điều hướng note";
  button.setAttribute("aria-label", "Hiện thanh điều hướng note");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setNoteNavigationHidden(false);
  });
  workspace.append(button);
  return button;
}

function ensureHideButton(navigation: HTMLElement) {
  const bookbar = navigation.querySelector<HTMLElement>(":scope > .onenote-note-navigation-bookbar");
  if (!bookbar || bookbar.querySelector(`.${NOTE_HIDE_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `onenote-note-navigation-icon ${NOTE_HIDE_CLASS}`;
  button.textContent = "›";
  button.title = "Ẩn hoàn toàn thanh điều hướng note";
  button.setAttribute("aria-label", "Ẩn hoàn toàn thanh điều hướng note");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setNoteNavigationHidden(true);
  });
  bookbar.append(button);
}

function applyNavigationState() {
  injectStyle();
  const hidden = noteNavigationHidden();

  for (const workspace of Array.from(document.querySelectorAll<HTMLElement>(".workspace"))) {
    const aside = workspace.querySelector<HTMLElement>(":scope > .note-thumbnails.onenote-navigation-active");
    const navigation = aside?.querySelector<HTMLElement>(":scope > .onenote-note-navigation");

    if (!aside || !navigation) {
      workspace.classList.remove(NOTE_HIDDEN_CLASS);
      workspace.querySelector<HTMLElement>(`:scope > .${NOTE_RESTORE_CLASS}`)?.remove();
      continue;
    }

    ensureHideButton(navigation);
    workspace.classList.toggle(NOTE_HIDDEN_CLASS, hidden);
    aside.setAttribute("aria-hidden", hidden ? "true" : "false");

    if (hidden) makeRestoreButton(workspace);
    else workspace.querySelector<HTMLElement>(`:scope > .${NOTE_RESTORE_CLASS}`)?.remove();
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    applyNavigationState();
  });
}

new MutationObserver(schedule).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"],
});

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", schedule, { once: true })
  : schedule();
window.setInterval(schedule, 1200);

export {};
