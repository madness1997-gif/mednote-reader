import {
  getLibraryView, relationTargetLabel, targetKey, titleOf,
  type LibraryView, type Relation, type RelationSource, type RelationTarget,
} from "./independent-library-core";
import { requestText } from "./mednote-dialog";

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
export const encodeSource = (source: RelationSource) => `${source.type}:${source.id}`;
export const decodeSource = (value: string): RelationSource => {
  const [type, ...rest] = value.split(":");
  return { type: type as RelationSource["type"], id: rest.join(":") };
};
export const reload = () => window.location.reload();

const style = `
.relation-library{position:relative;z-index:4;width:min(1180px,calc(100vw - 34px));max-height:min(880px,calc(100vh - 34px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd6d9;border-radius:18px;background:#f5f8f8;box-shadow:0 26px 90px #15282f4f;color:#24383f}.rl-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #dce4e6;background:#fff}.rl-head strong{font-size:20px}.rl-close,.rl-icon-btn{border:0;background:transparent;cursor:pointer;border-radius:9px}.rl-close{width:36px;height:36px;font-size:18px}.rl-close:hover,.rl-icon-btn:hover{background:#e9f0f1}.rl-tools{display:flex;flex-wrap:wrap;gap:10px;padding:14px 22px;background:#fff;border-bottom:1px solid #e1e7e9}.rl-primary,.rl-secondary{min-height:40px;padding:9px 14px;border-radius:11px;cursor:pointer;font-weight:700}.rl-primary{border:1px solid #1d7181;background:#1d7181;color:#fff}.rl-secondary{border:1px solid #c5d4d7;background:#f7fafb;color:#31535d}.rl-body{min-height:0;display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:14px;padding:16px 22px 22px;overflow:auto}.rl-column{min-width:0;border:1px solid #d8e1e3;border-radius:15px;background:#fff;padding:14px}.rl-column h3{display:flex;justify-content:space-between;align-items:center;margin:0 0 11px;font-size:15px}.rl-list{display:grid;gap:9px}.rl-card{border:1px solid #dce4e6;border-radius:12px;background:#fbfcfc;overflow:hidden}.rl-card:hover{border-color:#99bec6}.rl-card-main{display:flex;align-items:center}.rl-open{min-width:0;flex:1;display:flex;align-items:center;gap:10px;padding:11px;border:0;background:transparent;text-align:left;cursor:pointer}.rl-badge{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;background:#e3f1f3;color:#176a7a;font-size:11px;font-weight:800}.rl-badge.group{background:#e8edf8;color:#455f9e}.rl-badge.note{background:#f3eddf;color:#846321}.rl-copy{min-width:0;display:grid;gap:3px}.rl-copy strong,.rl-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rl-copy small,.rl-muted{font-size:11px;color:#71858c}.rl-actions{display:flex;gap:2px;padding-right:7px}.rl-icon-btn{width:32px;height:32px;color:#526a72}.rl-icon-btn.danger:hover{background:#fdebed;color:#b33b45}.rl-relations{display:flex;flex-wrap:wrap;gap:5px;padding:0 10px 9px 62px}.rl-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:4px 7px;border-radius:999px;background:#edf4f5;color:#48626a;font-size:10px}.rl-chip.workspace{background:#e5f2f4;color:#176878}.rl-chip.content{background:#f4efdf;color:#80621c}.rl-link-count{display:inline-flex;align-items:center;gap:2px;margin-left:5px;padding:2px 5px;border-radius:999px;background:#edf3f4;color:#61777e;font-size:9px;font-weight:700;white-space:nowrap}.rl-tree{display:grid;gap:10px}.rl-notebook{border:1px solid #dce4e6;border-radius:12px;overflow:hidden}.rl-notebook-head,.rl-section-head,.rl-page-row{display:flex;align-items:center}.rl-notebook-head{background:#fafcfc}.rl-notebook-title,.rl-section-open,.rl-page-open{min-width:0;flex:1;border:0;background:transparent;text-align:left;cursor:pointer}.rl-notebook-title{display:flex;align-items:center;gap:10px;padding:11px}.rl-notebook-tools,.rl-section-tools,.rl-page-tools{display:flex;gap:1px;padding-right:6px}.rl-sections{display:grid;gap:8px;padding:0 10px 10px 20px}.rl-section{border-left:3px solid #cbdcdf;background:#fff}.rl-section-head{padding-left:8px;background:#f8fafa}.rl-section-open{padding:9px 7px;font-weight:700;color:#36545d}.rl-pages{display:grid}.rl-page-row{border-top:1px solid #edf1f2;padding-left:17px}.rl-page-open{padding:8px 7px;color:#415c64}.rl-empty{padding:26px 12px;border:1px dashed #cad7da;border-radius:11px;color:#809197;text-align:center;font-size:12px}.rl-modal-backdrop{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:#13282f66}.rl-modal{width:min(620px,100%);max-height:90%;overflow:auto;border-radius:15px;background:#fff;box-shadow:0 22px 70px #0e20274f}.rl-modal-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #e1e7e9}.rl-modal-body{display:grid;gap:13px;padding:16px 18px}.rl-field{display:grid;gap:6px;font-size:12px;color:#526a72}.rl-field input[type=text],.rl-field select{width:100%;height:38px;padding:0 10px;border:1px solid #c8d5d8;border-radius:9px;background:#fff;color:#263e46}.rl-radio{display:grid;grid-template-columns:1fr 1fr;gap:9px}.rl-radio label{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #d3dde0;border-radius:10px;cursor:pointer}.rl-radio label:has(input:checked){border-color:#4e94a1;background:#f0f8f9}.rl-radio strong{display:block;color:#2b464f}.rl-radio small{display:block;margin-top:2px;color:#758990}.rl-hint{padding:9px 10px;border-radius:9px;background:#f3f7f8;color:#60767d;font-size:11px;line-height:1.45}.rl-modal-actions{display:flex;justify-content:flex-end;gap:9px;padding:0 18px 18px}.rl-existing{display:grid;gap:6px}.rl-existing-row{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e0e6e8;border-radius:9px}.rl-existing-row span{min-width:0;flex:1;font-size:11px}.rl-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px}.rl-checks label{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid #dde5e7;border-radius:9px}.rl-note-add{margin:6px 0 0 28px;border:0;background:transparent;color:#1c7181;font-size:11px;font-weight:700;cursor:pointer}@media(max-width:820px){.relation-library{width:calc(100vw - 16px);max-height:calc(100vh - 16px)}.rl-body{grid-template-columns:1fr;padding:12px}.rl-head,.rl-tools{padding-left:14px;padding-right:14px}.rl-checks,.rl-radio{grid-template-columns:1fr}}
`;

