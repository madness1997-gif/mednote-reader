const STYLE_ID = "mednote-library-names-only-style";

const style = `
.relation-library.rl-names-only .rl-body{gap:12px}
.relation-library.rl-names-only .rl-column{padding:12px}
.relation-library.rl-names-only .rl-column h3{margin:0 0 8px;font-size:14px}
.relation-library.rl-names-only .rl-list,.relation-library.rl-names-only .rl-tree{gap:2px}
.relation-library.rl-names-only .rl-card,
.relation-library.rl-names-only .rl-notebook{border:0;border-radius:8px;background:transparent;overflow:hidden}
.relation-library.rl-names-only .rl-card:hover,
.relation-library.rl-names-only .rl-notebook:hover{background:#f1f6f7}
.relation-library.rl-names-only .rl-card-main,
.relation-library.rl-names-only .rl-notebook-head{display:block}
.relation-library.rl-names-only .rl-open,
.relation-library.rl-names-only .rl-notebook-title{width:100%;display:block;padding:10px 9px;border:0;background:transparent;text-align:left;cursor:pointer}
.relation-library.rl-names-only .rl-name-only{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650;color:#2d454d}
.relation-library.rl-names-only .rl-empty{padding:18px 10px}
@media(max-width:820px){
  .relation-library.rl-names-only .rl-body{grid-template-columns:1fr 1fr;gap:8px;padding:10px}
  .relation-library.rl-names-only .rl-column{padding:9px}
  .relation-library.rl-names-only .rl-open,
  .relation-library.rl-names-only .rl-notebook-title{padding:9px 7px}
  .relation-library.rl-names-only .rl-name-only{font-size:13px}
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = style;
  document.head.append(element);
}

function simplifyHeadings(panel: HTMLElement) {
  const columns = panel.querySelectorAll<HTMLElement>(".rl-column");
  if (columns[0]) {
    const heading = columns[0].querySelector<HTMLElement>("h3");
    if (heading && heading.dataset.namesOnly !== "1") {
      heading.textContent = "PDF";
      heading.dataset.namesOnly = "1";
    }
  }
  if (columns[1]) {
    const heading = columns[1].querySelector<HTMLElement>("h3");
    if (heading && heading.dataset.namesOnly !== "1") {
      heading.textContent = "Notebook";
      heading.dataset.namesOnly = "1";
    }
  }
}

function simplifyPdfRows(panel: HTMLElement) {
  panel.querySelectorAll<HTMLElement>(".rl-card").forEach((card) => {
    if (card.dataset.namesOnly === "1") return;
    const opener = card.querySelector<HTMLButtonElement>(".rl-open");
    if (!opener) return;
    const name = opener.querySelector<HTMLElement>("strong")?.textContent?.trim() || opener.textContent?.trim() || "PDF";
    opener.replaceChildren();
    const label = document.createElement("span");
    label.className = "rl-name-only";
    label.textContent = name;
    opener.append(label);
    opener.title = name;
    card.querySelector(".rl-actions")?.remove();
    card.querySelector(".rl-relations")?.remove();
    card.dataset.namesOnly = "1";
  });
}

function simplifyNotebookRows(panel: HTMLElement) {
  const tree = panel.querySelector<HTMLElement>(".rl-tree");
  if (!tree || tree.dataset.namesOnly === "1") return;

  const rows = Array.from(tree.children).flatMap((child) => {
    if (!(child instanceof HTMLElement) || !child.matches(".rl-notebook")) return [];
    const opener = child.querySelector<HTMLButtonElement>(".rl-notebook-title");
    if (!opener) return [];
    const name = opener.querySelector<HTMLElement>("strong")?.textContent?.trim() || opener.textContent?.trim() || "Notebook";
    const target = opener.getAttribute("data-open-target");
    if (!target) return [];
    return [{ name, target }];
  });

  if (!rows.length) {
    tree.dataset.namesOnly = "1";
    return;
  }

  tree.replaceChildren(...rows.map(({ name, target }) => {
    const article = document.createElement("article");
    article.className = "rl-notebook";
    article.dataset.namesOnly = "1";
    const head = document.createElement("div");
    head.className = "rl-notebook-head";
    const button = document.createElement("button");
    button.className = "rl-notebook-title";
    button.setAttribute("data-open-target", target);
    button.title = name;
    const label = document.createElement("span");
    label.className = "rl-name-only";
    label.textContent = name;
    button.append(label);
    head.append(button);
    article.append(head);
    return article;
  }));
  tree.dataset.namesOnly = "1";
}

function simplifyPanel(panel: HTMLElement) {
  panel.classList.add("rl-names-only");
  simplifyHeadings(panel);
  simplifyPdfRows(panel);
  simplifyNotebookRows(panel);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(".relation-library").forEach(simplifyPanel);
  });
}

injectStyle();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", schedule, { once: true }) : schedule();

export {};
