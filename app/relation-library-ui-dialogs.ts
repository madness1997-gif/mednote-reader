import {
  createGroup, deleteRelation, movePage, relationTargetLabel, titleOf, upsertRelation,
  type LibraryView, type RelationKind, type RelationSource, type RelationTarget,
} from "./independent-library-core";
import {
  decodeSource, encodeSource, escapeHtml, relationKindLabel, reload, sourceRelations, targetRelations, targetShortLabel,
} from "./relation-library-ui-base";
import { createModal } from "./relation-library-ui-modal";

export function showGroupDialog(panel: HTMLElement, view: LibraryView) {
  const documents = view.documents.filter((document) => document.available);
  if (!documents.length) return window.alert("Hãy thêm PDF trước khi tạo bộ tài liệu.");
  const checks = documents.map((document) => `<label><input type="checkbox" name="group-doc" value="${escapeHtml(document.id)}"> <span>${escapeHtml(titleOf(document.name))}</span></label>`).join("");
  const modal = createModal(panel, "Tạo bộ tài liệu", `<label class="rl-field">Tên bộ<input type="text" name="group-name" value="Bộ tài liệu mới"></label><div class="rl-field"><span>Chọn PDF</span><div class="rl-checks">${checks}</div></div>`, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-group>Lưu</button>');
  modal.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-save-group]")) return;
    const name = modal.querySelector<HTMLInputElement>('input[name="group-name"]')?.value.trim() || "";
    const ids = Array.from(modal.querySelectorAll<HTMLInputElement>('input[name="group-doc"]:checked')).map((input) => input.value);
    if (!name || !ids.length) return window.alert("Nhập tên và chọn ít nhất một PDF.");
    if (createGroup(name, ids)) reload();
  });
}

export function showMovePageDialog(panel: HTMLElement, view: LibraryView, notebookId: string, pageId: string) {
  const notebook = view.notebooks.find((item) => item.id === notebookId);
  if (!notebook) return;
  const options = notebook.sections.map((section) => `<option value="${escapeHtml(section.id)}"${section.pageIds.includes(pageId) ? " selected" : ""}>${escapeHtml(section.title)}</option>`).join("");
  const modal = createModal(panel, "Chuyển trang", `<label class="rl-field">Section đích<select name="move-section">${options}</select></label><div class="rl-hint">Các liên kết PDF của trang sẽ tự chuyển theo trang sang section mới.</div>`, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-move>Chuyển</button>');
  modal.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-save-move]")) return;
    const sectionId = modal.querySelector<HTMLSelectElement>('select[name="move-section"]')?.value;
    if (sectionId && movePage(notebookId, pageId, sectionId)) reload();
  });
}

