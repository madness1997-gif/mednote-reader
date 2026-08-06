import {
  IMPORT_SESSION_KEY, createNotebook, createPage, createSection, deleteDocument, deleteGroup, deleteNotebook, deleteSection, getLibraryView, importPdf, openNoteTarget, openSource, renameDocument, renameGroup, renameNotebook, renameSection, syncFromApp, titleOf, watchImport, type RelationTarget,
} from "./independent-library-core";
import { buildPanel, closeLibrary, decodeSource, injectStyle, openAndReload, promptName, reload } from "./relation-library-ui-base";
import { showAttachSourceDialog, showMovePageDialog, showRelationDialog } from "./relation-library-ui-dialogs";

function handleClick(event: Event, panel: HTMLElement, backdrop: HTMLElement) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-import],[data-new-notebook],[data-open-source],[data-open-target],[data-relate-source],[data-relate-target],[data-rename-document],[data-delete-document],[data-rename-group],[data-delete-group],[data-add-section],[data-rename-section],[data-delete-section],[data-add-page],[data-move-page],[data-rename-notebook],[data-delete-notebook]");
  if (!target) return;
  const view = getLibraryView();
  if (!view) return;
  if (target.dataset.close !== undefined) return closeLibrary(backdrop);
  if (target.dataset.import !== undefined) {
    if (!importPdf()) window.alert("Không tìm thấy bộ chọn PDF.");
    else watchImport((source) => { openSource(source); reload(); });
    return;
  }
  if (target.dataset.newNotebook !== undefined) {
    const name = promptName("Tên notebook", "Notebook mới");
    if (name) openAndReload(() => createNotebook(name));
    return;
  }
  if (target.dataset.openSource) return openAndReload(() => openSource(decodeSource(target.dataset.openSource!)));
  if (target.dataset.openTarget) {
    try { return openAndReload(() => openNoteTarget(JSON.parse(target.dataset.openTarget!) as RelationTarget)); }
    catch { return; }
  }
  if (target.dataset.relateSource) return showRelationDialog(panel, view, decodeSource(target.dataset.relateSource));
  if (target.dataset.relateTarget) {
    try { return showAttachSourceDialog(panel, view, JSON.parse(target.dataset.relateTarget) as RelationTarget); }
    catch { return; }
  }
  if (target.dataset.renameDocument) {
    const record = view.documents.find((item) => item.id === target.dataset.renameDocument);
    const name = promptName("Đổi tên PDF", record ? titleOf(record.name) : "");
    if (name) openAndReload(() => renameDocument(target.dataset.renameDocument!, name));
    return;
  }
  if (target.dataset.deleteDocument) {
    const record = view.documents.find((item) => item.id === target.dataset.deleteDocument);
    if (window.confirm(`Xóa PDF “${record?.name || ""}” khỏi thư viện? Notebook, section và trang ghi chú vẫn được giữ; các trích dẫn cũ chỉ còn dấu nguồn không khả dụng.`)) {
      void deleteDocument(target.dataset.deleteDocument!).then((ok) => { if (ok) reload(); });
    }
    return;
  }
  if (target.dataset.renameGroup) {
    const group = view.groups.find((item) => item.id === target.dataset.renameGroup);
    const name = promptName("Đổi tên bộ PDF", group?.name || "");
    if (name) openAndReload(() => renameGroup(target.dataset.renameGroup!, name));
    return;
  }
  if (target.dataset.deleteGroup) {
    const group = view.groups.find((item) => item.id === target.dataset.deleteGroup);
    if (window.confirm(`Xóa bộ “${group?.name || ""}”? Các PDF bên trong và mọi ghi chú vẫn được giữ.`)) openAndReload(() => deleteGroup(target.dataset.deleteGroup!));
    return;
  }
  if (target.dataset.addSection) {
    const name = promptName("Tên section", "Section mới");
    if (name) openAndReload(() => createSection(target.dataset.addSection!, name));
    return;
  }
  if (target.dataset.renameSection) {
    const [notebookId, sectionId] = target.dataset.renameSection.split("|");
    const section = view.notebooks.find((item) => item.id === notebookId)?.sections.find((item) => item.id === sectionId);
    const name = promptName("Đổi tên section", section?.title || "");
    if (name) openAndReload(() => renameSection(notebookId, sectionId, name));
    return;
  }
  if (target.dataset.deleteSection) {
    const [notebookId, sectionId] = target.dataset.deleteSection.split("|");
    const record = view.notebooks.find((item) => item.id === notebookId);
    if ((record?.sections.length || 0) <= 1) return window.alert("Notebook phải còn ít nhất một section.");
    if (window.confirm("Xóa section? Các trang và liên kết PDF của chúng sẽ được chuyển sang section còn lại.")) openAndReload(() => deleteSection(notebookId, sectionId));
    return;
  }
  if (target.dataset.addPage) {
    const [notebookId, sectionId] = target.dataset.addPage.split("|");
    const name = promptName("Tên trang", "Trang mới");
    if (name) openAndReload(() => createPage(notebookId, sectionId, name));
    return;
  }
  if (target.dataset.movePage) {
    const [notebookId, pageId] = target.dataset.movePage.split("|");
    return showMovePageDialog(panel, view, notebookId, pageId);
  }
  if (target.dataset.renameNotebook) {
    const notebook = view.notebooks.find((item) => item.id === target.dataset.renameNotebook);
    const name = promptName("Đổi tên notebook", notebook?.title || "");
    if (name) openAndReload(() => renameNotebook(target.dataset.renameNotebook!, name));
    return;
  }
  if (target.dataset.deleteNotebook) {
    const notebook = view.notebooks.find((item) => item.id === target.dataset.deleteNotebook);
    if (window.confirm(`Xóa notebook “${notebook?.title || ""}”? Các PDF và bộ PDF đã gắn không bị xóa.`)) openAndReload(() => deleteNotebook(target.dataset.deleteNotebook!));
  }
}

function mount() {
  injectStyle();
  syncFromApp();
  for (const backdrop of Array.from(document.querySelectorAll<HTMLElement>(".library-backdrop"))) {
    if (backdrop.querySelector(".relation-library")) continue;
    const nativePanel = backdrop.querySelector<HTMLElement>(".library-panel");
    if (!nativePanel) continue;
    nativePanel.style.display = "none";
    const panel = buildPanel(backdrop);
    if (panel) {
      panel.addEventListener("click", (event) => handleClick(event, panel, backdrop));
      backdrop.append(panel);
    }
  }
}

function init() {
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
  window.setInterval(() => { if (!document.querySelector(".relation-library")) syncFromApp(); }, 1800);
  if (sessionStorage.getItem(IMPORT_SESSION_KEY)) watchImport((source) => { openSource(source); reload(); });
}

init();
export {};
