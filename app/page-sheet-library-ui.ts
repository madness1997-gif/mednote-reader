import { getLibraryView, readAppState, type AnyObject } from "./independent-library-core";
import { addSheet, createLogicalPage, targetForGroup, targetForSheet } from "./page-sheet-actions";
import { escapeHtml, pageGroups } from "./page-sheet-state";
import { requestText } from "./mednote-dialog";

export function regroupLibraryTree() {
  const panel = document.querySelector<HTMLElement>(".relation-library");
  const tree = panel?.querySelector<HTMLElement>(".rl-tree");
  const view = getLibraryView();
  const state = readAppState();
  if (!panel || !tree || !view || !state || tree.dataset.pageSheet === "1") return;
  const notebookCopies = new Map<string, AnyObject>();
  for (const workspace of state.workspaces) {
    for (const notebook of workspace.notebooks || []) {
      if (!notebookCopies.has(String(notebook.id))) notebookCopies.set(String(notebook.id), notebook);
    }
  }
  tree.dataset.pageSheet = "1";
  tree.innerHTML = view.notebooks.filter((record) => record.available).map((record) => {
    const notebook = notebookCopies.get(record.id);
    if (!notebook) return "";
    const notebookTarget = escapeHtml(JSON.stringify({ type: "notebook", id: record.id, notebookId: record.id }));
    const sections = record.sections.map((section) => {
      const sectionTarget = escapeHtml(JSON.stringify({ type: "section", id: section.id, notebookId: record.id, sectionId: section.id }));
      const groups = pageGroups(notebook, section);
      const pages = groups.map((group) => {
        const target = escapeHtml(JSON.stringify(targetForGroup(record.id, section.id, group)));
        const sheets = group.sheets.map((sheet, index) => {
          const sheetTarget = escapeHtml(JSON.stringify(targetForSheet(record.id, section.id, group.id, String(sheet.id))));
          return `<div class="rl-page-row" style="padding-left:31px"><button class="rl-page-open" data-open-target="${sheetTarget}">↳ Tờ ${index + 1}</button><span class="rl-page-tools"><button class="rl-icon-btn" title="Gắn PDF với tờ" data-relate-target="${sheetTarget}">⛓</button></span></div>`;
        }).join("");
        return `<div><div class="rl-page-row"><button class="rl-page-open" data-open-target="${target}"><b>${escapeHtml(group.title)}</b> <span class="rl-muted">· ${group.sheets.length} tờ</span></button><span class="rl-page-tools"><button class="rl-icon-btn" title="Gắn PDF với Page" data-relate-target="${target}">⛓</button><button class="rl-icon-btn" title="Thêm tờ" data-library-add-sheet="${escapeHtml(`${record.id}|${section.id}|${group.id}`)}">＋</button></span></div>${sheets}</div>`;
      }).join("");
      return `<section class="rl-section"><div class="rl-section-head"><button class="rl-section-open" data-open-target="${sectionTarget}">${escapeHtml(section.title)} <span class="rl-muted">(${groups.length} Page)</span></button><span class="rl-section-tools"><button class="rl-icon-btn" title="Thêm Page" data-library-add-page="${escapeHtml(`${record.id}|${section.id}`)}">＋</button><button class="rl-icon-btn" title="Đổi tên Section" data-rename-section="${escapeHtml(`${record.id}|${section.id}`)}">✎</button><button class="rl-icon-btn danger" title="Xóa Section" data-delete-section="${escapeHtml(`${record.id}|${section.id}`)}">⌫</button></span></div><div class="rl-pages">${pages || '<div class="rl-muted" style="padding:8px 12px">Chưa có Page</div>'}</div></section>`;
    }).join("");
    return `<article class="rl-notebook"><div class="rl-notebook-head"><button class="rl-notebook-title" data-open-target="${notebookTarget}"><b class="rl-badge note">SỔ</b><span class="rl-copy"><strong>${escapeHtml(record.title)}</strong><small>${record.sections.length} Section</small></span></button><span class="rl-notebook-tools"><button class="rl-icon-btn" title="Thêm Section" data-add-section="${escapeHtml(record.id)}">＋</button><button class="rl-icon-btn" title="Đổi tên Notebook" data-rename-notebook="${escapeHtml(record.id)}">✎</button><button class="rl-icon-btn danger" title="Xóa Notebook" data-delete-notebook="${escapeHtml(record.id)}">⌫</button></span></div><div class="rl-sections">${sections}</div></article>`;
  }).join("") || '<div class="rl-empty">Chưa có Notebook.</div>';
}

export function handleLibraryCustomActions(event: Event) {
  const element = (event.target as HTMLElement).closest<HTMLElement>("[data-library-add-page],[data-library-add-sheet]");
  if (!element) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (element.dataset.libraryAddPage) {
    const [notebookId, sectionId] = element.dataset.libraryAddPage.split("|");
    void requestText({ title: "Thêm Page", label: "Tên Page", value: "Page mới", confirmLabel: "Thêm" })
      .then((title) => { if (title) createLogicalPage(notebookId, sectionId, title); });
    return;
  }
  if (element.dataset.libraryAddSheet) {
    const [notebookId, sectionId, logicalId] = element.dataset.libraryAddSheet.split("|");
    addSheet(notebookId, sectionId, logicalId);
  }
}
