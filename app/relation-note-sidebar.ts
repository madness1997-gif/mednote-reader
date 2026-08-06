import {
  createNotebook,
  createPage,
  createSection,
  deleteSection,
  getLibraryView,
  openNoteTarget,
  readAppState,
  renameSection,
  type AnyObject,
  type LibraryView,
  type NotebookRecord,
  type NoteSection,
} from "./independent-library-core";

const NAV_CLASS = "onenote-note-navigation";
const STYLE_ID = "onenote-note-navigation-style";
const EMPTY_SECTION_KEY = "mednote-empty-section:";
const COLLAPSED_KEY = "mednote-onenote-sections-collapsed";
const SECTION_COLORS = ["#2b88d8", "#00a36c", "#8764b8", "#d83b01", "#c239b3", "#038387", "#ca5010", "#498205"];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

function reload() {
  window.location.reload();
}

function sectionColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return SECTION_COLORS[Math.abs(hash) % SECTION_COLORS.length];
}

function plainPreview(page: AnyObject | undefined) {
  const text = `${page?.body || ""} ${page?.bodyHtml || ""}`
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 72);
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.note-thumbnails.onenote-navigation-active{order:-1!important;width:310px!important;min-width:260px!important;max-width:390px!important;align-self:stretch!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;padding:0!important;border-right:1px solid #d5d5d5!important;border-left:0!important;background:#fff!important;resize:horizontal}
.note-thumbnails.onenote-navigation-active.onenote-navigation-collapsed{width:202px!important;min-width:180px!important;max-width:260px!important}
.note-thumbnails.onenote-navigation-active>.notes-heading,
.note-thumbnails.onenote-navigation-active>.note-thumb-wrap,
.note-thumbnails.onenote-navigation-active>.new-page{display:none!important}
.${NAV_CLASS}{min-height:0;flex:1;display:flex;flex-direction:column;background:#fff;color:#292929;font-family:Segoe UI,Arial,sans-serif}
.${NAV_CLASS}-bookbar{height:48px;display:flex;align-items:center;gap:6px;padding:7px 8px;border-bottom:1px solid #dedede;background:#fafafa}
.${NAV_CLASS}-book-icon{width:27px;height:27px;display:grid;place-items:center;border-radius:5px;background:#7719aa;color:#fff;font-size:12px;font-weight:800}
.${NAV_CLASS}-book-select{min-width:0;flex:1;height:32px;padding:0 7px;border:0;border-radius:5px;background:transparent;color:#252525;font-size:12px;font-weight:700;cursor:pointer}
.${NAV_CLASS}-book-select:hover{background:#ededed}
.${NAV_CLASS}-icon{width:30px;height:30px;border:0;border-radius:5px;background:transparent;color:#555;cursor:pointer;font-size:15px}
.${NAV_CLASS}-icon:hover{background:#e8e8e8;color:#222}
.${NAV_CLASS}-columns{min-height:0;flex:1;display:grid;grid-template-columns:112px minmax(0,1fr)}
.onenote-navigation-collapsed .${NAV_CLASS}-columns{grid-template-columns:minmax(0,1fr)}
.${NAV_CLASS}-sections{min-width:0;display:flex;flex-direction:column;border-right:1px solid #dedede;background:#f3f3f3}
.onenote-navigation-collapsed .${NAV_CLASS}-sections{display:none}
.${NAV_CLASS}-pages{min-width:0;display:flex;flex-direction:column;background:#fff}
.${NAV_CLASS}-pane-head{height:40px;display:flex;align-items:center;gap:5px;padding:6px 7px;border-bottom:1px solid #e2e2e2}
.${NAV_CLASS}-pane-head strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;color:#444}
.${NAV_CLASS}-add{height:28px;padding:0 7px;border:0;border-radius:4px;background:transparent;color:#5c2d91;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
.${NAV_CLASS}-add:hover{background:#e7dff0}
.${NAV_CLASS}-section-list,.${NAV_CLASS}-page-list{min-height:0;flex:1;overflow:auto;scrollbar-width:thin}
.${NAV_CLASS}-section{position:relative;width:100%;display:flex;align-items:center;gap:5px;padding:0;border:0;border-bottom:1px solid #e5e5e5;background:transparent;text-align:left;cursor:pointer}
.${NAV_CLASS}-section::before{content:"";width:5px;align-self:stretch;background:var(--section-color)}
.${NAV_CLASS}-section-copy{min-width:0;flex:1;display:grid;gap:2px;padding:10px 2px 10px 5px}
.${NAV_CLASS}-section-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;color:#333}
.${NAV_CLASS}-section-copy small{font-size:9px;color:#777}
.${NAV_CLASS}-section:hover{background:#e8e8e8}
.${NAV_CLASS}-section.active{background:#fff}
.${NAV_CLASS}-section.active .${NAV_CLASS}-section-copy strong{font-weight:800;color:#222}
.${NAV_CLASS}-section-actions{display:none;padding-right:3px}
.${NAV_CLASS}-section:hover .${NAV_CLASS}-section-actions{display:flex}
.${NAV_CLASS}-mini{width:22px;height:24px;border:0;border-radius:4px;background:transparent;color:#666;cursor:pointer;font-size:11px}
.${NAV_CLASS}-mini:hover{background:#d9d9d9;color:#222}
.${NAV_CLASS}-section-footer,.${NAV_CLASS}-page-footer{padding:7px;border-top:1px solid #dedede;background:#fafafa}
.${NAV_CLASS}-footer-button{width:100%;height:30px;border:0;border-radius:5px;background:transparent;color:#5c2d91;text-align:left;font-size:11px;font-weight:700;cursor:pointer}
.${NAV_CLASS}-footer-button:hover{background:#e7dff0}
.${NAV_CLASS}-page{position:relative;width:100%;display:flex;align-items:stretch;padding:0;border:0;border-bottom:1px solid #ededed;background:#fff;text-align:left;cursor:pointer}
.${NAV_CLASS}-page::before{content:"";width:3px;background:transparent}
.${NAV_CLASS}-page-copy{min-width:0;flex:1;display:grid;gap:3px;padding:10px 10px 10px 9px}
.${NAV_CLASS}-page-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:#2f2f2f}
.${NAV_CLASS}-page-copy small{height:25px;overflow:hidden;color:#777;font-size:9px;line-height:12px}
.${NAV_CLASS}-page:hover{background:#f3f3f3}
.${NAV_CLASS}-page.active{background:#e9e2f0}
.${NAV_CLASS}-page.active::before{background:#7719aa}
.${NAV_CLASS}-page.active .${NAV_CLASS}-page-copy strong{font-weight:800;color:#4b176d}
.${NAV_CLASS}-empty{display:grid;place-items:center;min-height:120px;padding:18px;color:#7a7a7a;text-align:center;font-size:11px}
@media(max-width:900px){.note-thumbnails.onenote-navigation-active{width:270px!important;min-width:230px!important}.${NAV_CLASS}-columns{grid-template-columns:96px minmax(0,1fr)}}
@media(max-width:650px){.note-thumbnails.onenote-navigation-active{width:230px!important;min-width:190px!important}.${NAV_CLASS}-columns{grid-template-columns:80px minmax(0,1fr)}.${NAV_CLASS}-section-copy small,.${NAV_CLASS}-page-copy small{display:none}}
`;
  document.head.append(style);
}

function currentContext() {
  const state = readAppState();
  const view = getLibraryView();
  if (!state || !view) return null;
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  if (!workspace) return null;
  const notebook = (workspace.notebooks || []).find((item: AnyObject) => String(item.id) === String(workspace.activeNotebookId));
  if (!notebook) return null;
  const record = view.notebooks.find((item) => item.id === String(notebook.id) && item.available);
  if (!record?.sections.length) return null;

  const storedEmptyId = sessionStorage.getItem(`${EMPTY_SECTION_KEY}${record.id}`);
  const storedEmptySection = record.sections.find((section) => section.id === storedEmptyId && section.pageIds.length === 0);
  if (storedEmptyId && !storedEmptySection) sessionStorage.removeItem(`${EMPTY_SECTION_KEY}${record.id}`);
  const activePageSection = record.sections.find((section) => section.pageIds.includes(String(notebook.activePageId)));
  const activeSection = storedEmptySection
    || activePageSection
    || record.sections.find((section) => section.id === record.activeSectionId)
    || record.sections[0];

  return { state, view, workspace, notebook, record, activeSection };
}

function notebookOptions(view: LibraryView, activeNotebookId: string) {
  return view.notebooks.filter((notebook) => notebook.available).map((notebook) =>
    `<option value="${escapeHtml(notebook.id)}"${notebook.id === activeNotebookId ? " selected" : ""}>${escapeHtml(notebook.title)}</option>`,
  ).join("");
}

function sectionRow(record: NotebookRecord, section: NoteSection, activeSection: NoteSection) {
  const color = sectionColor(section.id);
  return `<div class="${NAV_CLASS}-section${section.id === activeSection.id ? " active" : ""}" data-open-section="${escapeHtml(section.id)}" style="--section-color:${color}"><span class="${NAV_CLASS}-section-copy"><strong>${escapeHtml(section.title)}</strong><small>${section.pageIds.length} trang</small></span><span class="${NAV_CLASS}-section-actions"><button class="${NAV_CLASS}-mini" title="Đổi tên section" data-rename-section="${escapeHtml(section.id)}">✎</button><button class="${NAV_CLASS}-mini" title="Xóa section" data-delete-section="${escapeHtml(section.id)}">⌫</button></span></div>`;
}

function pageRows(notebook: AnyObject, record: NotebookRecord, activeSection: NoteSection) {
  const pages = new Map<string, AnyObject>((notebook.pages || []).map((page: AnyObject) => [String(page.id), page]));
  return activeSection.pageIds.map((pageId, index) => {
    const page = pages.get(pageId);
    if (!page) return "";
    const preview = plainPreview(page) || "Trang ghi chú";
    return `<button class="${NAV_CLASS}-page${String(notebook.activePageId) === pageId ? " active" : ""}" data-open-page="${escapeHtml(pageId)}"><span class="${NAV_CLASS}-page-copy"><strong>${escapeHtml(String(page.title || `Trang ${index + 1}`))}</strong><small>${escapeHtml(preview)}</small></span></button>`;
  }).join("");
}

function renderNavigator(context: NonNullable<ReturnType<typeof currentContext>>) {
  const { view, notebook, record, activeSection } = context;
  const collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  const element = document.createElement("div");
  element.className = NAV_CLASS;
  element.innerHTML = `<div class="${NAV_CLASS}-bookbar"><b class="${NAV_CLASS}-book-icon">N</b><select class="${NAV_CLASS}-book-select" data-notebook-select aria-label="Chọn notebook">${notebookOptions(view, record.id)}</select><button class="${NAV_CLASS}-icon" data-new-notebook title="Tạo notebook">＋</button><button class="${NAV_CLASS}-icon" data-toggle-sections title="${collapsed ? "Hiện section" : "Thu gọn section"}">${collapsed ? "»" : "«"}</button></div><div class="${NAV_CLASS}-columns"><section class="${NAV_CLASS}-sections"><div class="${NAV_CLASS}-pane-head"><strong>Sections</strong><button class="${NAV_CLASS}-add" data-add-section>＋</button></div><div class="${NAV_CLASS}-section-list">${record.sections.map((section) => sectionRow(record, section, activeSection)).join("")}</div><div class="${NAV_CLASS}-section-footer"><button class="${NAV_CLASS}-footer-button" data-add-section>＋ Section mới</button></div></section><section class="${NAV_CLASS}-pages"><div class="${NAV_CLASS}-pane-head" style="border-top:3px solid ${sectionColor(activeSection.id)}"><strong>${escapeHtml(activeSection.title)}</strong><button class="${NAV_CLASS}-add" data-add-page>＋ Page</button></div><div class="${NAV_CLASS}-page-list">${pageRows(notebook, record, activeSection) || `<div class="${NAV_CLASS}-empty">Section này chưa có trang.<br>Chọn “＋ Page” để bắt đầu.</div>`}</div><div class="${NAV_CLASS}-page-footer"><button class="${NAV_CLASS}-footer-button" data-add-page>＋ Thêm page</button></div></section></div>`;

  element.addEventListener("pointerdown", (event) => event.stopPropagation());
  element.addEventListener("change", (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-notebook-select]");
    if (!select || select.value === record.id) return;
    sessionStorage.removeItem(`${EMPTY_SECTION_KEY}${record.id}`);
    openNoteTarget({ type: "notebook", id: select.value, notebookId: select.value });
    reload();
  });
  element.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-open-section],[data-open-page],[data-add-section],[data-add-page],[data-new-notebook],[data-toggle-sections],[data-rename-section],[data-delete-section]");
    if (!target) return;

    if (target.dataset.toggleSections !== undefined) {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
      mount();
      return;
    }
    if (target.dataset.newNotebook !== undefined) {
      const title = window.prompt("Tên notebook", "Notebook mới")?.trim();
      if (title && createNotebook(title)) reload();
      return;
    }
    if (target.dataset.openSection) {
      if ((event.target as HTMLElement).closest("[data-rename-section],[data-delete-section]")) return;
      const section = record.sections.find((item) => item.id === target.dataset.openSection);
      if (!section) return;
      const key = `${EMPTY_SECTION_KEY}${record.id}`;
      if (!section.pageIds.length) {
        sessionStorage.setItem(key, section.id);
        reload();
        return;
      }
      sessionStorage.removeItem(key);
      openNoteTarget({ type: "section", id: section.id, notebookId: record.id, sectionId: section.id });
      reload();
      return;
    }
    if (target.dataset.openPage) {
      sessionStorage.removeItem(`${EMPTY_SECTION_KEY}${record.id}`);
      openNoteTarget({ type: "page", id: target.dataset.openPage, notebookId: record.id, sectionId: activeSection.id, pageId: target.dataset.openPage });
      reload();
      return;
    }
    if (target.dataset.addSection !== undefined) {
      const title = window.prompt("Tên section", "Section mới")?.trim();
      if (!title) return;
      const before = new Set(record.sections.map((section) => section.id));
      if (!createSection(record.id, title)) return;
      const created = getLibraryView()?.notebooks.find((item) => item.id === record.id)?.sections.find((section) => !before.has(section.id));
      if (created) sessionStorage.setItem(`${EMPTY_SECTION_KEY}${record.id}`, created.id);
      reload();
      return;
    }
    if (target.dataset.addPage !== undefined) {
      sessionStorage.removeItem(`${EMPTY_SECTION_KEY}${record.id}`);
      const title = window.prompt("Tên page", "Trang mới")?.trim();
      if (title && createPage(record.id, activeSection.id, title)) reload();
      return;
    }
    if (target.dataset.renameSection) {
      event.stopPropagation();
      const section = record.sections.find((item) => item.id === target.dataset.renameSection);
      const title = window.prompt("Đổi tên section", section?.title || "")?.trim();
      if (title && renameSection(record.id, target.dataset.renameSection, title)) reload();
      return;
    }
    if (target.dataset.deleteSection) {
      event.stopPropagation();
      if (record.sections.length <= 1) {
        window.alert("Notebook phải còn ít nhất một section.");
        return;
      }
      const section = record.sections.find((item) => item.id === target.dataset.deleteSection);
      if (window.confirm(`Xóa section “${section?.title || ""}”? Các page sẽ được chuyển sang section còn lại.`)
        && deleteSection(record.id, target.dataset.deleteSection)) reload();
    }
  });
  return element;
}

function mount() {
  injectStyle();
  const context = currentContext();
  for (const aside of Array.from(document.querySelectorAll<HTMLElement>(".note-thumbnails"))) {
    const old = aside.querySelector<HTMLElement>(`:scope > .${NAV_CLASS}`);
    if (!context) {
      old?.remove();
      aside.classList.remove("onenote-navigation-active", "onenote-navigation-collapsed");
      continue;
    }
    const collapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
    aside.classList.add("onenote-navigation-active");
    aside.classList.toggle("onenote-navigation-collapsed", collapsed);
    const signature = JSON.stringify({
      notebookId: context.record.id,
      notebookTitle: context.record.title,
      activePageId: context.notebook.activePageId,
      activeSectionId: context.activeSection.id,
      collapsed,
      notebooks: context.view.notebooks.filter((item) => item.available).map((item) => [item.id, item.title]),
      sections: context.record.sections.map((section) => [section.id, section.title, section.pageIds]),
      pages: (context.notebook.pages || []).map((page: AnyObject) => [String(page.id), String(page.title || "")]),
    });
    if (!old || old.dataset.signature !== signature) {
      old?.remove();
      const navigator = renderNavigator(context);
      navigator.dataset.signature = signature;
      aside.prepend(navigator);
    }
  }
}

let scheduled = false;
function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    mount();
  });
}

new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", scheduleMount, { once: true }) : scheduleMount();
window.setInterval(scheduleMount, 1200);

export {};
