import {
  BOOT, IMPORT, addNotebook, current, deleteBook, deletePdf, importPdf, linkBook, migrateOnce,
  reload, renameBook, renamePdf, titleOf, watchImport,
} from "./independent-library-core";

const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const style = `
.ind-lib{position:relative;z-index:3;width:min(980px,calc(100vw - 40px));max-height:min(820px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #c9d4d7;border-radius:18px;background:#f7f9f9;box-shadow:0 24px 80px #14252b47;color:#24383f}.ind-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 16px;border-bottom:1px solid #dfe6e8;background:#fff}.ind-head div{display:grid;gap:3px}.ind-head strong{font-size:20px}.ind-head span,.ind-sec small,.ind-copy small{color:#71858c;font-size:11px}.ind-close,.ind-act{width:34px;height:34px;border:0;border-radius:9px;background:transparent;cursor:pointer}.ind-close:hover,.ind-act:hover{background:#eaf0f1}.ind-act.del:hover{background:#fdebec;color:#b43a43}.ind-tools,.ind-body{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ind-tools{padding:16px 22px;background:#fff}.ind-primary{min-height:62px;display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #1d7181;border-radius:13px;background:#1d7181;color:#fff;text-align:left;cursor:pointer}.ind-primary.alt{background:#f4f8f8;color:#31535d;border-color:#c8d5d8}.ind-primary span{display:grid;gap:2px}.ind-primary small{opacity:.75}.ind-body{min-height:0;padding:0 22px 22px;overflow:auto}.ind-sec{min-width:0;padding:14px;border:1px solid #d9e1e3;border-radius:15px;background:#fff}.ind-sec h3{margin:0 0 10px;font-size:15px}.ind-list{display:grid;gap:8px}.ind-card{display:flex;align-items:center;border:1px solid #dde4e6;border-radius:12px;background:#fbfcfc}.ind-card:hover{border-color:#8dbbc4;background:#fff}.ind-open{min-width:0;flex:1;display:flex;align-items:center;gap:10px;padding:11px;border:0;background:transparent;text-align:left;cursor:pointer}.ind-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:#e4f1f3;color:#176a7a;font-weight:800}.ind-icon.note{background:#f3eddf;color:#846321}.ind-copy{min-width:0;display:grid;gap:3px}.ind-copy strong,.ind-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ind-actions{display:flex;padding-right:6px}.ind-note-main{min-width:0;flex:1}.ind-link{display:flex;align-items:center;gap:7px;padding:0 10px 10px 61px;color:#667c83;font-size:10px}.ind-link select{min-width:0;flex:1;height:28px;border:1px solid #cbd7da;border-radius:8px;background:#fff}.ind-empty{padding:30px 15px;border:1px dashed #cbd7da;border-radius:11px;color:#829297;text-align:center;font-size:12px}@media(max-width:760px){.ind-lib{width:calc(100vw - 20px);max-height:calc(100vh - 20px)}.ind-tools,.ind-body{grid-template-columns:1fr}.ind-head,.ind-tools{padding-left:14px;padding-right:14px}.ind-body{padding:0 14px 16px}}
`;
function injectStyle() {
  if (document.getElementById("independent-library-style")) return;
  const element = document.createElement("style");
  element.id = "independent-library-style";
  element.textContent = style;
  document.head.append(element);
}
function panel(backdrop: HTMLElement) {
  const result = current();
  const pdfs = result?.meta.pdfs || [];
  const books = result?.meta.notebooks || [];
  const pdfHtml = pdfs.map((pdf) => `<article class="ind-card"><button class="ind-open" data-open-pdf="${esc(pdf.workspaceId)}"><b class="ind-icon">PDF</b><span class="ind-copy"><strong>${esc(titleOf(pdf.name))}</strong><small>Mở độc lập</small></span></button><span class="ind-actions"><button class="ind-act" data-rename-pdf="${esc(pdf.id)}">✎</button><button class="ind-act del" data-delete-pdf="${esc(pdf.id)}">⌫</button></span></article>`).join("") || '<div class="ind-empty">Chưa có PDF.</div>';
  const bookHtml = books.map((book) => {
    const ws = result?.state.workspaces.find((item) => item.id === book.workspaceId);
    const count = ws?.notebooks?.[0]?.pages?.length || 0;
    const options = ['<option value="">Không liên kết</option>', ...pdfs.map((pdf) => `<option value="${esc(pdf.id)}"${pdf.id === book.linkedDocumentId ? " selected" : ""}>${esc(titleOf(pdf.name))}</option>`)].join("");
    return `<article class="ind-card"><div class="ind-note-main"><button class="ind-open" data-open-book="${esc(book.workspaceId)}" data-linked="${book.linkedDocumentId ? "1" : "0"}"><b class="ind-icon note">SỔ</b><span class="ind-copy"><strong>${esc(book.title)}</strong><small>${count} trang · ${book.linkedDocumentId ? "có liên kết PDF" : "không liên kết PDF"}</small></span></button><label class="ind-link">Liên kết PDF <select data-link-book="${esc(book.id)}">${options}</select></label></div><span class="ind-actions"><button class="ind-act" data-rename-book="${esc(book.id)}">✎</button><button class="ind-act del" data-delete-book="${esc(book.id)}">⌫</button></span></article>`;
  }).join("") || '<div class="ind-empty">Chưa có sổ ghi chú.</div>';
  const element = document.createElement("aside");
  element.className = "ind-lib";
  element.innerHTML = `<header class="ind-head"><div><strong>Thư viện</strong><span>PDF và sổ ghi chú là hai thư mục độc lập</span></div><button class="ind-close" data-close>✕</button></header><div class="ind-tools"><button class="ind-primary" data-import><b>＋</b><span><strong>Thêm PDF</strong><small>Không tự tạo sổ ghi chú</small></span></button><button class="ind-primary alt" data-new-book><b>＋</b><span><strong>Tạo sổ</strong><small>Không cần chọn PDF</small></span></button></div><div class="ind-body"><section class="ind-sec"><h3>PDF <small>(${pdfs.length})</small></h3><div class="ind-list">${pdfHtml}</div></section><section class="ind-sec"><h3>Sổ ghi chú <small>(${books.length})</small></h3><div class="ind-list">${bookHtml}</div></section></div>`;
  element.addEventListener("pointerdown", (event) => event.stopPropagation());
  element.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-import],[data-new-book],[data-open-pdf],[data-open-book],[data-rename-pdf],[data-delete-pdf],[data-rename-book],[data-delete-book]");
    if (!target) return;
    if (target.dataset.close !== undefined) backdrop.querySelector<HTMLButtonElement>('.library-panel button[aria-label="Đóng"]')?.click();
    else if (target.dataset.import !== undefined) importPdf();
    else if (target.dataset.newBook !== undefined) addNotebook();
    else if (target.dataset.openPdf) reload(target.dataset.openPdf, "reader");
    else if (target.dataset.openBook) reload(target.dataset.openBook, target.dataset.linked === "1" ? "split" : "note");
    else if (target.dataset.renamePdf) renamePdf(target.dataset.renamePdf);
    else if (target.dataset.deletePdf) void deletePdf(target.dataset.deletePdf);
    else if (target.dataset.renameBook) renameBook(target.dataset.renameBook);
    else if (target.dataset.deleteBook) deleteBook(target.dataset.deleteBook);
  });
  element.addEventListener("change", (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-link-book]");
    if (select) linkBook(select.dataset.linkBook!, select.value || null);
  });
  return element;
}
function mount() {
  injectStyle();
  for (const backdrop of Array.from(document.querySelectorAll<HTMLElement>(".library-backdrop"))) {
    if (backdrop.querySelector(".ind-lib")) continue;
    const native = backdrop.querySelector<HTMLElement>(".library-panel");
    if (!native) continue;
    native.style.display = "none";
    backdrop.append(panel(backdrop));
  }
}
function init() {
  if (migrateOnce() && sessionStorage.getItem(BOOT) !== "1") {
    sessionStorage.setItem(BOOT, "1");
    location.reload();
    return;
  }
  sessionStorage.removeItem(BOOT);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
  const pending = sessionStorage.getItem(IMPORT);
  if (pending) {
    try { watchImport(JSON.parse(pending) as string[]); }
    catch { sessionStorage.removeItem(IMPORT); }
  }
}
init();
export {};
