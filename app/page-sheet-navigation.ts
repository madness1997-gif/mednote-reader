import {
  createNotebook, createSection, deleteNotebook, deleteSection, getLibraryView, openNoteTarget, renameNotebook, renameSection,
  type LibraryView, type RelationTarget,
} from "./independent-library-core";
import { addSheet, createLogicalPage, deleteSheets, moveLogicalPage, openLogicalPage, openSheet, renameLogicalPage, reorderSheet, targetForGroup, targetForSheet, targetMatches } from "./page-sheet-actions";
import { showLinkDialog } from "./page-sheet-link-ui";
import { ACTIVE_SECTION_KEY, EXPANDED_PAGE_KEY, NAV_CLASS, STYLE_ID, currentContext, escapeHtml, normalizePageSheetModel, pageGroups, sheetLogicalId, sheetTitle, type PageGroup, type ScopedTarget, type SheetPage } from "./page-sheet-state";

const NOTE_HIDDEN_KEY = "mednote-note-navigation-hidden";

type NativeSearchEntry = { kind: "section" | "page" | "sheet"; value: string; title: string };

export function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.onenote-note-navigation{display:none!important}
.note-thumbnails.onenote-navigation-active{width:360px!important;min-width:285px!important;max-width:520px!important;resize:horizontal}
.${NAV_CLASS}{min-height:0;flex:1;display:flex;flex-direction:column;background:#fff;color:#292929;font-family:Segoe UI,Arial,sans-serif}
.${NAV_CLASS} button,.${NAV_CLASS} select{font:inherit}
.mps-bookbar{height:48px;display:flex;align-items:center;gap:5px;padding:7px 8px;border-bottom:1px solid #dedede;background:#fafafa;position:relative}
.mps-book-icon{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:5px;background:#7719aa;color:#fff;font-size:11px;font-weight:800;cursor:pointer;touch-action:manipulation}
.mps-book-select{min-width:0;flex:1;height:32px;border:0;border-radius:5px;background:transparent;font-size:12px;font-weight:700;cursor:pointer}
.mps-icon{width:30px;height:30px;border:0;border-radius:5px;background:transparent;cursor:pointer;touch-action:manipulation}.mps-icon:hover{background:#e8e8e8}
.mps-sidebar-search-button,.mps-notebook-more,.onenote-note-navigation-close{flex:0 0 30px;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#5f6368;cursor:pointer;touch-action:manipulation}
.mps-sidebar-search-button:hover,.mps-notebook-more:hover,.onenote-note-navigation-close:hover{background:#ececef;color:#292929}
.mps-notebook-menu{position:absolute;z-index:150;top:39px;right:35px;display:none;min-width:160px;padding:5px;border:1px solid #dfe4e6;border-radius:9px;background:#fff;box-shadow:0 8px 24px #24323a2b}
.mps-notebook-menu.open{display:grid;gap:2px}
.mps-notebook-menu button{min-height:32px;padding:6px 9px;border:0;border-radius:6px;background:transparent;text-align:left;color:#374047;cursor:pointer;touch-action:manipulation}
.mps-notebook-menu button:hover{background:#f0f2f3}.mps-notebook-menu button.danger{color:#b3261e}
.mps-layout{min-height:0;flex:1;display:grid;grid-template-columns:106px minmax(0,1fr)}
.mps-sections{min-width:0;display:flex;flex-direction:column;border-right:1px solid #dedede;background:#f3f3f3}
.mps-pages{min-width:0;display:flex;flex-direction:column;background:#fff}
.mps-pane-head{min-height:40px;display:flex;align-items:center;gap:5px;padding:6px 7px;border-bottom:1px solid #e2e2e2}
.mps-pane-head strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.mps-add{height:28px;padding:0 7px;border:0;border-radius:4px;background:transparent;color:#5c2d91;font-size:11px;font-weight:700;cursor:pointer}.mps-add:hover{background:#e7dff0}
.mps-section-list,.mps-page-list{min-height:0;flex:1;overflow:auto}
.mps-section{position:relative;width:100%;display:flex;align-items:stretch;border:0;border-bottom:1px solid #e5e5e5;background:transparent;text-align:left;cursor:pointer}
.mps-section::before{content:"";width:5px;background:var(--section-color)}
.mps-section-copy{min-width:0;flex:1;display:grid;gap:2px;padding:10px 5px}.mps-section-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.mps-section-copy small{font-size:9px;color:#777}
.mps-section.active{background:#fff}.mps-section:hover{background:#e8e8e8}.mps-section-actions{display:none;align-items:center;padding-right:2px}.mps-section:hover .mps-section-actions{display:flex}
.mps-mini{width:23px;height:25px;border:0;border-radius:4px;background:transparent;color:#666;cursor:pointer}.mps-mini:hover{background:#ddd;color:#222}
.mps-page-card{border-bottom:1px solid #e7e7e7;background:#fff}.mps-page-card.active{background:#f7f2fa}
.mps-page-head{display:flex;align-items:center;min-height:43px}.mps-page-open{min-width:0;flex:1;display:grid;gap:2px;padding:8px 9px;border:0;background:transparent;text-align:left;cursor:pointer}.mps-page-open strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#333}.mps-page-open small{font-size:9px;color:#777}
.mps-page-tools{display:none;gap:1px;padding-right:4px}.mps-page-card:hover .mps-page-tools,.mps-page-card.active .mps-page-tools{display:flex}
.mps-sheets{margin:0 7px 8px 16px;border-left:2px solid #d8c9e3;background:#fff}
.mps-sheet{display:flex;align-items:center;border-top:1px solid #eee}.mps-sheet:first-child{border-top:0}.mps-sheet.active{background:#e9e2f0}
.mps-sheet-open{min-width:0;flex:1;padding:7px 8px;border:0;background:transparent;text-align:left;font-size:10px;cursor:pointer}.mps-sheet.active .mps-sheet-open{font-weight:800;color:#4b176d}
.mps-sheet-tools{display:none;padding-right:2px}.mps-sheet:hover .mps-sheet-tools,.mps-sheet.active .mps-sheet-tools{display:flex}
.mps-empty{padding:24px 12px;color:#777;text-align:center;font-size:11px}
.mednote-sheet-link-modal{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:#10242d73}
.mps-modal{width:min(540px,100%);max-height:90vh;overflow:auto;border-radius:15px;background:#fff;box-shadow:0 24px 80px #10242d55}.mps-modal header,.mps-modal footer{display:flex;align-items:center;gap:10px;padding:15px 17px}.mps-modal header{border-bottom:1px solid #e1e7e9}.mps-modal header strong{flex:1}.mps-modal footer{justify-content:flex-end}.mps-modal button{min-height:34px;padding:7px 11px;border:1px solid #c9d4d7;border-radius:8px;background:#fff;cursor:pointer}.mps-modal button.primary{border-color:#1d7181;background:#1d7181;color:#fff}.mps-modal-body{display:grid;gap:13px;padding:15px 17px}.mps-modal-body p{margin:0;color:#63777e;font-size:12px}.mps-modal-body>label{display:grid;gap:6px;font-size:12px}.mps-modal select{height:38px;padding:0 9px;border:1px solid #c8d5d8;border-radius:8px;background:#fff}.mps-link-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mps-link-modes label{display:flex;gap:8px;padding:10px;border:1px solid #d5dfe1;border-radius:9px}.mps-link-modes b,.mps-link-modes small{display:block}.mps-link-modes small{margin-top:3px;color:#71858c;font-size:10px}.mps-existing{display:grid;gap:6px}.mps-existing>div{display:flex;align-items:center;gap:8px;padding:7px;border:1px solid #e1e7e9;border-radius:8px}.mps-existing span{min-width:0;flex:1;font-size:11px}
@media(max-width:720px){.note-thumbnails.onenote-navigation-active{width:285px!important;min-width:230px!important}.mps-layout{grid-template-columns:88px minmax(0,1fr)}.mps-link-modes{grid-template-columns:1fr}}
`;
  document.head.append(style);
}

export function sectionColor(id: string) {
  const colors = ["#2b88d8", "#00a36c", "#8764b8", "#d83b01", "#c239b3", "#038387", "#ca5010", "#498205"];
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export function linkCount(view: LibraryView, target: ScopedTarget) {
  return view.relations.filter((relation) => targetMatches(relation.target, target)).length;
}

function nativeSearchEntries(nav: HTMLElement, query: string): NativeSearchEntry[] {
  const normalized = query.trim().toLocaleLowerCase("vi");
  if (!normalized) return [];
  const entries: NativeSearchEntry[] = [];
  nav.querySelectorAll<HTMLElement>(".mps-section[data-open-section]").forEach((node) => {
    const title = (node.querySelector("strong")?.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "section", value: node.dataset.openSection || "", title });
  });
  nav.querySelectorAll<HTMLElement>(".mps-page-open[data-open-page]").forEach((node) => {
    const title = (node.querySelector("strong")?.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "page", value: node.dataset.openPage || "", title });
  });
  nav.querySelectorAll<HTMLElement>(".mps-sheet-open[data-open-sheet]").forEach((node) => {
    const title = (node.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "sheet", value: node.dataset.openSheet || "", title });
  });
  return entries.slice(0, 50);
}

function renderNativeSearchResults(nav: HTMLElement, input: HTMLInputElement, body: HTMLElement) {
  const entries = nativeSearchEntries(nav, input.value);
  body.innerHTML = entries.length
    ? entries.map((entry) => `<button type="button" class="mps-utility-result" data-native-note-search-open="${entry.kind}" data-native-note-search-value="${escapeHtml(entry.value)}"><i class="mps-utility-dot"></i><span>${escapeHtml(entry.title)}</span><small>${entry.kind === "section" ? "Section" : entry.kind === "sheet" ? "Tờ" : "Page"}</small></button>`).join("")
    : `<div class="mps-utility-empty">${input.value.trim() ? "Không tìm thấy tên phù hợp." : "Nhập tên Section, Page hoặc tờ để tìm."}</div>`;
}

function openNativeSearch(nav: HTMLElement) {
  nav.dataset.sidebarMode = "search";
  let panel = nav.querySelector<HTMLElement>(":scope > .mps-sidebar-utility");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "mps-sidebar-utility";
    nav.append(panel);
  }
  panel.innerHTML = `<div class="mps-utility-head"><strong>Tìm kiếm</strong><button type="button" class="mps-sidebar-search-close" data-native-note-search-close="1" title="Đóng tìm kiếm" aria-label="Đóng tìm kiếm">×</button></div><div style="padding:7px 8px;border-bottom:1px solid #ececee"><input class="mps-search-input" type="search" placeholder="Tìm theo tên…" aria-label="Tìm ghi chú"></div><div class="mps-utility-body"></div>`;
  const input = panel.querySelector<HTMLInputElement>(".mps-search-input");
  const body = panel.querySelector<HTMLElement>(".mps-utility-body");
  if (!input || !body) return;
  const render = () => renderNativeSearchResults(nav, input, body);
  input.addEventListener("input", render);
  render();
  requestAnimationFrame(() => input.focus());
}

function closeNativeSearch(nav: HTMLElement) {
  nav.dataset.sidebarMode = "navigation";
  nav.querySelector<HTMLElement>(":scope > .mps-sidebar-utility")?.remove();
}

function openNativeSearchResult(nav: HTMLElement, kind: string, value: string) {
  const selector = kind === "section" ? "[data-open-section]" : kind === "sheet" ? "[data-open-sheet]" : "[data-open-page]";
  const key = kind === "section" ? "openSection" : kind === "sheet" ? "openSheet" : "openPage";
  const target = Array.from(nav.querySelectorAll<HTMLElement>(selector)).find((node) => node.dataset[key as keyof DOMStringMap] === value);
  closeNativeSearch(nav);
  target?.click();
}

function toggleNativeNotebookMenu(nav: HTMLElement, button: HTMLElement) {
  const menu = nav.querySelector<HTMLElement>(":scope > .mps-bookbar > .mps-notebook-menu");
  if (!menu) return;
  const open = !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeNativeNotebookMenu(nav: HTMLElement) {
  nav.querySelector<HTMLElement>(":scope > .mps-bookbar > .mps-notebook-menu")?.classList.remove("open");
  nav.querySelector<HTMLElement>("[data-page-sheet-notebook-more]")?.setAttribute("aria-expanded", "false");
}

function openNativeNotebookPicker(nav: HTMLElement) {
  const select = nav.querySelector<HTMLSelectElement>("[data-notebook-select]");
  if (!select) return;
  select.focus({ preventScroll: true });
  const picker = select as HTMLSelectElement & { showPicker?: () => void };
  try {
    if (picker.showPicker) picker.showPicker();
    else select.click();
  } catch {
    select.click();
  }
}

function hideNativeNoteSidebar(nav: HTMLElement) {
  localStorage.setItem(NOTE_HIDDEN_KEY, "1");
  const aside = nav.closest<HTMLElement>(".note-thumbnails");
  const workspace = nav.closest<HTMLElement>(".workspace");
  workspace?.classList.add("onenote-note-navigation-hidden");
  aside?.setAttribute("aria-hidden", "true");
  aside?.style.setProperty("display", "none", "important");
  window.dispatchEvent(new Event("resize"));
}

export function renderNavigator(context: NonNullable<ReturnType<typeof currentContext>>) {
  const { view, notebook, record, activeSection, activeSheet } = context;
  const groups = pageGroups(notebook, activeSection);
  const activeLogicalId = activeSheet ? sheetLogicalId(activeSheet) : "";
  const expandedId = sessionStorage.getItem(`${EXPANDED_PAGE_KEY}${record.id}`) || activeLogicalId || groups[0]?.id || "";
  const nav = document.createElement("div");
  nav.className = NAV_CLASS;
  nav.dataset.signature = JSON.stringify({
    notebookId: record.id,
    activeSectionId: activeSection.id,
    activeSheetId: String(activeSheet?.id || ""),
    expandedId,
    sections: record.sections.map((section) => [section.id, section.title, section.pageIds]),
    pages: (notebook.pages || []).map((page: SheetPage) => [page.id, page.logicalPageId, page.logicalPageTitle, page.sheetOrder]),
    relationStamp: view.updatedAt,
  });
  const notebookOptions = view.notebooks.filter((item) => item.available).map((item) => `<option value="${escapeHtml(item.id)}"${item.id === record.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
  const sectionRows = record.sections.map((section) => `<div class="mps-section${section.id === activeSection.id ? " active" : ""}" data-open-section="${escapeHtml(section.id)}" style="--section-color:${sectionColor(section.id)}"><span class="mps-section-copy"><strong>${escapeHtml(section.title)}</strong><small>${pageGroups(notebook, section).length} Page</small></span><span class="mps-section-actions"><button class="mps-mini" title="Đổi tên Section" data-rename-section="${escapeHtml(section.id)}">✎</button><button class="mps-mini" title="Xóa Section" data-delete-section="${escapeHtml(section.id)}">⌫</button></span></div>`).join("");
  const pageRows = groups.map((group) => {
    const expanded = group.id === expandedId || group.id === activeLogicalId;
    const pageTarget = targetForGroup(record.id, activeSection.id, group);
    const pageLinks = linkCount(view, pageTarget);
    const sheets = expanded ? `<div class="mps-sheets">${group.sheets.map((sheet, index) => {
      const physicalId = String(sheet.id);
      const sheetTarget = targetForSheet(record.id, activeSection.id, group.id, physicalId);
      const sheetLinks = linkCount(view, sheetTarget);
      return `<div class="mps-sheet${physicalId === String(activeSheet?.id || "") ? " active" : ""}"><button class="mps-sheet-open" data-open-sheet="${escapeHtml(`${group.id}|${physicalId}`)}">${escapeHtml(sheetTitle(sheet, index))}${sheetLinks ? ` · 🔗${sheetLinks}` : ""}</button><span class="mps-sheet-tools"><button class="mps-mini" title="Gắn PDF với tờ này" data-link-sheet="${escapeHtml(`${group.id}|${physicalId}`)}">⛓</button><button class="mps-mini" title="Đưa lên" data-sheet-up="${escapeHtml(`${group.id}|${physicalId}`)}">↑</button><button class="mps-mini" title="Đưa xuống" data-sheet-down="${escapeHtml(`${group.id}|${physicalId}`)}">↓</button><button class="mps-mini" title="Xóa tờ" data-delete-sheet="${escapeHtml(`${group.id}|${physicalId}`)}">⌫</button></span></div>`;
    }).join("")}</div>` : "";
    return `<article class="mps-page-card${group.id === activeLogicalId ? " active" : ""}"><div class="mps-page-head"><button class="mps-page-open" data-open-page="${escapeHtml(group.id)}"><strong>${escapeHtml(group.title)}</strong><small>${group.sheets.length} tờ${pageLinks ? ` · 🔗${pageLinks}` : ""}</small></button><span class="mps-page-tools"><button class="mps-mini" title="Thêm tờ" data-add-sheet="${escapeHtml(group.id)}">＋</button><button class="mps-mini" title="Gắn PDF với toàn Page" data-link-page="${escapeHtml(group.id)}">⛓</button><button class="mps-mini" title="Chuyển Section" data-move-page="${escapeHtml(group.id)}">↪</button><button class="mps-mini" title="Đổi tên Page" data-rename-page="${escapeHtml(group.id)}">✎</button><button class="mps-mini" title="Xóa Page" data-delete-page="${escapeHtml(group.id)}">⌫</button></span></div>${sheets}</article>`;
  }).join("");
  nav.innerHTML = `<div class="mps-bookbar"><button type="button" class="mps-book-icon" data-page-sheet-notebook-picker="1" title="Chọn Notebook" aria-label="Chọn Notebook">N</button><select class="mps-book-select" data-notebook-select aria-label="Notebook">${notebookOptions}</select><button type="button" class="mps-icon" data-new-notebook title="Tạo Notebook" aria-label="Tạo Notebook">＋</button><button type="button" class="mps-icon mps-sidebar-search-button" data-native-note-search="1" title="Tìm kiếm ghi chú" aria-label="Tìm kiếm ghi chú">⌕</button><button type="button" class="mps-notebook-more" data-page-sheet-notebook-more="1" title="Thao tác Notebook" aria-label="Thao tác Notebook" aria-expanded="false">⋯</button><button type="button" class="onenote-note-navigation-close" data-note-navigation-close="1" title="Đóng thanh điều hướng note" aria-label="Đóng thanh điều hướng note">×</button><div class="mps-notebook-menu"><button type="button" data-page-sheet-notebook-rename="1">Đổi tên Notebook</button><button type="button" class="danger" data-page-sheet-notebook-delete="1">Xóa Notebook</button></div></div><div class="mps-layout"><section class="mps-sections"><div class="mps-pane-head"><strong>Section</strong><button class="mps-add" data-add-section>＋</button></div><div class="mps-section-list">${sectionRows}</div></section><section class="mps-pages"><div class="mps-pane-head" style="border-top:3px solid ${sectionColor(activeSection.id)}"><strong>${escapeHtml(activeSection.title)}</strong><button class="mps-add" data-add-page>＋ Page</button></div><div class="mps-page-list">${pageRows || '<div class="mps-empty">Section này chưa có Page.<br>Chọn “＋ Page” để bắt đầu.</div>'}</div></section></div>`;
  return nav;
}

export function mountNavigator() {
  normalizePageSheetModel();
  const context = currentContext();
  const container = document.querySelector<HTMLElement>(".note-thumbnails");
  if (!context || !container) return;
  container.classList.add("onenote-navigation-active");
  const old = container.querySelector<HTMLElement>(`.${NAV_CLASS}`);
  const nav = renderNavigator(context);
  if (old?.dataset.signature === nav.dataset.signature) return;
  if (old) old.replaceWith(nav); else container.append(nav);
}

export function handleNavigatorClick(event: Event) {
  const element = (event.target as HTMLElement).closest<HTMLElement>("[data-page-sheet-notebook-picker],[data-native-note-search],[data-native-note-search-close],[data-native-note-search-open],[data-page-sheet-notebook-more],[data-page-sheet-notebook-rename],[data-page-sheet-notebook-delete],[data-note-navigation-close],[data-new-notebook],[data-add-section],[data-open-section],[data-rename-section],[data-delete-section],[data-add-page],[data-open-page],[data-add-sheet],[data-open-sheet],[data-link-page],[data-link-sheet],[data-rename-page],[data-delete-page],[data-delete-sheet],[data-sheet-up],[data-sheet-down],[data-move-page]");
  const nav = element?.closest<HTMLElement>(`.${NAV_CLASS}`);
  if (!element || !nav) return;
  event.preventDefault();

  const nativeTopbar = element.matches("[data-page-sheet-notebook-picker],[data-native-note-search],[data-native-note-search-close],[data-native-note-search-open],[data-page-sheet-notebook-more],[data-page-sheet-notebook-rename],[data-page-sheet-notebook-delete],[data-note-navigation-close]");
  if (nativeTopbar) event.stopImmediatePropagation();
  else event.stopPropagation();

  if (element.dataset.pageSheetNotebookPicker !== undefined) {
    closeNativeNotebookMenu(nav);
    openNativeNotebookPicker(nav);
    return;
  }
  if (element.dataset.nativeNoteSearch !== undefined) {
    closeNativeNotebookMenu(nav);
    openNativeSearch(nav);
    return;
  }
  if (element.dataset.nativeNoteSearchClose !== undefined) {
    closeNativeSearch(nav);
    return;
  }
  if (element.dataset.nativeNoteSearchOpen) {
    openNativeSearchResult(nav, element.dataset.nativeNoteSearchOpen, element.dataset.nativeNoteSearchValue || "");
    return;
  }
  if (element.dataset.pageSheetNotebookMore !== undefined) {
    if (nav.dataset.sidebarMode === "search") closeNativeSearch(nav);
    toggleNativeNotebookMenu(nav, element);
    return;
  }
  if (element.dataset.noteNavigationClose !== undefined) {
    closeNativeNotebookMenu(nav);
    hideNativeNoteSidebar(nav);
    return;
  }

  const context = currentContext();
  if (!context) return;
  const { record, activeSection, notebook, activeSheet } = context;
  const groups = pageGroups(notebook, activeSection);

  if (element.dataset.pageSheetNotebookRename !== undefined) {
    closeNativeNotebookMenu(nav);
    const title = window.prompt("Đổi tên Notebook", record.title)?.trim();
    if (title && renameNotebook(record.id, title)) window.location.reload();
    return;
  }
  if (element.dataset.pageSheetNotebookDelete !== undefined) {
    closeNativeNotebookMenu(nav);
    if (window.confirm(`Xóa Notebook “${record.title}”? PDF liên quan sẽ không bị xóa.`) && deleteNotebook(record.id)) window.location.reload();
    return;
  }
  if (element.dataset.newNotebook !== undefined) {
    const title = window.prompt("Tên Notebook", "Notebook mới")?.trim();
    if (title && createNotebook(title)) window.location.reload();
    return;
  }
  if (element.dataset.addSection !== undefined) {
    const title = window.prompt("Tên Section", "Section mới")?.trim();
    if (title && createSection(record.id, title)) window.location.reload();
    return;
  }
  if (element.dataset.openSection) {
    sessionStorage.setItem(`${ACTIVE_SECTION_KEY}${record.id}`, element.dataset.openSection);
    const section = record.sections.find((item) => item.id === element.dataset.openSection);
    const firstGroup = section ? pageGroups(notebook, section)[0] : undefined;
    if (section && firstGroup) openLogicalPage(record.id, section.id, firstGroup);
    else window.location.reload();
    return;
  }
  if (element.dataset.renameSection) {
    const section = record.sections.find((item) => item.id === element.dataset.renameSection);
    const title = window.prompt("Đổi tên Section", section?.title || "")?.trim();
    if (title && renameSection(record.id, element.dataset.renameSection, title)) window.location.reload();
    return;
  }
  if (element.dataset.deleteSection) {
    if (record.sections.length <= 1) return void window.alert("Notebook phải còn ít nhất một Section.");
    if (window.confirm("Xóa Section? Toàn bộ Page và các tờ sẽ được chuyển sang Section còn lại.")) {
      if (deleteSection(record.id, element.dataset.deleteSection)) window.location.reload();
    }
    return;
  }
  if (element.dataset.addPage !== undefined) {
    const title = window.prompt("Tên Page", "Page mới")?.trim();
    if (title && createLogicalPage(record.id, activeSection.id, title)) window.location.reload();
    return;
  }
  if (element.dataset.openPage) {
    const group = groups.find((item) => item.id === element.dataset.openPage);
    if (group) openLogicalPage(record.id, activeSection.id, group, activeLogicalSheetId(group, activeSheet));
    return;
  }
  if (element.dataset.addSheet) {
    addSheet(record.id, activeSection.id, element.dataset.addSheet);
    return;
  }
  if (element.dataset.openSheet) {
    const [logicalId, sheetId] = element.dataset.openSheet.split("|");
    openSheet(record.id, activeSection.id, logicalId, sheetId);
    return;
  }
  if (element.dataset.linkPage) {
    const group = groups.find((item) => item.id === element.dataset.linkPage);
    if (group) showLinkDialog(targetForGroup(record.id, activeSection.id, group), `Page “${group.title}”`);
    return;
  }
  if (element.dataset.linkSheet) {
    const [logicalId, sheetId] = element.dataset.linkSheet.split("|");
    const group = groups.find((item) => item.id === logicalId);
    const index = group?.sheets.findIndex((sheet) => String(sheet.id) === sheetId) ?? -1;
    if (group && index >= 0) showLinkDialog(targetForSheet(record.id, activeSection.id, logicalId, sheetId), `${group.title} / Tờ ${index + 1}`);
    return;
  }
  if (element.dataset.renamePage) {
    const group = groups.find((item) => item.id === element.dataset.renamePage);
    const title = window.prompt("Đổi tên Page", group?.title || "")?.trim();
    if (group && title && renameLogicalPage(record.id, group.id, title)) window.location.reload();
    return;
  }
  if (element.dataset.deletePage) {
    const group = groups.find((item) => item.id === element.dataset.deletePage);
    if (group && window.confirm(`Xóa Page “${group.title}” và toàn bộ ${group.sheets.length} tờ bên trong?`)) {
      if (deleteSheets(record.id, group.id)) window.location.reload();
    }
    return;
  }
  if (element.dataset.deleteSheet) {
    const [logicalId, sheetId] = element.dataset.deleteSheet.split("|");
    const group = groups.find((item) => item.id === logicalId);
    if (!group) return;
    if (group.sheets.length === 1) {
      if (window.confirm("Đây là tờ cuối cùng. Xóa tờ này sẽ xóa cả Page. Tiếp tục?")) {
        if (deleteSheets(record.id, logicalId)) window.location.reload();
      }
    } else if (window.confirm("Xóa tờ này? Nội dung và liên kết riêng của tờ sẽ bị xóa.")) {
      if (deleteSheets(record.id, logicalId, sheetId)) window.location.reload();
    }
    return;
  }
  if (element.dataset.sheetUp || element.dataset.sheetDown) {
    const encoded = element.dataset.sheetUp || element.dataset.sheetDown || "";
    const [logicalId, sheetId] = encoded.split("|");
    if (reorderSheet(record.id, activeSection.id, logicalId, sheetId, element.dataset.sheetUp ? -1 : 1)) window.location.reload();
    return;
  }
  if (element.dataset.movePage) {
    const logicalId = element.dataset.movePage;
    const options = record.sections.filter((section) => section.id !== activeSection.id);
    if (!options.length) return void window.alert("Notebook chưa có Section khác.");
    const answer = window.prompt(`Chuyển Page sang Section nào?\n${options.map((section, index) => `${index + 1}. ${section.title}`).join("\n")}`, "1")?.trim();
    const selected = options[Number(answer) - 1];
    if (selected && moveLogicalPage(record.id, logicalId, selected.id)) window.location.reload();
  }
}

export function activeLogicalSheetId(group: PageGroup, activeSheet: SheetPage | undefined) {
  const activeId = String(activeSheet?.id || "");
  return group.sheets.some((sheet) => String(sheet.id) === activeId) ? activeId : undefined;
}

export function handleNavigatorChange(event: Event) {
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>(`.${NAV_CLASS} [data-notebook-select]`);
  if (!select) return;
  const target = { type: "notebook", id: select.value, notebookId: select.value } as RelationTarget;
  if (openNoteTarget(target)) window.location.reload();
}
