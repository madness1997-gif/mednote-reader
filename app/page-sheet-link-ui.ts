import { deleteRelation, getLibraryView, upsertRelation, type RelationSource } from "./independent-library-core";
import { sourceLabel, targetMatches } from "./page-sheet-actions";
import { escapeHtml, sourceKey, type ScopedTarget } from "./page-sheet-state";

export function showLinkDialog(target: ScopedTarget, label: string) {
  const view = getLibraryView();
  if (!view) return;
  document.querySelector(".mednote-sheet-link-modal")?.remove();
  const sources: { source: RelationSource; title: string; subtitle: string }[] = [
    ...view.groups.map((group) => ({ source: { type: "group" as const, id: group.id }, title: group.name, subtitle: `${group.documentIds.length} PDF` })),
    ...view.documents.filter((document) => document.available).map((document) => ({ source: { type: "document" as const, id: document.id }, title: document.name.replace(/\.pdf$/i, ""), subtitle: "PDF" })),
  ];
  const existing = view.relations.filter((relation) => targetMatches(relation.target, target));
  const modal = document.createElement("div");
  modal.className = "mednote-sheet-link-modal";
  modal.innerHTML = `<section class="mps-modal"><header><strong>Gắn PDF với ${escapeHtml(label)}</strong><button data-close>✕</button></header><div class="mps-modal-body"><p>Chọn PDF hoặc bộ PDF, sau đó chọn cách liên kết.</p><label>Nguồn<select data-source>${sources.map(({ source, title, subtitle }) => `<option value="${escapeHtml(sourceKey(source))}">${escapeHtml(title)} · ${escapeHtml(subtitle)}</option>`).join("")}</select></label><div class="mps-link-modes"><label><input type="radio" name="mps-link-mode" value="workspace" checked><span><b>Mở cùng ghi chú</b><small>Mở nguồn sẽ vào đúng ${target.scope === "sheet" ? "tờ" : "Page"} này.</small></span></label><label><input type="radio" name="mps-link-mode" value="content"><span><b>Chỉ gắn tham khảo</b><small>Giữ liên hệ nhưng không tự mở cùng.</small></span></label></div>${existing.length ? `<div class="mps-existing"><b>Đang gắn</b>${existing.map((relation) => `<div><span>${escapeHtml(sourceLabel(view, relation.source))} · ${relation.kind === "workspace" ? "mở cùng" : "tham khảo"}</span><button data-unlink="${escapeHtml(relation.id)}">Bỏ</button></div>`).join("")}</div>` : ""}</div><footer><button data-close>Hủy</button><button class="primary" data-save>Gắn PDF</button></footer></section>`;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) { modal.remove(); return; }
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-save],[data-unlink]");
    if (!element) return;
    if (element.dataset.close !== undefined) { modal.remove(); return; }
    if (element.dataset.unlink) {
      if (deleteRelation(element.dataset.unlink)) window.location.reload();
      return;
    }
    const encoded = modal.querySelector<HTMLSelectElement>("[data-source]")?.value || "";
    const [type, ...rest] = encoded.split(":");
    const source = { type: type as RelationSource["type"], id: rest.join(":") };
    const kind = modal.querySelector<HTMLInputElement>('input[name="mps-link-mode"]:checked')?.value as "workspace" | "content";
    if (source.id && upsertRelation(kind, source, target, kind === "workspace")) window.location.reload();
  });
  document.body.append(modal);
}