export function targetOptions(view: LibraryView, selectedNotebookId?: string, selectedSectionId?: string) {
  const notebooks = view.notebooks.filter((item) => item.available);
  const notebook = notebooks.find((item) => item.id === selectedNotebookId) || notebooks[0];
  const section = notebook?.sections.find((item) => item.id === selectedSectionId) || notebook?.sections[0];
  const notebookOptions = notebooks.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === notebook?.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
  const sectionOptions = (notebook?.sections || []).map((item) => `<option value="${escapeHtml(item.id)}"${item.id === section?.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
  const pageOptions = (section?.pageIds || []).map((pageId) => `<option value="${escapeHtml(pageId)}">${escapeHtml(view.pages[pageId]?.title || "Trang")}</option>`).join("");
  return { notebook, section, notebookOptions, sectionOptions, pageOptions };
}

function sourceTitle(view: LibraryView, source: RelationSource) {
  if (source.type === "group") return view.groups.find((group) => group.id === source.id)?.name || "Bộ tài liệu";
  return titleOf(view.documents.find((document) => document.id === source.id)?.name || "Tài liệu");
}

function modeChooser() {
  return `<div class="rl-radio"><label><input type="radio" name="relation-mode" value="workspace" checked><span><strong>Mở cùng ghi chú</strong><small>Khi mở PDF, MedNote mở luôn vị trí ghi chú này. Mỗi PDF chỉ có một nơi chính.</small></span></label><label><input type="radio" name="relation-mode" value="content"><span><strong>Chỉ gắn tham khảo</strong><small>Giữ liên kết để tra cứu nhưng không tự mở hai bên cùng nhau.</small></span></label></div>`;
}

function existingSourceRelations(view: LibraryView, source: RelationSource) {
  const relations = sourceRelations(view, source);
  const managed = relations.filter((relation) => relation.target.type !== "block");
  const excerpts = relations.filter((relation) => relation.target.type === "block");
  const rows = managed.map((relation) => `<div class="rl-existing-row"><span><b>${relationKindLabel(relation)}</b> · ${escapeHtml(relationTargetLabel(view, relation.target))}</span><button class="rl-icon-btn danger" title="Bỏ liên kết" data-delete-relation="${escapeHtml(relation.id)}">⌫</button></div>`);
  if (excerpts.length) rows.push(`<div class="rl-existing-row"><span><b>Trích dẫn tự động</b> · ${excerpts.length} đoạn/hình được đưa từ PDF sang note</span></div>`);
  return rows.join("") || '<div class="rl-muted">Chưa gắn với ghi chú nào.</div>';
}

function refreshTargetFields(modal: HTMLElement, view: LibraryView) {
  const notebookId = modal.querySelector<HTMLSelectElement>('select[name="target-notebook"]')?.value;
  const sectionId = modal.querySelector<HTMLSelectElement>('select[name="target-section"]')?.value;
  const options = targetOptions(view, notebookId, sectionId);
  const sectionSelect = modal.querySelector<HTMLSelectElement>('select[name="target-section"]');
  const pageSelect = modal.querySelector<HTMLSelectElement>('select[name="target-page"]');
  if (!sectionSelect || !pageSelect) return;
  if (sectionSelect.dataset.notebook !== options.notebook?.id) {
    sectionSelect.innerHTML = options.sectionOptions;
    sectionSelect.dataset.notebook = options.notebook?.id || "";
  }
  const activeSectionId = sectionSelect.value || options.section?.id;
  const finalOptions = targetOptions(view, options.notebook?.id, activeSectionId);
  pageSelect.innerHTML = finalOptions.pageOptions;
}

function refreshTargetVisibility(modal: HTMLElement) {
  const level = modal.querySelector<HTMLSelectElement>('select[name="target-level"]')?.value;
  const sectionField = modal.querySelector<HTMLElement>("[data-section-field]");
  const pageField = modal.querySelector<HTMLElement>("[data-page-field]");
  if (sectionField) sectionField.style.display = level === "notebook" ? "none" : "grid";
  if (pageField) pageField.style.display = level === "page" ? "grid" : "none";
}

function selectedTarget(modal: HTMLElement): RelationTarget | null {
  const level = modal.querySelector<HTMLSelectElement>('select[name="target-level"]')?.value as RelationTarget["type"];
  const notebookId = modal.querySelector<HTMLSelectElement>('select[name="target-notebook"]')?.value || "";
  const sectionId = modal.querySelector<HTMLSelectElement>('select[name="target-section"]')?.value || undefined;
  const pageId = modal.querySelector<HTMLSelectElement>('select[name="target-page"]')?.value || undefined;
  if (!notebookId || (level !== "notebook" && !sectionId) || (level === "page" && !pageId)) return null;
  if (level === "notebook") return { type: "notebook", id: notebookId, notebookId };
  if (level === "section") return { type: "section", id: sectionId!, notebookId, sectionId };
  return { type: "page", id: pageId!, notebookId, sectionId, pageId };
}

export function showRelationDialog(panel: HTMLElement, view: LibraryView, source: RelationSource) {
  if (!view.notebooks.some((item) => item.available)) return window.alert("Hãy tạo notebook trước khi gắn PDF.");
  const initial = targetOptions(view);
  const body = `<div class="rl-hint"><b>${escapeHtml(sourceTitle(view, source))}</b><br>PDF và ghi chú vẫn là hai mục độc lập. Bỏ liên kết hoặc xóa một bên không tự xóa bên còn lại.</div>${modeChooser()}<label class="rl-field">Gắn vào<select name="target-level"><option value="notebook">Cả notebook</option><option value="section">Một section</option><option value="page" selected>Một trang cụ thể</option></select></label><label class="rl-field">Notebook<select name="target-notebook">${initial.notebookOptions}</select></label><label class="rl-field" data-section-field>Section<select name="target-section">${initial.sectionOptions}</select></label><label class="rl-field" data-page-field>Trang<select name="target-page">${initial.pageOptions}</select></label><div class="rl-field"><span>Đang liên kết</span><div class="rl-existing">${existingSourceRelations(view, source)}</div></div>`;
  const modal = createModal(panel, "Gắn PDF với ghi chú", body, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-relation>Lưu</button>');
  modal.addEventListener("change", (event) => {
    const element = event.target as HTMLElement;
    if (element.matches('select[name="target-notebook"],select[name="target-section"]')) refreshTargetFields(modal, view);
    refreshTargetVisibility(modal);
  });
  modal.addEventListener("click", (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-save-relation],[data-delete-relation]");
    if (!element) return;
    if (element.dataset.deleteRelation) {
      if (deleteRelation(element.dataset.deleteRelation)) reload();
      return;
    }
    const target = selectedTarget(modal);
    if (!target) return window.alert("Chọn đầy đủ vị trí ghi chú.");
    const kind = modal.querySelector<HTMLInputElement>('input[name="relation-mode"]:checked')?.value as RelationKind;
    if (upsertRelation(kind, source, target, kind === "workspace")) reload();
  });
  refreshTargetFields(modal, view);
  refreshTargetVisibility(modal);
}

function sourceOptions(view: LibraryView) {
  const groups = view.groups.map((group) => `<option value="${escapeHtml(encodeSource({ type: "group", id: group.id }))}">Bộ · ${escapeHtml(group.name)}</option>`);
  const documents = view.documents.filter((document) => document.available).map((document) => `<option value="${escapeHtml(encodeSource({ type: "document", id: document.id }))}">PDF · ${escapeHtml(titleOf(document.name))}</option>`);
  return [...groups, ...documents].join("");
}

function existingTargetRelations(view: LibraryView, target: RelationTarget) {
  const rows = targetRelations(view, target).filter((relation) => relation.target.type !== "block").map((relation) => `<div class="rl-existing-row"><span><b>${relationKindLabel(relation)}</b> · ${escapeHtml(sourceTitle(view, relation.source))}</span><button class="rl-icon-btn danger" title="Bỏ liên kết" data-delete-relation="${escapeHtml(relation.id)}">⌫</button></div>`);
  return rows.join("") || '<div class="rl-muted">Chưa gắn PDF nào ở đúng cấp này.</div>';
}

export function showAttachSourceDialog(panel: HTMLElement, view: LibraryView, target: RelationTarget) {
  const options = sourceOptions(view);
  if (!options) return window.alert("Hãy thêm PDF trước khi tạo liên kết.");
  const body = `<div class="rl-hint"><b>${escapeHtml(targetShortLabel(view, target))}</b><br>Liên kết ở notebook áp dụng khi mở notebook; liên kết ở section hoặc trang chỉ áp dụng cho đúng vị trí đó.</div><label class="rl-field">Chọn PDF hoặc bộ PDF<select name="target-source">${options}</select></label>${modeChooser()}<div class="rl-field"><span>Đang gắn tại vị trí này</span><div class="rl-existing">${existingTargetRelations(view, target)}</div></div>`;
  const modal = createModal(panel, "Gắn PDF", body, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-attachment>Gắn</button>');
  modal.addEventListener("click", (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-save-attachment],[data-delete-relation]");
    if (!element) return;
    if (element.dataset.deleteRelation) {
      if (deleteRelation(element.dataset.deleteRelation)) reload();
      return;
    }
    const encoded = modal.querySelector<HTMLSelectElement>('select[name="target-source"]')?.value;
    if (!encoded) return;
    const source = decodeSource(encoded);
    const kind = modal.querySelector<HTMLInputElement>('input[name="relation-mode"]:checked')?.value as RelationKind;
    if (upsertRelation(kind, source, target, kind === "workspace")) reload();
  });
}
