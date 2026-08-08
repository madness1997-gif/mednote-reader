import { getLibraryView } from "./independent-library-core";

const STYLE_ID = "mednote-relation-library-three-groups-style";
const PANEL_CLASS = "rl-three-groups";

const style = `
.relation-library.${PANEL_CLASS}{
  position:fixed!important;
  inset:0 auto 0 0!important;
  z-index:1002!important;
  width:min(430px,92vw)!important;
  max-width:92vw!important;
  height:100vh!important;
  height:100dvh!important;
  max-height:100dvh!important;
  border-width:0 1px 0 0!important;
  border-radius:0!important;
  background:#f7f9fa!important;
  box-shadow:16px 0 44px rgba(18,35,49,.22)!important;
}
.relation-library.${PANEL_CLASS} .rl-head{padding:13px 14px!important}
.relation-library.${PANEL_CLASS} .rl-head strong{font-size:17px!important}
.relation-library.${PANEL_CLASS} .rl-tools{gap:7px!important;padding:9px 12px!important}
.relation-library.${PANEL_CLASS} .rl-primary,
.relation-library.${PANEL_CLASS} .rl-secondary{min-height:34px!important;padding:7px 10px!important;border-radius:8px!important;font-size:11px!important}
.relation-library.${PANEL_CLASS} .rl-body{display:flex!important;flex-direction:column!important;gap:14px!important;padding:12px!important;overflow:auto!important}
.relation-library.${PANEL_CLASS} .rl-three-group{display:flex;flex-direction:column;gap:6px}
.relation-library.${PANEL_CLASS} .rl-three-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px}
.relation-library.${PANEL_CLASS} .rl-three-group-head strong{font-size:12px;font-weight:800;color:#334c55}
.relation-library.${PANEL_CLASS} .rl-three-group-head small{font-size:9px;color:#8a999e}
.relation-library.${PANEL_CLASS} .rl-three-items{display:grid;gap:3px}
.relation-library.${PANEL_CLASS} .rl-card,
.relation-library.${PANEL_CLASS} .rl-notebook{border:1px solid #e0e7e9!important;border-radius:8px!important;background:#fff!important}
.relation-library.${PANEL_CLASS} .rl-card:hover,
.relation-library.${PANEL_CLASS} .rl-notebook:hover{border-color:#9fc1c7!important;background:#f3f8f8!important}
.relation-library.${PANEL_CLASS} .rl-open,
.relation-library.${PANEL_CLASS} .rl-notebook-title{padding:9px 10px!important}
.relation-library.${PANEL_CLASS} .rl-name-only{font-size:12px!important;font-weight:650!important;color:#314850!important}
.relation-library.${PANEL_CLASS} .rl-three-empty{padding:11px 10px;border:1px dashed #d3dde0;border-radius:8px;background:#fbfcfc;color:#8a999e;font-size:10px;text-align:center}
@media(max-width:520px){
  .relation-library.${PANEL_CLASS}{width:min(310px,88vw)!important;max-width:88vw!important}
  .relation-library.${PANEL_CLASS} .rl-head{padding:10px 12px!important}
  .relation-library.${PANEL_CLASS} .rl-tools{padding:7px 10px!important}
  .relation-library.${PANEL_CLASS} .rl-body{padding:10px!important;gap:12px!important}
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function notebookIdOf(article: HTMLElement) {
  const opener = article.querySelector<HTMLElement>("[data-open-target]");
  const raw = opener?.dataset.openTarget;
  if (!raw) return "";
  try {
    const target = JSON.parse(raw) as { notebookId?: string; id?: string };
    return target.notebookId || target.id || "";
  } catch {
    return "";
  }
}

function isLinkedNotebook(notebookId: string) {
  const view = getLibraryView();
  if (!view || !notebookId) return false;
  return view.relations.some((relation) => relation.target.notebookId === notebookId && relation.target.type !== "block");
}

function makeGroup(title: string, items: HTMLElement[]) {
  const section = document.createElement("section");
  section.className = "rl-three-group";

  const head = document.createElement("header");
  head.className = "rl-three-group-head";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const count = document.createElement("small");
  count.textContent = String(items.length);
  head.append(strong, count);

  const body = document.createElement("div");
  body.className = "rl-three-items";
  if (items.length) body.append(...items);
  else {
    const empty = document.createElement("div");
    empty.className = "rl-three-empty";
    empty.textContent = "Chưa có";
    body.append(empty);
  }

  section.append(head, body);
  return section;
}

function organizePanel(panel: HTMLElement) {
  if (panel.dataset.threeGroups === "1") return;
  if (!panel.classList.contains("rl-names-only")) return;

  const body = panel.querySelector<HTMLElement>(":scope > .rl-body");
  if (!body) return;
  const columns = Array.from(body.querySelectorAll<HTMLElement>(":scope > .rl-column"));
  if (columns.length < 2) return;

  const pdfItems = Array.from(columns[0].querySelectorAll<HTMLElement>(".rl-card"));
  const notebooks = Array.from(columns[1].querySelectorAll<HTMLElement>(".rl-notebook"));
  const linked: HTMLElement[] = [];
  const standalone: HTMLElement[] = [];

  notebooks.forEach((notebook) => {
    (isLinkedNotebook(notebookIdOf(notebook)) ? linked : standalone).push(notebook);
  });

  body.replaceChildren(
    makeGroup("Tài liệu PDF", pdfItems),
    makeGroup("Note gắn tài liệu", linked),
    makeGroup("Note độc lập", standalone),
  );

  panel.classList.add(PANEL_CLASS);
  panel.dataset.threeGroups = "1";
  const heading = panel.querySelector<HTMLElement>(":scope > .rl-head > strong");
  if (heading) heading.textContent = "Thư viện";
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(".relation-library").forEach(organizePanel);
  });
}

injectStyle();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();
window.setInterval(schedule, 700);

export {};
