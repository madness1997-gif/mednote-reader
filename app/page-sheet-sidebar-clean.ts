const STYLE_ID = "mednote-page-sheet-sidebar-clean-style";
const NAV_CLASS = "mednote-page-sheet-nav";
const MORE_CLASS = "mps-sidebar-more";
const OPEN_CLASS = "mps-tools-open";
const CLOSE_CLASS = "onenote-note-navigation-close";
const RAIL_CLASS = "mps-onenote-rail";
const UTILITY_CLASS = "mps-sidebar-utility";
const RECENT_KEY = "mednote-note-sidebar-recents-v1";
const PENDING_KEY = "mednote-note-sidebar-pending-v1";

type SidebarMode = "navigation" | "search" | "recent";
type RecentItem = {
  notebookId: string;
  sectionId: string;
  kind: "page" | "sheet";
  value: string;
  title: string;
  openedAt: number;
};

const style = `
/* The OneNote-style Page→Sheet navigator is the single note navigation source. */
.note-navigation-host:has(> .${NAV_CLASS}) > .${NAV_CLASS}{display:grid!important;visibility:visible!important;opacity:1!important}

/* OneNote-like structure: slim command rail + Sections column + Pages column. */
.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(360px,31vw,430px)!important}
.note-navigation-host.onenote-navigation-active:has(> .${NAV_CLASS}){width:100%!important;min-width:0!important;max-width:none!important;resize:none!important;background:#fff!important;border-left:1px solid #e2e5e7!important}
.${NAV_CLASS}{min-height:0!important;grid-template-columns:44px minmax(0,1fr)!important;grid-template-rows:42px minmax(0,1fr)!important;background:#fff!important;color:#263238!important;overflow:hidden!important}
.${NAV_CLASS} .mps-bookbar{grid-column:2!important;grid-row:1!important;height:42px!important;display:flex!important;align-items:center!important;gap:4px!important;padding:5px 7px!important;background:#fff!important;border-bottom:1px solid #e5e8ea!important;overflow:visible!important}
.${NAV_CLASS} .mps-book-icon{width:24px!important;height:24px!important;border-radius:4px!important;background:#7719aa!important;color:#fff!important;font-size:9px!important}
.${NAV_CLASS} .mps-book-select{height:30px!important;padding:0 6px!important;font-size:12px!important;color:#263238!important}
.${NAV_CLASS} .mps-icon{width:28px!important;height:28px!important;color:#5f6368!important}
.${NAV_CLASS} .${CLOSE_CLASS}{display:grid!important;visibility:visible!important;opacity:1!important;flex:0 0 30px!important;width:30px!important;height:30px!important;margin-left:1px!important;padding:0!important;place-items:center!important;border:1px solid #dedfe2!important;border-radius:7px!important;background:#fff!important;color:#555!important;font-size:18px!important;line-height:1!important;cursor:pointer!important;box-shadow:none!important}
.${NAV_CLASS} .${CLOSE_CLASS}:hover{background:#f0f1f2!important;color:#222!important}

.${NAV_CLASS} .${RAIL_CLASS}{grid-column:1!important;grid-row:1 / span 2!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;padding:5px 5px!important;border-right:1px solid #e2e4e6!important;background:#f7f7f8!important}
.${NAV_CLASS} .mps-rail-button{position:relative;width:34px;height:36px;display:grid;place-items:center;margin:1px 0;border:0;border-radius:6px;background:transparent;color:#656b70;font-size:18px;line-height:1;cursor:pointer}
.${NAV_CLASS} .mps-rail-button:hover{background:#ececef;color:#333}
.${NAV_CLASS} .mps-rail-button.active{background:#eee7f3;color:#6f238f}
.${NAV_CLASS} .mps-rail-button.active::before{content:"";position:absolute;left:-5px;top:5px;bottom:5px;width:3px;border-radius:0 3px 3px 0;background:#7719aa}
.${NAV_CLASS} .mps-rail-spacer{flex:1}

.${NAV_CLASS} .mps-layout{grid-column:2!important;grid-row:2!important;display:grid!important;grid-template-columns:128px minmax(0,1fr)!important;min-height:0!important;background:#fff!important}
.${NAV_CLASS}[data-sidebar-mode="search"] .mps-layout,
.${NAV_CLASS}[data-sidebar-mode="recent"] .mps-layout{display:none!important}
.${NAV_CLASS} .mps-sections{min-width:0!important;max-height:none!important;display:flex!important;flex-direction:column!important;border-right:1px solid #dedede!important;border-bottom:0!important;background:#f4f4f5!important}
.${NAV_CLASS} .mps-pages{min-width:0!important;display:flex!important;flex-direction:column!important;background:#fff!important}
.${NAV_CLASS} .mps-pane-head{min-height:37px!important;padding:4px 7px!important;border-bottom:1px solid #e6e6e7!important;background:#fff!important}
.${NAV_CLASS} .mps-pane-head strong{font-size:11px!important;text-transform:none!important;letter-spacing:0!important;color:#4b5054!important}
.${NAV_CLASS} .mps-add{height:27px!important;padding:0 6px!important;border-radius:6px!important;color:#6d3b8f!important;font-size:11px!important}
.${NAV_CLASS} .mps-section-list,.${NAV_CLASS} .mps-page-list{min-height:0!important;flex:1!important;overflow:auto!important;scrollbar-width:thin!important}

.${NAV_CLASS} .mps-section-list{display:block!important;padding:0!important}
.${NAV_CLASS} .mps-section{position:relative!important;width:100%!important;max-width:none!important;min-height:39px!important;display:flex!important;align-items:stretch!important;margin:0!important;border:0!important;border-bottom:1px solid #e4e4e5!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
.${NAV_CLASS} .mps-section::before{width:5px!important;align-self:stretch!important;border-radius:0!important}
.${NAV_CLASS} .mps-section-copy{min-width:0!important;flex:1!important;display:block!important;padding:11px 6px!important}
.${NAV_CLASS} .mps-section-copy strong{display:block!important;max-width:none!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:11px!important;font-weight:600!important;color:#333!important}
.${NAV_CLASS} .mps-section-copy small{display:none!important}
.${NAV_CLASS} .mps-section.active{border-color:#e4e4e5!important;background:#fff!important;box-shadow:none!important}
.${NAV_CLASS} .mps-section.active .mps-section-copy strong{font-weight:750!important;color:#222!important}
.${NAV_CLASS} .mps-section:hover{background:#e9e9ea!important}

.${NAV_CLASS} .mps-page-list{padding:0!important;background:#fff!important}
.${NAV_CLASS} .mps-page-card{position:relative!important;margin:0!important;border:0!important;border-bottom:1px solid #ececee!important;border-radius:0!important;background:#fff!important;overflow:visible!important}
.${NAV_CLASS} .mps-page-card.active{border-color:#ececee!important;background:#eee7f3!important;box-shadow:inset 3px 0 #7719aa!important}
.${NAV_CLASS} .mps-page-head{min-height:41px!important;padding-right:3px!important}
.${NAV_CLASS} .mps-page-open{padding:9px 8px 9px 11px!important}
.${NAV_CLASS} .mps-page-open strong{font-size:12px!important;font-weight:600!important;color:#303438!important}
.${NAV_CLASS} .mps-page-open small{display:none!important}
.${NAV_CLASS} .mps-page-card:hover{background:#f4f4f5!important}

.${NAV_CLASS} .mps-sheets{margin:0 7px 7px 16px!important;padding:2px 0 2px 7px!important;border-left:1px solid #d8c9e3!important;background:transparent!important}
.${NAV_CLASS} .mps-sheet{position:relative!important;min-height:29px!important;border-top:0!important;border-radius:5px!important}
.${NAV_CLASS} .mps-sheet+.mps-sheet{margin-top:2px!important}
.${NAV_CLASS} .mps-sheet.active{background:#e5dced!important}
.${NAV_CLASS} .mps-sheet-open{padding:6px 7px!important;font-size:10.5px!important;color:#575d61!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.${NAV_CLASS} .mps-sheet.active .mps-sheet-open{color:#5d2b79!important}

/* Keep item actions available without visual clutter. */
.${NAV_CLASS} .mps-page-tools,
.${NAV_CLASS} .mps-sheet-tools,
.${NAV_CLASS} .mps-section-actions{display:none!important;position:absolute!important;z-index:30!important;gap:2px!important;padding:3px!important;border:1px solid #dfe4e6!important;border-radius:8px!important;background:#fff!important;box-shadow:0 7px 22px #24323a26!important}
.${NAV_CLASS} .mps-page-card.${OPEN_CLASS} .mps-page-tools{display:flex!important;top:34px!important;right:4px!important}
.${NAV_CLASS} .mps-sheet.${OPEN_CLASS} .mps-sheet-tools{display:flex!important;top:25px!important;right:2px!important}
.${NAV_CLASS} .mps-section.${OPEN_CLASS} .mps-section-actions{display:flex!important;top:31px!important;right:2px!important}
.${NAV_CLASS} .mps-mini{width:25px!important;height:25px!important;border-radius:6px!important;font-size:11px!important}
.${NAV_CLASS} .${MORE_CLASS}{flex:0 0 auto;width:26px;height:26px;margin-right:3px;border:0;border-radius:6px;background:transparent;color:#727b80;font-size:16px;line-height:1;cursor:pointer}
.${NAV_CLASS} .${MORE_CLASS}:hover,.${NAV_CLASS} .${MORE_CLASS}:focus-visible{background:#eceff1;color:#343a3e;outline:none}
.${NAV_CLASS} .mps-section>.${MORE_CLASS}{width:22px;height:26px;margin:auto 2px auto 0;font-size:14px}
.${NAV_CLASS} .mps-sheet>.${MORE_CLASS}{width:22px;height:23px;margin-right:1px;font-size:14px}

/* Search / Recent Notes occupy the same content area; no fake buttons. */
.${NAV_CLASS} .${UTILITY_CLASS}{grid-column:2!important;grid-row:2!important;min-height:0!important;display:none!important;flex-direction:column!important;background:#fff!important}
.${NAV_CLASS}[data-sidebar-mode="search"] .${UTILITY_CLASS},.${NAV_CLASS}[data-sidebar-mode="recent"] .${UTILITY_CLASS}{display:flex!important}
.${NAV_CLASS} .mps-utility-head{min-height:39px;display:flex;align-items:center;gap:7px;padding:6px 8px;border-bottom:1px solid #e5e6e7;background:#fafafa}
.${NAV_CLASS} .mps-utility-head strong{min-width:0;flex:1;font-size:12px;color:#383d41}
.${NAV_CLASS} .mps-search-input{width:100%;height:33px;padding:0 10px;border:1px solid #d4d7d9;border-radius:7px;background:#fff;color:#2e3337;font-size:12px;outline:none}
.${NAV_CLASS} .mps-search-input:focus{border-color:#9d6bb6;box-shadow:0 0 0 2px #efe6f4}
.${NAV_CLASS} .mps-utility-body{min-height:0;flex:1;overflow:auto;padding:6px;background:#fff}
.${NAV_CLASS} .mps-utility-empty{padding:28px 12px;color:#858b8f;text-align:center;font-size:11px;line-height:1.5}
.${NAV_CLASS} .mps-utility-result{width:100%;min-height:38px;display:flex;align-items:center;gap:8px;padding:8px 9px;border:0;border-radius:6px;background:transparent;text-align:left;cursor:pointer}
.${NAV_CLASS} .mps-utility-result:hover{background:#f1f1f2}
.${NAV_CLASS} .mps-utility-dot{width:6px;height:24px;flex:0 0 6px;border-radius:4px;background:#b7a0c4}
.${NAV_CLASS} .mps-utility-result span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:#34393c}
.${NAV_CLASS} .mps-utility-result small{flex:0 0 auto;color:#9a9da0;font-size:9px}

@media(max-width:900px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:350px!important}.${NAV_CLASS} .mps-layout{grid-template-columns:116px minmax(0,1fr)!important}}
@media(max-width:650px){
  .workspace.onenote-right-navigation-layout{--onenote-nav-width:300px!important}
  .${NAV_CLASS}{grid-template-columns:40px minmax(0,1fr)!important}
  .${NAV_CLASS} .${RAIL_CLASS}{padding-left:3px!important;padding-right:3px!important}
  .${NAV_CLASS} .mps-rail-button{width:33px!important}
  .${NAV_CLASS} .mps-layout{grid-template-columns:96px minmax(0,1fr)!important}
  .${NAV_CLASS} .mps-section-copy{padding-left:5px!important;padding-right:4px!important}
  .${NAV_CLASS} .mps-page-open strong{font-size:11px!important}
  .${NAV_CLASS} .${CLOSE_CLASS}{flex-basis:30px!important;width:30px!important;height:30px!important}
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function readRecents(): RecentItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && item.title && item.value).slice(0, 14) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: RecentItem[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 14)));
}

function currentNotebookId(nav: HTMLElement) {
  return nav.querySelector<HTMLSelectElement>("[data-notebook-select]")?.value || "";
}

function currentSectionId(nav: HTMLElement) {
  return nav.querySelector<HTMLElement>(".mps-section.active")?.dataset.openSection || "";
}

function rememberRecent(nav: HTMLElement, target: HTMLElement) {
  const page = target.closest<HTMLElement>("[data-open-page]");
  const sheet = target.closest<HTMLElement>("[data-open-sheet]");
  if (!page && !sheet) return;
  const kind: RecentItem["kind"] = sheet ? "sheet" : "page";
  const value = sheet?.dataset.openSheet || page?.dataset.openPage || "";
  const title = (sheet?.textContent || page?.querySelector("strong")?.textContent || page?.textContent || "").trim();
  if (!value || !title) return;
  const item: RecentItem = {
    notebookId: currentNotebookId(nav),
    sectionId: currentSectionId(nav),
    kind,
    value,
    title,
    openedAt: Date.now(),
  };
  const key = `${item.notebookId}|${item.sectionId}|${item.kind}|${item.value}`;
  writeRecents([item, ...readRecents().filter((existing) => `${existing.notebookId}|${existing.sectionId}|${existing.kind}|${existing.value}` !== key)]);
}

function modeOf(nav: HTMLElement): SidebarMode {
  const mode = nav.dataset.sidebarMode;
  return mode === "search" || mode === "recent" ? mode : "navigation";
}

function updateRailState(nav: HTMLElement) {
  const mode = modeOf(nav);
  nav.querySelectorAll<HTMLButtonElement>(`.${RAIL_CLASS} [data-sidebar-mode-button]`).forEach((button) => {
    const active = button.dataset.sidebarModeButton === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setMode(nav: HTMLElement, mode: SidebarMode) {
  nav.dataset.sidebarMode = mode;
  updateRailState(nav);
  renderUtility(nav);
  if (mode === "search") requestAnimationFrame(() => nav.querySelector<HTMLInputElement>(".mps-search-input")?.focus());
}

function ensureRail(nav: HTMLElement) {
  if (nav.querySelector(`:scope > .${RAIL_CLASS}`)) return;
  const rail = document.createElement("nav");
  rail.className = RAIL_CLASS;
  rail.setAttribute("aria-label", "Điều hướng ghi chú");
  rail.innerHTML = `
    <button type="button" class="mps-rail-button active" data-sidebar-mode-button="navigation" title="Điều hướng" aria-label="Điều hướng" aria-pressed="true">▥</button>
    <button type="button" class="mps-rail-button" data-sidebar-mode-button="search" title="Tìm kiếm ghi chú" aria-label="Tìm kiếm ghi chú" aria-pressed="false">⌕</button>
    <button type="button" class="mps-rail-button" data-sidebar-mode-button="recent" title="Ghi chú gần đây" aria-label="Ghi chú gần đây" aria-pressed="false">◷</button>
    <span class="mps-rail-spacer"></span>`;
  nav.prepend(rail);
}

function ensureUtility(nav: HTMLElement) {
  let panel = nav.querySelector<HTMLElement>(`:scope > .${UTILITY_CLASS}`);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = UTILITY_CLASS;
    nav.append(panel);
  }
  return panel;
}

function searchEntries(nav: HTMLElement, query: string) {
  const normalized = query.trim().toLocaleLowerCase("vi");
  if (!normalized) return [] as { kind: string; value: string; title: string }[];
  const entries: { kind: string; value: string; title: string }[] = [];
  nav.querySelectorAll<HTMLElement>(".mps-section[data-open-section]").forEach((element) => {
    const title = (element.querySelector("strong")?.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "section", value: element.dataset.openSection || "", title });
  });
  nav.querySelectorAll<HTMLElement>(".mps-page-open[data-open-page]").forEach((element) => {
    const title = (element.querySelector("strong")?.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "page", value: element.dataset.openPage || "", title });
  });
  nav.querySelectorAll<HTMLElement>(".mps-sheet-open[data-open-sheet]").forEach((element) => {
    const title = (element.textContent || "").trim();
    if (title.toLocaleLowerCase("vi").includes(normalized)) entries.push({ kind: "sheet", value: element.dataset.openSheet || "", title });
  });
  return entries.slice(0, 40);
}

function renderSearchResults(nav: HTMLElement, input: HTMLInputElement, body: HTMLElement) {
  const entries = searchEntries(nav, input.value);
  body.innerHTML = entries.length
    ? entries.map((entry) => `<button type="button" class="mps-utility-result" data-search-open-kind="${entry.kind}" data-search-open-value="${escapeHtml(entry.value)}"><i class="mps-utility-dot"></i><span>${escapeHtml(entry.title)}</span><small>${entry.kind === "section" ? "Section" : entry.kind === "sheet" ? "Tờ" : "Page"}</small></button>`).join("")
    : `<div class="mps-utility-empty">${input.value.trim() ? "Không tìm thấy tên phù hợp trong phần đang hiển thị." : "Nhập tên Section, Page hoặc tờ để tìm."}</div>`;
}

function renderUtility(nav: HTMLElement) {
  const panel = ensureUtility(nav);
  const mode = modeOf(nav);
  if (mode === "navigation") {
    panel.innerHTML = "";
    return;
  }
  if (mode === "search") {
    panel.innerHTML = `<div class="mps-utility-head"><strong>Tìm kiếm</strong></div><div style="padding:7px 8px;border-bottom:1px solid #ececee"><input class="mps-search-input" type="search" placeholder="Tìm theo tên…" aria-label="Tìm ghi chú"></div><div class="mps-utility-body"></div>`;
    const input = panel.querySelector<HTMLInputElement>(".mps-search-input")!;
    const body = panel.querySelector<HTMLElement>(".mps-utility-body")!;
    renderSearchResults(nav, input, body);
    input.addEventListener("input", () => renderSearchResults(nav, input, body));
    return;
  }
  const recents = readRecents();
  panel.innerHTML = `<div class="mps-utility-head"><strong>Ghi chú gần đây</strong></div><div class="mps-utility-body">${recents.length ? recents.map((item, index) => `<button type="button" class="mps-utility-result" data-recent-index="${index}"><i class="mps-utility-dot"></i><span>${escapeHtml(item.title)}</span><small>${item.kind === "sheet" ? "Tờ" : "Page"}</small></button>`).join("") : '<div class="mps-utility-empty">Chưa có ghi chú gần đây.</div>'}</div>`;
}

function ensureCloseButton(nav: HTMLElement) {
  const bookbar = nav.querySelector<HTMLElement>(":scope > .mps-bookbar");
  if (!bookbar || bookbar.querySelector(`.${CLOSE_CLASS}`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = CLOSE_CLASS;
  button.dataset.noteNavigationClose = "1";
  button.title = "Ẩn sidebar note";
  button.setAttribute("aria-label", "Ẩn sidebar note");
  button.textContent = "×";
  bookbar.append(button);
}

function addMoreButton(owner: HTMLElement, toolsSelector: string) {
  if (owner.querySelector(`:scope > .${MORE_CLASS}`) || owner.querySelector(`:scope > .mps-page-head > .${MORE_CLASS}`)) return;
  const tools = owner.querySelector<HTMLElement>(toolsSelector);
  if (!tools || !tools.children.length) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = MORE_CLASS;
  button.dataset.sidebarMore = "1";
  button.setAttribute("aria-label", "Thêm thao tác");
  button.title = "Thêm thao tác";
  button.textContent = "⋯";
  if (owner.matches(".mps-page-card")) owner.querySelector(":scope > .mps-page-head")?.insertBefore(button, tools);
  else owner.insertBefore(button, tools);
}

function findOpenElement(nav: HTMLElement, kind: RecentItem["kind"], value: string) {
  return kind === "sheet"
    ? Array.from(nav.querySelectorAll<HTMLElement>("[data-open-sheet]")).find((element) => element.dataset.openSheet === value)
    : Array.from(nav.querySelectorAll<HTMLElement>("[data-open-page]")).find((element) => element.dataset.openPage === value);
}

function continuePending(nav: HTMLElement) {
  let pending: RecentItem | null = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); } catch { pending = null; }
  if (!pending) return;
  const notebookId = currentNotebookId(nav);
  if (pending.notebookId && notebookId !== pending.notebookId) {
    const select = nav.querySelector<HTMLSelectElement>("[data-notebook-select]");
    if (select && Array.from(select.options).some((option) => option.value === pending!.notebookId)) {
      select.value = pending.notebookId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  const sectionId = currentSectionId(nav);
  if (pending.sectionId && sectionId !== pending.sectionId) {
    const section = Array.from(nav.querySelectorAll<HTMLElement>("[data-open-section]")).find((element) => element.dataset.openSection === pending!.sectionId);
    if (section) section.click(); else sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  const target = findOpenElement(nav, pending.kind, pending.value);
  if (!target) {
    sessionStorage.removeItem(PENDING_KEY);
    return;
  }
  sessionStorage.removeItem(PENDING_KEY);
  target.click();
}

function openRecent(nav: HTMLElement, item: RecentItem) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(item));
  continuePending(nav);
}

function openSearchResult(nav: HTMLElement, kind: string, value: string) {
  const selector = kind === "section" ? "[data-open-section]" : kind === "sheet" ? "[data-open-sheet]" : "[data-open-page]";
  const datasetKey = kind === "section" ? "openSection" : kind === "sheet" ? "openSheet" : "openPage";
  const target = Array.from(nav.querySelectorAll<HTMLElement>(selector)).find((element) => element.dataset[datasetKey as keyof DOMStringMap] === value);
  target?.click();
}

function prepareNavigator(nav: HTMLElement) {
  nav.dataset.cleanSidebar = "1";
  if (!nav.dataset.sidebarMode) nav.dataset.sidebarMode = "navigation";
  const aside = nav.parentElement;
  if (aside?.classList.contains("note-navigation-host")) {
    const legacy = aside.querySelector<HTMLElement>(":scope > .onenote-note-navigation");
    if (legacy) {
      legacy.style.setProperty("display", "none", "important");
      legacy.style.setProperty("visibility", "hidden", "important");
      legacy.style.setProperty("pointer-events", "none", "important");
      legacy.setAttribute("aria-hidden", "true");
    }
  }
  ensureRail(nav);
  ensureCloseButton(nav);
  /* Sheet creation has one home: the + button on the note toolbar. */
  nav.querySelectorAll<HTMLElement>("[data-add-sheet]").forEach((button) => button.remove());
  nav.querySelectorAll<HTMLElement>(".mps-page-card").forEach((owner) => addMoreButton(owner, ":scope > .mps-page-head > .mps-page-tools"));
  nav.querySelectorAll<HTMLElement>(".mps-sheet").forEach((owner) => addMoreButton(owner, ":scope > .mps-sheet-tools"));
  nav.querySelectorAll<HTMLElement>(".mps-section").forEach((owner) => addMoreButton(owner, ":scope > .mps-section-actions"));
  updateRailState(nav);
  if (modeOf(nav) !== "navigation" && !nav.querySelector(`:scope > .${UTILITY_CLASS}`)?.children.length) renderUtility(nav);
  continuePending(nav);
}

function closeOthers(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>(`.${NAV_CLASS} .${OPEN_CLASS}`).forEach((owner) => {
    if (owner !== except) owner.classList.remove(OPEN_CLASS);
  });
}

function handleWindowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const nav = target?.closest<HTMLElement>(`.${NAV_CLASS}`);
  if (nav) {
    const modeButton = target?.closest<HTMLButtonElement>("[data-sidebar-mode-button]");
    if (modeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMode(nav, modeButton.dataset.sidebarModeButton as SidebarMode);
      return;
    }
    const searchResult = target?.closest<HTMLButtonElement>("[data-search-open-kind][data-search-open-value]");
    if (searchResult) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSearchResult(nav, searchResult.dataset.searchOpenKind || "page", searchResult.dataset.searchOpenValue || "");
      return;
    }
    const recentButton = target?.closest<HTMLButtonElement>("[data-recent-index]");
    if (recentButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const item = readRecents()[Number(recentButton.dataset.recentIndex)];
      if (item) openRecent(nav, item);
      return;
    }
    if (target?.closest("[data-open-page],[data-open-sheet]")) rememberRecent(nav, target);
  }

  const more = target?.closest<HTMLButtonElement>(`.${NAV_CLASS} .${MORE_CLASS}[data-sidebar-more]`);
  if (more) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const owner = more.closest<HTMLElement>(".mps-page-card,.mps-sheet,.mps-section");
    if (!owner) return;
    const opening = !owner.classList.contains(OPEN_CLASS);
    closeOthers(owner);
    owner.classList.toggle(OPEN_CLASS, opening);
    return;
  }
  if (!target?.closest(`.${NAV_CLASS} .mps-page-tools,.${NAV_CLASS} .mps-sheet-tools,.${NAV_CLASS} .mps-section-actions`)) closeOthers();
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(`.${NAV_CLASS}`).forEach(prepareNavigator);
  });
}

injectStyle();
window.addEventListener("click", handleWindowClick, true);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 900);

export {};
