import { deleteSection } from "./independent-library-core";
import { addSheet, deleteSheets } from "./page-sheet-actions";
import { currentContext, pageGroups, sheetLogicalId } from "./page-sheet-state";

const ADD_SHEET_ATTR = "pageSheetAddSheet";
const DELETE_SECTION_ATTR = "pageSheetDeleteSection";
const DELETE_SHEET_ATTR = "pageSheetDeleteSheet";

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

function prepareMainToolbar() {
  const cluster = document.querySelector<HTMLElement>(".note-toolbar .note-file-actions");
  if (!cluster) return;

  const addSheetButton = cluster.querySelector<HTMLButtonElement>("button.note-create-button.primary.icon-only");
  if (addSheetButton) {
    addSheetButton.dataset[ADD_SHEET_ATTR] = "1";
    setButtonLabel(addSheetButton, "Thêm Sheet");
  }

  const buttons = Array.from(cluster.querySelectorAll<HTMLButtonElement>(":scope > button.note-create-button"));
  const notebookButton = buttons.find((button) => /Sổ mới|Notebook mới/i.test(button.textContent || ""));
  if (notebookButton) setButtonLabel(notebookButton, "Notebook mới");

  const deleteButton = buttons.find((button) => button.classList.contains("danger"));
  if (deleteButton) {
    deleteButton.dataset[DELETE_SECTION_ATTR] = "1";
    const context = currentContext();
    const canDelete = Boolean(context && context.record.sections.length > 1);
    setButtonLabel(deleteButton, canDelete ? "Xóa Section" : "Xóa Section · cần ít nhất 2 Section");
    const span = deleteButton.querySelector<HTMLElement>(":scope > span");
    if (span) span.textContent = "Xóa Section";
  }
}

function prepareLegacyFallbackControls() {
  const roundAdd = document.querySelector<HTMLButtonElement>(".note-thumbnails .round-add");
  const newPage = document.querySelector<HTMLButtonElement>(".note-thumbnails .new-page");
  for (const button of [roundAdd, newPage]) {
    if (!button) continue;
    button.dataset[ADD_SHEET_ATTR] = "1";
    setButtonLabel(button, "Thêm Sheet");
  }

  const roundDelete = document.querySelector<HTMLButtonElement>(".note-thumbnails .round-delete");
  if (roundDelete) {
    roundDelete.dataset[DELETE_SECTION_ATTR] = "1";
    setButtonLabel(roundDelete, "Xóa Section");
  }

  document.querySelectorAll<HTMLButtonElement>(".note-thumbnails .note-thumb-delete").forEach((button) => {
    button.dataset[DELETE_SHEET_ATTR] = "1";
    setButtonLabel(button, "Xóa Sheet");
  });
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
    ["[data-add-sheet],[data-library-add-sheet]", "Thêm Sheet"],
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
    window.alert("Section này chưa có Page. Hãy tạo Page trước rồi thêm Sheet.");
    return;
  }
  addSheet(active.context.record.id, active.context.activeSection.id, active.group.id);
}

function deleteActiveSection() {
  const context = currentContext();
  if (!context) return;
  if (context.record.sections.length <= 1) {
    window.alert("Notebook phải còn ít nhất một Section. Hãy tạo Section khác trước khi xóa Section này.");
    return;
  }
  const groups = pageGroups(context.notebook, context.activeSection);
  const fallback = context.record.sections.find((section) => section.id !== context.activeSection.id);
  const detail = groups.length
    ? ` ${groups.length} Page trong Section này sẽ được chuyển sang “${fallback?.title || "Section còn lại"}”.`
    : "";
  if (!window.confirm(`Xóa Section “${context.activeSection.title}”?${detail}`)) return;
  if (deleteSection(context.record.id, context.activeSection.id)) window.location.reload();
}

function deleteActiveSheet() {
  const active = activeGroup();
  const activeSheetId = String(active?.context.activeSheet?.id || "");
  if (!active?.group || !activeSheetId) return;
  const isLastSheet = active.group.sheets.length <= 1;
  const message = isLastSheet
    ? `Đây là Sheet cuối cùng của Page “${active.group.title}”. Xóa Sheet này sẽ xóa cả Page. Tiếp tục?`
    : "Xóa Sheet này? Nội dung và liên kết riêng của Sheet sẽ bị xóa.";
  if (!window.confirm(message)) return;
  if (deleteSheets(active.context.record.id, active.group.id, activeSheetId)) window.location.reload();
}

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const addSheetButton = target.closest<HTMLElement>(`[data-${ADD_SHEET_ATTR.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`);
  if (addSheetButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    addSheetFromActivePage();
    return;
  }

  const deleteSectionButton = target.closest<HTMLElement>(`[data-${DELETE_SECTION_ATTR.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`);
  if (deleteSectionButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteActiveSection();
    return;
  }

  const deleteSheetButton = target.closest<HTMLElement>(`[data-${DELETE_SHEET_ATTR.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}]`);
  if (deleteSheetButton && deleteSheetButton.matches(".note-thumb-delete")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteActiveSheet();
  }
}

let scheduled = false;
function prepare() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    prepareMainToolbar();
    prepareLegacyFallbackControls();
    normalizeHierarchyActionLabels();
  });
}

document.addEventListener("click", handleClick, true);
new MutationObserver(prepare).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", prepare, { once: true }) : prepare();
window.setInterval(prepare, 1200);

export {};
