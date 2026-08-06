import {
  createPage,
  createSection,
  getLibraryView,
  openNoteTarget,
  readAppState,
  type AnyObject,
  type NotebookRecord,
  type NoteSection,
} from "./independent-library-core";

const NAV_CLASS = "relation-note-sections";
const STYLE_ID = "relation-note-sections-style";
const EMPTY_SECTION_KEY = "mednote-empty-section:";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

function reload() {
  window.location.reload();
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.note-thumbnails.relation-sections-active .notes-heading .round-add,
.note-thumbnails.relation-sections-active > .new-page{display:none!important}
.${NAV_CLASS}{display:grid;gap:8px;margin:8px 7px 10px;padding:9px;border:1px solid #d6e0e2;border-radius:11px;background:#f8fafa}
.${NAV_CLASS}-head,.${NAV_CLASS}-current{display:flex;align-items:center;gap:7px}
.${NAV_CLASS}-head strong{min-width:0;flex:1;font-size:11px;letter-spacing:.02em;color:#49636b;text-transform:uppercase}
.${NAV_CLASS}-add,.${NAV_CLASS}-add-page{border:0;border-radius:8px;background:#e4f0f2;color:#176a7a;font-weight:800;cursor:pointer}
.${NAV_CLASS}-add{width:27px;height:27px;font-size:17px}
.${NAV_CLASS}-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}
.${NAV_CLASS}-tab{flex:0 0 auto;max-width:150px;padding:6px 8px;border:1px solid #d3dfe1;border-radius:8px;background:#fff;color:#4b626a;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.${NAV_CLASS}-tab.active{border-color:#4b96a4;background:#e5f2f4;color:#176878;font-weight:800}
.${NAV_CLASS}-current{padding-top:2px;border-top:1px solid #e3e9ea}
.${NAV_CLASS}-current span{min-width:0;flex:1;display:grid;gap:1px}
.${NAV_CLASS}-current strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#314d55}
.${NAV_CLASS}-current small{font-size:9px;color:#788b91}
.${NAV_CLASS}-add-page{padding:6px 8px;font-size:10px;white-space:nowrap}
.${NAV_CLASS}-empty{padding:8px 3px 2px;color:#849399;font-size:10px;text-align:center}
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
  const activeSection = storedEmptySection
    || record.sections.find((section) => section.id === record.activeSectionId)
    || record.sections.find((section) => section.pageIds.includes(String(notebook.activePageId)))
    || record.sections[0];

  return { workspace, notebook, record, activeSection };
}

function sectionButton(section: NoteSection, activeSection: NoteSection) {
  return `<button class="${NAV_CLASS}-tab${section.id === activeSection.id ? " active" : ""}" data-section-id="${escapeHtml(section.id)}" title="${escapeHtml(section.title)}">${escapeHtml(section.title)} · ${section.pageIds.length}</button>`;
}

function renderNavigator(record: NotebookRecord, activeSection: NoteSection) {
  const element = document.createElement("div");
  element.className = NAV_CLASS;
  element.innerHTML = `<div class="${NAV_CLASS}-head"><strong>Section</strong><button class="${NAV_CLASS}-add" data-add-section title="Thêm section">＋</button></div><div class="${NAV_CLASS}-tabs">${record.sections.map((section) => sectionButton(section, activeSection)).join("")}</div><div class="${NAV_CLASS}-current"><span><strong>${escapeHtml(activeSection.title)}</strong><small>${activeSection.pageIds.length} trang</small></span><button class="${NAV_CLASS}-add-page" data-add-page>＋ Trang</button></div>${activeSection.pageIds.length ? "" : `<div class="${NAV_CLASS}-empty">Section này chưa có trang.</div>`}`;

  element.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-section-id],[data-add-section],[data-add-page]");
    if (!target) return;
    if (target.dataset.sectionId) {
      const section = record.sections.find((item) => item.id === target.dataset.sectionId);
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
    if (target.dataset.addSection !== undefined) {
      const title = window.prompt("Tên section", "Section mới")?.trim();
      if (!title) return;
      const before = new Set(record.sections.map((section) => section.id));
      if (!createSection(record.id, title)) return;
      const rawState = readAppState();
      const rawView = rawState ? getLibraryView() : null;
      const created = rawView?.notebooks.find((item) => item.id === record.id)?.sections.find((section) => !before.has(section.id));
      if (created) sessionStorage.setItem(`${EMPTY_SECTION_KEY}${record.id}`, created.id);
      reload();
      return;
    }
    if (target.dataset.addPage !== undefined) {
      sessionStorage.removeItem(`${EMPTY_SECTION_KEY}${record.id}`);
      const title = window.prompt("Tên trang", "Trang mới")?.trim();
      if (title && createPage(record.id, activeSection.id, title)) reload();
    }
  });
  return element;
}

function applyPageVisibility(aside: HTMLElement, notebook: AnyObject, activeSection: NoteSection) {
  const wraps = Array.from(aside.querySelectorAll<HTMLElement>(":scope > .note-thumb-wrap"));
  const pages = Array.isArray(notebook.pages) ? notebook.pages : [];
  wraps.forEach((wrap, index) => {
    const pageId = String(pages[index]?.id || "");
    wrap.dataset.relationPageId = pageId;
    wrap.style.display = activeSection.pageIds.includes(pageId) ? "" : "none";
  });
}

function mount() {
  injectStyle();
  const context = currentContext();
  for (const aside of Array.from(document.querySelectorAll<HTMLElement>(".note-thumbnails"))) {
    const old = aside.querySelector<HTMLElement>(`:scope > .${NAV_CLASS}`);
    if (!context) {
      old?.remove();
      aside.classList.remove("relation-sections-active");
      Array.from(aside.querySelectorAll<HTMLElement>(":scope > .note-thumb-wrap")).forEach((wrap) => { wrap.style.display = ""; });
      continue;
    }
    aside.classList.add("relation-sections-active");
    const signature = JSON.stringify({
      notebookId: context.record.id,
      activeSectionId: context.activeSection.id,
      sections: context.record.sections.map((section) => [section.id, section.title, section.pageIds]),
      pages: (context.notebook.pages || []).map((page: AnyObject) => String(page.id)),
    });
    if (!old || old.dataset.signature !== signature) {
      old?.remove();
      const navigator = renderNavigator(context.record, context.activeSection);
      navigator.dataset.signature = signature;
      const heading = aside.querySelector<HTMLElement>(":scope > .notes-heading");
      heading?.insertAdjacentElement("afterend", navigator);
    }
    applyPageVisibility(aside, context.notebook, context.activeSection);
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