export function injectStyle() {
  if (document.getElementById("relation-library-style")) return;
  const element = document.createElement("style");
  element.id = "relation-library-style";
  element.textContent = style;
  document.head.append(element);
}

export function sourceRelations(view: LibraryView, source: RelationSource) {
  return view.relations.filter((relation) => relation.source.type === source.type && relation.source.id === source.id);
}

export function targetRelations(view: LibraryView, target: RelationTarget) {
  const key = targetKey(target);
  return view.relations.filter((relation) => targetKey(relation.target) === key);
}

export function relationKindLabel(relation: Relation) {
  if (relation.target.type === "block") return "Trích dẫn";
  return relation.kind === "workspace" ? "Mở cùng" : "Tham khảo";
}

export function targetShortLabel(view: LibraryView, target: RelationTarget) {
  const notebook = view.notebooks.find((item) => item.id === target.notebookId);
  if (!notebook) return "Ghi chú không khả dụng";
  if (target.type === "notebook") return notebook.title;
  const section = notebook.sections.find((item) => item.id === (target.sectionId || target.id));
  if (target.type === "section") return section?.title || "Section";
  const page = view.pages[target.pageId || target.id];
  return page?.title || section?.title || "Trang";
}

export function relationChips(view: LibraryView, source: RelationSource) {
  const visible = sourceRelations(view, source).filter((relation) => relation.target.type !== "block");
  const used = new Set<string>();
  return visible.map((relation) => {
    const name = targetShortLabel(view, relation.target);
    const key = name.trim().toLocaleLowerCase("vi");
    if (!key || used.has(key)) return "";
    used.add(key);
    const title = `${relationKindLabel(relation)} · ${relationTargetLabel(view, relation.target)}`;
    return `<span class="rl-chip ${relation.kind}" title="${escapeHtml(title)}">${escapeHtml(name)}</span>`;
  }).join("");
}

