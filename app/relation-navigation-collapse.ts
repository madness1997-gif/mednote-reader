const STYLE_ID = "relation-navigation-collapse-style";
const NOTE_HIDDEN_KEY = "mednote-note-navigation-hidden";
const NOTE_HIDDEN_CLASS = "onenote-note-navigation-hidden";
const NOTE_RESTORE_CLASS = "onenote-note-navigation-restore";
const NOTE_CLOSE_CLASS = "onenote-note-navigation-close";
const READER_CLOSE_CLASS = "reader-navigation-close";

// Old builds persisted this preference indefinitely. Clear that stale value and
// keep hide/show scoped to the current tab so the sidebar starts visible again
// when the app is reopened.
try {
  localStorage.removeItem(NOTE_HIDDEN_KEY);
} catch {
  // Storage can be unavailable in hardened/private browsing contexts.
}

function noteNavigationHidden() {
  try {
    return sessionStorage.getItem(NOTE_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function setNoteNavigationHidden(hidden: boolean) {
  try {
    sessionStorage.setItem(NOTE_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    // Keep the UI functional even when storage is unavailable.
  }
  applyNavigationState();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.workspace.${NOTE_HIDDEN_CLASS}{position:relative!important}
.workspace.${NOTE_HIDDEN_CLASS}>.note-navigation-host.onenote-navigation-active{display:none!important}
.workspace.pdf-rail-collapsed>.pdf-thumbnails{display:none!important;width:0!important;min-width:0!important;max-width:0!important;border:0!important}
.note-navigation-host.onenote-navigation-active,.pdf-thumbnails{position:relative!important}
.${NOTE_CLOSE_CLASS},.${READER_CLOSE_CLASS}{z-index:80;width:32px;height:32px;display:grid;place-items:center;padding:0;border:1px solid #d2d2d2;border-radius:7px;background:#fff;color:#4b4b4b;box-shadow:0 2px 7px #0000001f;cursor:pointer;font:700 19px/1 Arial,sans-serif;touch-action:manipulation}
.${NOTE_CLOSE_CLASS}:hover,.${READER_CLOSE_CLASS}:hover{background:#f1f1f1;color:#111;border-color:#b8b8b8}
.${NOTE_CLOSE_CLASS}{flex:0 0 32px;margin-left:2px}
.${READER_CLOSE_CLASS}{position:absolute;top:6px;right:6px}
.${NOTE_RESTORE_CLASS}{position:absolute;z-index:80;right:0;top:50%;transform:translateY(-50%);width:31px;height:68px;display:grid;place-items:center;padding:0;border:1px solid #cfc6d7;border-right:0;border-radius:10px 0 0 10px;background:#fff;color:#5c2d91;box-shadow:0 3px 13px #2f233c2b;cursor:pointer;font:800 21px/1 Arial,sans-serif;touch-action:manipulation}
.${NOTE_RESTORE_CLASS}:hover{background:#f1eaf6}
.workspace-mode-reader>.${NOTE_RESTORE_CLASS}{display:none!important}
@media(max-width:650px){.${NOTE_CLOSE_CLASS},.${READER_CLOSE_CLASS}{width:36px;height:36px;font-size:21px}.${NOTE_RESTORE_CLASS}{width:29px;height:58px;font-size:20px}}
`;
  document.head.append(style);
}

function hiddenGridTemplate(workspace: HTMLElement) {
  if (workspace.classList.contains("workspace-mode-note")) return "minmax(0,1fr)";
  if (workspace.classList.contains("workspace-mode-reader")) return "";
  const contentColumns = "minmax(0,var(--reader-share,50fr)) 8px minmax(0,var(--notes-share,50fr))";
  if (workspace.classList.contains("pdf-rail-collapsed")) return contentColumns;
  if (workspace.classList.contains("pdf-rail-wide")) return `264px ${contentColumns}`;
  return `108px ${contentColumns}`;
}

function ensureNoteRestoreButton(workspace: HTMLElement) {
  let button = workspace.querySelector<HTMLButtonElement>(`:scope > .${NOTE_RESTORE_CLASS}`);
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = NOTE_RESTORE_CLASS;
  button.textContent = "‹";
  button.title = "Hiện thanh điều hướng note";
  button.setAttribute("aria-label", "Hiện thanh điều hướng note");
  button.dataset.noteNavigationRestore = "1";
  workspace.append(button);
  return button;
}

function ensureNoteCloseButton(navigation: HTMLElement) {
  const bookbar = navigation.querySelector<HTMLElement>(":scope > .mps-bookbar");
  if (!bookbar) return;
  if (bookbar.querySelector(`.${NOTE_CLOSE_CLASS}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = NOTE_CLOSE_CLASS;
  button.textContent = "×";
  button.title = "Đóng thanh điều hướng note";
  button.setAttribute("aria-label", "Đóng thanh điều hướng note");
  button.dataset.noteNavigationClose = "1";
  bookbar.append(button);
}

function ensureReaderCloseButton(aside: HTMLElement) {
  if (aside.querySelector(`:scope > .${READER_CLOSE_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = READER_CLOSE_CLASS;
  button.textContent = "×";
  button.title = "Đóng thanh điều hướng PDF";
  button.setAttribute("aria-label", "Đóng thanh điều hướng PDF");
  button.dataset.readerNavigationClose = "1";
  aside.prepend(button);
}

function closeReaderNavigation(button: HTMLElement) {
  const aside = button.closest<HTMLElement>(".pdf-thumbnails");
  const nativeButton = aside?.querySelector<HTMLButtonElement>('button[aria-label="Thu gọn bảng điều hướng"],button[title="Thu gọn"]');
  nativeButton?.click();
}

function applyNavigationState() {
  injectStyle();
  const hidden = noteNavigationHidden();

  for (const workspace of Array.from(document.querySelectorAll<HTMLElement>(".workspace"))) {
    const noteAside = workspace.querySelector<HTMLElement>(":scope > .note-navigation-host.onenote-navigation-active");
    const navigation = noteAside?.querySelector<HTMLElement>(":scope > .mednote-page-sheet-nav");
    const readerAside = workspace.querySelector<HTMLElement>(":scope > .pdf-thumbnails");

    if (readerAside && !workspace.classList.contains("pdf-rail-collapsed")) ensureReaderCloseButton(readerAside);

    if (!noteAside || !navigation) {
      workspace.classList.remove(NOTE_HIDDEN_CLASS);
      workspace.style.removeProperty("grid-template-columns");
      workspace.querySelector<HTMLElement>(`:scope > .${NOTE_RESTORE_CLASS}`)?.remove();
      continue;
    }

    ensureNoteCloseButton(navigation);
    workspace.classList.toggle(NOTE_HIDDEN_CLASS, hidden);
    noteAside.setAttribute("aria-hidden", hidden ? "true" : "false");

    if (hidden) {
      noteAside.style.setProperty("display", "none", "important");
      const template = hiddenGridTemplate(workspace);
      if (template) workspace.style.setProperty("grid-template-columns", template, "important");
      ensureNoteRestoreButton(workspace);
    } else {
      noteAside.style.removeProperty("display");
      workspace.style.removeProperty("grid-template-columns");
      workspace.querySelector<HTMLElement>(`:scope > .${NOTE_RESTORE_CLASS}`)?.remove();
    }
  }
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const noteClose = target.closest<HTMLElement>("[data-note-navigation-close]");
  if (noteClose) {
    event.preventDefault();
    event.stopPropagation();
    setNoteNavigationHidden(true);
    return;
  }

  const noteRestore = target.closest<HTMLElement>("[data-note-navigation-restore]");
  if (noteRestore) {
    event.preventDefault();
    event.stopPropagation();
    setNoteNavigationHidden(false);
    return;
  }

  const readerClose = target.closest<HTMLElement>("[data-reader-navigation-close]");
  if (readerClose) {
    event.preventDefault();
    event.stopPropagation();
    closeReaderNavigation(readerClose);
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

document.addEventListener("click", handleClick, true);
new MutationObserver(schedule).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"],
});

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", schedule, { once: true })
  : schedule();
window.setInterval(schedule, 900);

export {};
