import { createGroup, deleteRelation, movePage, relationTargetLabel, titleOf, upsertRelation, type LibraryView, type RelationKind, type RelationSource, type RelationTarget } from "./independent-library-core";
import { escapeHtml, reload, sourceRelations } from "./relation-library-ui-base";
import { createModal } from "./relation-library-ui-modal";

export function showGroupDialog(panel: HTMLElement, view: LibraryView) {
  const documents = view.documents.filter((document) => document.available);
  if (!documents.length) return window.alert("Hãy thêm PDF trước khi tạo khối tài liệu.");
  const checks = documents.map((document) => `<label><input type="checkbox" name="group-doc" value="${escapeHtml(document.id)}"> <span>${escapeHtml(titleOf(document.name))}</span></label>`).join("");
  const modal = createModal(panel, "Tạo khối tài liệu", `<label class="rl-field">Tên khối<input type="text" name="group-name" value="Khối tài liệu mới"></label><div class="rl-field"><span>Chọn tài liệu</span><div class="rl-checks">${checks}</div></div>`, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-group>Lưu khối</button>');
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
  const modal = createModal(panel, "Chuyển trang", `<label class="rl-field">Section đích<select name="move-section">${options}</select></label>`, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-move>Chuyển</button>');
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

export function showRelationDialog(panel: HTMLElement, view: LibraryView, source: RelationSource) {
  if (!view.notebooks.some((item) => item.available)) return window.alert("Hãy tạo notebook trước khi liên kết.");
  const initial = targetOptions(view);
  const sourceTitle = source.type === "group"
    ? view.groups.find((group) => group.id === source.id)?.name || "Khối tài liệu"
    : titleOf(view.documents.find((document) => document.id === source.id)?.name || "Tài liệu");
  const existing = sourceRelations(view, source).map((relation) => `<div class="rl-existing-row"><span><b>${relation.kind === "workspace" ? "Workspace" : "Nội dung"}</b> · ${escapeHtml(relationTargetLabel(view, relation.target))}${relation.kind === "workspace" && relation.isDefault ? " · mặc định" : ""}</span><button class="rl-icon-btn danger" data-delete-relation="${escapeHtml(relation.id)}">⌫</button></div>`).join("") || '<div class="rl-muted">Chưa có quan hệ.</div>';
  const body = `<div class="rl-muted">${escapeHtml(sourceTitle)}</div><div class="rl-radio"><label><input type="radio" name="relation-kind" value="workspace" checked><span><strong>Quan hệ workspace</strong><small>Mở tài liệu và ghi chú cùng nhau</small></span></label><label><input type="radio" name="relation-kind" value="content"><span><strong>Quan hệ nội dung</strong><small>Liên quan kiến thức hoặc truy nguồn</small></span></label></div><label class="rl-field">Cấp liên kết<select name="target-level"><option value="notebook">Notebook</option><option value="section">Section</option><option value="page" selected>Trang</option></select></label><label class="rl-field">Notebook<select name="target-notebook">${initial.notebookOptions}</select></label><label class="rl-field" data-section-field>Section<select name="target-section">${initial.sectionOptions}</select></label><label class="rl-field" data-page-field>Trang<select name="target-page">${initial.pageOptions}</select></label><label class="rl-field" data-default-field style="display:flex;grid-template-columns:auto 1fr;align-items:center"><input type="checkbox" name="is-default" checked> Dùng làm workspace mặc định khi mở nguồn này</label><div class="rl-field"><span>Quan hệ hiện có</span><div class="rl-existing">${existing}</div></div>`;
  const modal = createModal(panel, "Thiết lập quan hệ", body, '<button class="rl-secondary" data-modal-close>Hủy</button><button class="rl-primary" data-save-relation>Lưu quan hệ</button>');
  const refreshTargets = () => {
    const notebookId = modal.querySelector<HTMLSelectElement>('select[name="target-notebook"]')?.value;
    const sectionId = modal.querySelector<HTMLSelectElement>('select[name="target-section"]')?.value;
    const options = targetOptions(view, notebookId, sectionId);
    const sectionSelect = modal.querySelector<HTMLSelectElement>('select[name="target-section"]')!;
    const pageSelect = modal.querySelector<HTMLSelectElement>('select[name="target-page"]')!;
    if (sectionSelect.dataset.notebook !== options.notebook?.id) {
      sectionSelect.innerHTML = options.sectionOptions;
      sectionSelect.dataset.notebook = options.notebook?.id || "";
    }
    const activeSectionId = sectionSelect.value || options.section?.id;
    const finalOptions = targetOptions(view, options.notebook?.id, activeSectionId);
    pageSelect.innerHTML = finalOptions.pageOptions;
  };
  const refreshVisibility = () => {
    const kind = modal.querySelector<HTMLInputElement>('input[name="relation-kind"]:checked')?.value as RelationKind;
    const level = modal.querySelector<HTMLSelectElement>('select[name="target-level"]')?.value;
    (modal.querySelector<HTMLElement>("[data-section-field]")!).style.display = level === "notebook" ? "none" : "grid";
    (modal.querySelector<HTMLElement>("[data-page-field]")!).style.display = level === "page" ? "grid" : "none";
    (modal.querySelector<HTMLElement>("[data-default-field]")!).style.display = kind === "workspace" ? "grid" : "none";
  };
  modal.addEventListener("change", (event) => {
    const element = event.target as HTMLElement;
    if (element.matches('select[name="target-notebook"],select[name="target-section"]')) refreshTargets();
    refreshVisibility();
  });
  modal.addEventListener("click", (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-save-relation],[data-delete-relation]");
    if (!element) return;
    if (element.dataset.deleteRelation) {
      if (deleteRelation(element.dataset.deleteRelation)) reload();
      return;
    }
    const kind = modal.querySelector<HTMLInputElement>('input[name="relation-kind"]:checked')?.value as RelationKind;
    const level = modal.querySelector<HTMLSelectElement>('select[name="target-level"]')?.value as RelationTarget["type"];
    const notebookId = modal.querySelector<HTMLSelectElement>('select[name="target-notebook"]')?.value || "";
    const sectionId = modal.querySelector<HTMLSelectElement>('select[name="target-section"]')?.value || undefined;
    const pageId = modal.querySelector<HTMLSelectElement>('select[name="target-page"]')?.value || undefined;
    if (!notebookId || (level !== "notebook" && !sectionId) || (level === "page" && !pageId)) return window.alert("Chọn đầy đủ đích liên kết.");
    const target: RelationTarget = level === "notebook"
      ? { type: "notebook", id: notebookId, notebookId }
      : level === "section"
        ? { type: "section", id: sectionId!, notebookId, sectionId }
        : { type: "page", id: pageId!, notebookId, sectionId, pageId };
    const isDefault = Boolean(modal.querySelector<HTMLInputElement>('input[name="is-default"]')?.checked);
    if (upsertRelation(kind, source, target, kind === "workspace" && isDefault)) reload();
  });
  refreshTargets();
  refreshVisibility();
}
