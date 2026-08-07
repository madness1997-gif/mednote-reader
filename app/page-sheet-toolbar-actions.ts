import { deleteNotebook, renameNotebook } from "./independent-library-core";
import { addSheet } from "./page-sheet-actions";
import { currentContext, pageGroups, sheetLogicalId } from "./page-sheet-state";

const STYLE_ID = "mednote-sidebar-notebook-actions-style";
const ADD_SHEET_ATTR = "pageSheetAddSheet";
const NOTEBOOK_MORE_ATTR = "pageSheetNotebookMore";
const NOTEBOOK_RENAME_ATTR = "pageSheetNotebookRename";
const NOTEBOOK_DELETE_ATTR = "pageSheetNotebookDelete";

function dataSelector(datasetKey: string) {
  return `[data-${datasetKey.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mednote-page-sheet-nav>.mps-bookbar{position:relative!important}
.mednote-page-sheet-nav .mps-notebook-more{flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:#626b70;font:700 17px/1 Arial,sans-serif;cursor:pointer}
.mednote-page-sheet-nav .mps-notebook-more:hover,.mednote-page-sheet-nav .mps-notebook-more[aria-expanded="true"]{background:#eceff1;color:#343a3e}
.mednote-page-sheet-nav .mps-notebook-menu{position:absolute;z-index:120;top:38px;right:34px;display:none;min-width:150px;padding:5px;border:1px solid #dfe4e6;border-radius:9px;background:#fff;box-shadow:0 8px 24px #24323a2b}
.mednote-page-sheet-nav .mps-notebook-menu.open{display:grid;gap:2px}
.mednote-page-sheet-nav .mps-notebook-menu button{min-height:31px;padding:6px 9px;border:0;border-radius:6px;background:transparent;text-align:left;color:#374047;font-size:11px;cursor:pointer}
.mednote-page-sheet-nav .mps-notebook-menu button:hover{background:#f0f2f3}
.mednote-page-sheet-nav .mps-notebook-menu button.danger{color:#b3261e}
`;
  document.head.append(style);
}

function setButtonLabel(button: HTMLButtonElement | null, label: string) {
  if (!button) return;
  button.title = label;
  button.setAttribute("aria-label", label);
  const span = button.querySelector<HTMLElement>(":scope > span");
  if (span) span.textContent = label;
}

function activeGroup() {
  const context = currentContext();
  if (!context) return null;
  const groups = pageGroups(context.notebook, context.activeSection);
  const logicalId = context.activeSheet ? sheetLogicalId(context.activeSheet) : "";
  const group = groups.find((item) => item.id === logicalId) || groups[0];
  return group ? { context, group } : { context, group: null };
}

function hideHierarchyButton(button: HTMLButtonElement | undefined) {
  if (!button) return;
  button.style.setProperty("display", "none", "important");
  button.setAttribute("aria-hidden", "true");
  button.tabIndex = -1;
}

function prepareMainToolbar() {
  const cluster = document.querySelector<HTMLElement>(".note-toolbar .note-file-actions");
  if (!cluster) return;

  const addSheetButton = cluster.querySelector<HTMLButtonElement>("button.note-create-button.primary.icon-only");
  if (addSheetButton) {
    addSheetButton.dataset[ADD_SHEET_ATTR] = "1";
    setButtonLabel(addSheetButton, "Thêm Sheet");
  }

  const buttons = Array.from(cluster.querySelectorAll<HTMLButtonElement>(":scope > button.note-create-button"));
  hideHierarchyButton(buttons.find((button) => /Sổ mới|Notebook mới/i.test(button.textContent || "")));
  hideHierarchyButton(buttons.find((button) => button.classList.contains("danger")));
}