function relationCountBadge(view: LibraryView, target: RelationTarget) {
  const relations = targetRelations(view, target).filter((relation) => relation.target.type !== "block");
  return relations.length ? `<span class="rl-link-count" title="${relations.length} PDF/bộ PDF được gắn">📎 ${relations.length}</span>` : "";
}

export function sourceCard(view: LibraryView, source: RelationSource, title: string, subtitle: string, badge: string, badgeClass = "") {
  const encoded = escapeHtml(encodeSource(source));
  const chips = relationChips(view, source);
  const renameAction = source.type === "group" ? "rename-group" : "rename-document";
  const deleteAction = source.type === "group" ? "delete-group" : "delete-document";
  return `<article class="rl-card"><div class="rl-card-main"><button class="rl-open" data-open-source="${encoded}"><b class="rl-badge ${badgeClass}">${badge}</b><span class="rl-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></button><span class="rl-actions"><button class="rl-icon-btn" title="Gắn với ghi chú" data-relate-source="${encoded}">⛓</button><button class="rl-icon-btn" title="Đổi tên" data-${renameAction}="${escapeHtml(source.id)}">✎</button><button class="rl-icon-btn danger" title="Xóa" data-${deleteAction}="${escapeHtml(source.id)}">⌫</button></span></div>${chips ? `<div class="rl-relations">${chips}</div>` : ""}</article>`;
}

export function noteTree(view: LibraryView) {
  const notebooks = view.notebooks.filter((notebook) => notebook.available);
  if (!notebooks.length) return '<div class="rl-empty">Chưa có notebook.</div>';
  return notebooks.map((notebook) => {
    const notebookTargetObject: RelationTarget = { type: "notebook", id: notebook.id, notebookId: notebook.id };
    const notebookTarget = escapeHtml(JSON.stringify(notebookTargetObject));
    const sections = notebook.sections.map((section) => {
      const sectionTargetObject: RelationTarget = { type: "section", id: section.id, notebookId: notebook.id, sectionId: section.id };
      const sectionTarget = escapeHtml(JSON.stringify(sectionTargetObject));
      const pages = section.pageIds.map((pageId) => {
        const page = view.pages[pageId];
        if (!page) return "";
        const targetObject: RelationTarget = { type: "page", id: page.id, notebookId: notebook.id, sectionId: section.id, pageId: page.id };
        const target = escapeHtml(JSON.stringify(targetObject));
        return `<div class="rl-page-row"><button class="rl-page-open" data-open-target="${target}">${escapeHtml(page.title)}${relationCountBadge(view, targetObject)}</button><span class="rl-page-tools"><button class="rl-icon-btn" title="Gắn PDF" data-relate-target="${target}">⛓</button><button class="rl-icon-btn" title="Chuyển section" data-move-page="${escapeHtml(`${notebook.id}|${page.id}`)}">↪</button></span></div>`;
      }).join("");
      return `<section class="rl-section"><div class="rl-section-head"><button class="rl-section-open" data-open-target="${sectionTarget}">${escapeHtml(section.title)} <span class="rl-muted">(${section.pageIds.length})</span>${relationCountBadge(view, sectionTargetObject)}</button><span class="rl-section-tools"><button class="rl-icon-btn" title="Gắn PDF" data-relate-target="${sectionTarget}">⛓</button><button class="rl-icon-btn" title="Thêm trang" data-add-page="${escapeHtml(`${notebook.id}|${section.id}`)}">＋</button><button class="rl-icon-btn" title="Đổi tên section" data-rename-section="${escapeHtml(`${notebook.id}|${section.id}`)}">✎</button><button class="rl-icon-btn danger" title="Xóa section" data-delete-section="${escapeHtml(`${notebook.id}|${section.id}`)}">⌫</button></span></div><div class="rl-pages">${pages || '<div class="rl-muted" style="padding:8px 12px">Chưa có trang</div>'}</div></section>`;
    }).join("");
    return `<article class="rl-notebook"><div class="rl-notebook-head"><button class="rl-notebook-title" data-open-target="${notebookTarget}"><b class="rl-badge note">SỔ</b><span class="rl-copy"><strong>${escapeHtml(notebook.title)}${relationCountBadge(view, notebookTargetObject)}</strong><small>${notebook.sections.length} section</small></span></button><span class="rl-notebook-tools"><button class="rl-icon-btn" title="Gắn PDF" data-relate-target="${notebookTarget}">⛓</button><button class="rl-icon-btn" title="Thêm section" data-add-section="${escapeHtml(notebook.id)}">＋</button><button class="rl-icon-btn" title="Đổi tên notebook" data-rename-notebook="${escapeHtml(notebook.id)}">✎</button><button class="rl-icon-btn danger" title="Xóa notebook" data-delete-notebook="${escapeHtml(notebook.id)}">⌫</button></span></div><div class="rl-sections">${sections}<button class="rl-note-add" data-add-section="${escapeHtml(notebook.id)}">＋ Thêm section</button></div></article>`;
  }).join("");
}

export function buildPanel(_backdrop: HTMLElement) {
  const view = getLibraryView();
  if (!view) return null;
  const groups = view.groups.map((group) => sourceCard(view, { type: "group", id: group.id }, group.name, `${group.documentIds.length} PDF`, "BỘ", "group")).join("");
  const documents = view.documents.filter((document) => document.available).map((document) => sourceCard(view, { type: "document", id: document.id }, titleOf(document.name), `${Math.max(1, Math.round(document.size / 1024 / 1024 * 10) / 10)} MB`, "PDF")).join("");
  const panel = document.createElement("aside");
  panel.className = "relation-library";
  panel.innerHTML = `<header class="rl-head"><strong>Thư viện MedNote</strong><button class="rl-close" data-close>✕</button></header><div class="rl-tools"><button class="rl-primary" data-import>＋ Thêm PDF</button><button class="rl-secondary" data-new-notebook>＋ Notebook mới</button></div><div class="rl-body"><section class="rl-column"><h3><span>PDF</span><small class="rl-muted">${view.documents.filter((item) => item.available).length} file${view.groups.length ? ` · ${view.groups.length} bộ` : ""}</small></h3><div class="rl-list">${groups}${documents || (!groups ? '<div class="rl-empty">Chưa có PDF.</div>' : "")}</div></section><section class="rl-column"><h3><span>Notebook → Section → Trang</span><small class="rl-muted">${view.notebooks.filter((item) => item.available).length} notebook</small></h3><div class="rl-tree">${noteTree(view)}</div></section></div>`;
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  return panel;
}

export function closeLibrary(backdrop: HTMLElement) {
  backdrop.querySelector<HTMLButtonElement>('.library-panel button[aria-label="Đóng"]')?.click();
}

export function openAndReload(action: () => unknown) {
  if (action()) reload();
}

export function promptName(message: string, current = "") {
  return requestText({ title: message, label: "Tên", value: current });
}

export function fullTargetLabel(view: LibraryView, target: RelationTarget) {
  return relationTargetLabel(view, target);
}