function ensureNotebookMenu() {
  const bookbar = document.querySelector<HTMLElement>(".mednote-page-sheet-nav > .mps-bookbar");
  if (!bookbar) return;

  let more = bookbar.querySelector<HTMLButtonElement>(`.mps-notebook-more`);
  if (!more) {
    more = document.createElement("button");
    more.type = "button";
    more.className = "mps-notebook-more";
    more.dataset[NOTEBOOK_MORE_ATTR] = "1";
    more.textContent = "⋯";
    more.title = "Thao tác Notebook";
    more.setAttribute("aria-label", "Thao tác Notebook");
    more.setAttribute("aria-expanded", "false");
    const close = bookbar.querySelector(".onenote-note-navigation-close");
    if (close) bookbar.insertBefore(more, close); else bookbar.append(more);
  }

  if (!bookbar.querySelector(".mps-notebook-menu")) {
    const menu = document.createElement("div");
    menu.className = "mps-notebook-menu";
    menu.innerHTML = `<button type="button" data-page-sheet-notebook-rename="1">Đổi tên Notebook</button><button type="button" class="danger" data-page-sheet-notebook-delete="1">Xóa Notebook</button>`;
    bookbar.append(menu);
  }
}

function normalizeHierarchyActionLabels() {
  const labels: Array<[string, string]> = [
    ["[data-new-notebook]", "Tạo Notebook"],
    ["[data-add-section]", "Thêm Section"],
    ["[data-delete-section]", "Xóa Section"],
    ["[data-rename-section]", "Đổi tên Section"],
    ["[data-add-page],[data-library-add-page]", "Thêm Page"],
    ["[data-delete-page]", "Xóa Page"],
    ["[data-rename-page]", "Đổi tên Page"],
    ["[data-delete-sheet]", "Xóa Sheet"],
  ];
  for (const [selector, label] of labels) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.title = label;
      element.setAttribute("aria-label", label);
    });
  }
}

function addSheetFromActivePage() {
  const active = activeGroup();
  if (!active?.group) {
    window.alert("Section này chưa có Page. Hãy tạo Page trong sidebar trước rồi thêm Sheet.");
    return;
  }
  addSheet(active.context.record.id, active.context.activeSection.id, active.group.id);
}

function closeNotebookMenu() {
  document.querySelectorAll<HTMLElement>(".mps-notebook-menu.open").forEach((menu) => menu.classList.remove("open"));
  document.querySelectorAll<HTMLButtonElement>(`.mps-notebook-more[aria-expanded="true"]`).forEach((button) => button.setAttribute("aria-expanded", "false"));
}

function toggleNotebookMenu(button: HTMLElement) {
  const bookbar = button.closest<HTMLElement>(".mps-bookbar");
  const menu = bookbar?.querySelector<HTMLElement>(".mps-notebook-menu");
  if (!menu) return;
  const open = !menu.classList.contains("open");
  closeNotebookMenu();
  menu.classList.toggle("open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function renameActiveNotebook() {
  const context = currentContext();
  if (!context) return;
  const title = window.prompt("Đổi tên Notebook", context.record.title)?.trim();
  if (title && renameNotebook(context.record.id, title)) window.location.reload();
}

function deleteActiveNotebook() {
  const context = currentContext();
  if (!context) return;
  if (!window.confirm(`Xóa Notebook “${context.record.title}”? PDF liên quan sẽ không bị xóa.`)) return;
  if (deleteNotebook(context.record.id)) window.location.reload();
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  if (target.closest<HTMLElement>(dataSelector(ADD_SHEET_ATTR))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    addSheetFromActivePage();
    return;
  }

  const more = target.closest<HTMLElement>(dataSelector(NOTEBOOK_MORE_ATTR));
  if (more) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleNotebookMenu(more);
    return;
  }

  if (target.closest<HTMLElement>(dataSelector(NOTEBOOK_RENAME_ATTR))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeNotebookMenu();
    renameActiveNotebook();
    return;
  }

  if (target.closest<HTMLElement>(dataSelector(NOTEBOOK_DELETE_ATTR))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeNotebookMenu();
    deleteActiveNotebook();
    return;
  }

  if (!target.closest(".mps-notebook-menu")) closeNotebookMenu();
}

let scheduled = false;
function prepare() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    injectStyle();
    prepareMainToolbar();
    ensureNotebookMenu();
    normalizeHierarchyActionLabels();
  });
}

document.addEventListener("click", handleClick, true);
new MutationObserver(prepare).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", prepare, { once: true }) : prepare();
window.setInterval(prepare, 900);

export {};
