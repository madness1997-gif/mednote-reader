const KEY = "mednote-library-v2";
const META = "mednote-independent-library-v1";
const BACKUP = "mednote-library-v2-before-independent";
const IMPORT = "mednote-independent-import-baseline";
const P = "pdfspace:";
const N = "notespace:";
const H = "__mednote_reader_placeholder__:";

type AnyObj = Record<string, any>;

type State = {
  workspaces: AnyObj[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
  savedAt?: number;
};

type Meta = {
  version: 1;
  migratedAt: number;
  pdfs: { id: string; workspaceId: string; name: string }[];
  notebooks: { id: string; workspaceId: string; title: string; linkedDocumentId: string | null }[];
};

const rid = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
const titleOf = (name: string) => name.replace(/\.pdf$/i, "") || "Tài liệu PDF";
const read = (): State | null => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null") as State | null;
    return value && Array.isArray(value.workspaces) ? value : null;
  } catch { return null; }
};
const readMeta = (): Meta | null => {
  try {
    const value = JSON.parse(localStorage.getItem(META) || "null") as Meta | null;
    return value?.version === 1 ? value : null;
  } catch { return null; }
};
const save = (state: State, meta?: Meta) => {
  localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  if (meta) localStorage.setItem(META, JSON.stringify(meta));
};
const cloneDoc = (doc: AnyObj) => ({
  ...doc,
  reader: {
    page: 1, zoom: 1, fitMode: "page", rotation: 0, viewMode: "single",
    ...(doc.reader || {}),
    bookmarks: [...(doc.reader?.bookmarks || [])],
    annotations: [...(doc.reader?.annotations || [])],
  },
});
const blankPage = (id = rid("page"), citationPage: number | null = null) => ({
  id, title: "Trang 1", titleHtml: "Trang 1", body: "", bodyHtml: "", citationPage, strokes: [], excerpts: [],
  paper: { size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
  text: { font: "times", size: 12, color: "auto", bold: false, italic: false, underline: false, align: "left" },
});
const newNotebook = (title: string) => {
  const page = blankPage();
  return { id: rid("notebook"), title, pages: [page], activePageId: page.id, createdAt: Date.now() };
};
const placeholder = (doc: AnyObj) => {
  const page = blankPage(`__mednote_reader_page__:${doc.id}`, doc.reader?.page || 1);
  return { id: `${H}${doc.id}`, title: "Không có sổ ghi chú", pages: [page], activePageId: page.id, createdAt: 0 };
};
const isPlaceholder = (book: AnyObj) => String(book.id || "").startsWith(H);
const generatedBlank = (book: AnyObj, ws: AnyObj) => {
  if (!String(book.title || "").startsWith("Ghi chú —") || book.pages?.length !== 1 || !ws.documents?.length) return false;
  const page = book.pages[0] || {};
  const text = `${page.body || ""}${page.bodyHtml || ""}`.replace(/<[^>]*>/g, "").trim();
  return !text && !page.strokes?.length && !page.excerpts?.length;
};

function normalize(state: State, initial = false): { state: State; meta: Meta; changed: boolean } {
  const previousMeta = readMeta();
  const source = state.workspaces || [];
  const active = source.find((w) => w.id === state.activeWorkspaceId) || source[0];
  const docs = new Map<string, { doc: AnyObj; ws: AnyObj }>();
  const books = new Map<string, { book: AnyObj; ws: AnyObj; linked: string | null }>();

  for (const ws of source) for (const doc of ws.documents || []) {
    const old = docs.get(doc.id);
    const prefer = ws.id === state.activeWorkspaceId || (!String(old?.ws.id).startsWith(P) && String(ws.id).startsWith(P));
    if (!old || prefer) docs.set(doc.id, { doc: cloneDoc(doc), ws });
  }
  for (const ws of source) for (const book of ws.notebooks || []) {
    if (isPlaceholder(book)) continue;
    if (!initial && !String(ws.id).startsWith(N) && generatedBlank(book, ws)) continue;
    if (!books.has(book.id) || ws.id === state.activeWorkspaceId) {
      books.set(book.id, { book, ws, linked: ws.activeDocumentId || ws.documents?.[0]?.id || null });
    }
  }

  const workspaces: AnyObj[] = [];
  const pdfs: Meta["pdfs"] = [];
  const notebooks: Meta["notebooks"] = [];
  for (const { doc, ws } of docs.values()) {
    const id = `${P}${doc.id}`;
    const hold = placeholder(doc);
    workspaces.push({ id, kind: "document", name: titleOf(doc.name), documents: [cloneDoc(doc)], activeDocumentId: doc.id, notebooks: [hold], activeNotebookId: hold.id, sourcePage: Math.max(1, ws.sourcePage || doc.reader.page || 1) });
    pdfs.push({ id: doc.id, workspaceId: id, name: doc.name });
  }
  for (const { book, ws, linked } of books.values()) {
    const doc = linked ? docs.get(linked)?.doc : null;
    const id = `${N}${book.id}`;
    workspaces.push({ id, kind: doc ? "document" : "empty", name: book.title || "Sổ ghi chú", documents: doc ? [cloneDoc(doc)] : [], activeDocumentId: doc?.id || null, notebooks: [book], activeNotebookId: book.id, sourcePage: Math.max(1, ws.sourcePage || doc?.reader?.page || 1) });
    notebooks.push({ id: book.id, workspaceId: id, title: book.title || "Sổ ghi chú", linkedDocumentId: doc?.id || null });
  }
  if (!workspaces.length) {
    const book = newNotebook("Sổ ghi chú mới");
    const id = `${N}${book.id}`;
    workspaces.push({ id, kind: "empty", name: book.title, documents: [], activeDocumentId: null, notebooks: [book], activeNotebookId: book.id, sourcePage: 1 });
    notebooks.push({ id: book.id, workspaceId: id, title: book.title, linkedDocumentId: null });
  }

  let activeWorkspaceId = workspaces[0].id;
  const activeBook = active?.notebooks?.find((b: AnyObj) => !isPlaceholder(b));
  const activeDoc = active?.activeDocumentId || active?.documents?.[0]?.id;
  if (activeBook && books.has(activeBook.id)) activeWorkspaceId = `${N}${activeBook.id}`;
  else if (activeDoc && docs.has(activeDoc)) activeWorkspaceId = `${P}${activeDoc}`;

  const next: State = { ...state, workspaces, activeWorkspaceId, readerShare: Number.isFinite(state.readerShare) ? state.readerShare : 50 };
  const meta: Meta = { version: 1, migratedAt: previousMeta?.migratedAt || Date.now(), pdfs, notebooks };
  const strip = (v: AnyObj) => JSON.stringify({ ...v, savedAt: undefined });
  return { state: next, meta, changed: strip(state) !== strip(next) || JSON.stringify(previousMeta) !== JSON.stringify(meta) };
}

function ensure(): boolean {
  const state = read();
  if (!state?.workspaces.length) return false;
  const initial = !readMeta();
  const result = normalize(state, initial);
  if (!result.changed) return false;
  if (initial && !localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, localStorage.getItem(KEY) || "");
  save(result.state, result.meta);
  return true;
}
const current = () => {
  const state = read();
  if (!state) return null;
  const result = normalize(state, !readMeta());
  if (result.changed) save(result.state, result.meta);
  return result;
};
const reload = (workspaceId: string, mode: "reader" | "note" | "split") => {
  const result = current(); if (!result) return;
  result.state.activeWorkspaceId = workspaceId; result.state.workspaceMode = mode; save(result.state, result.meta); location.reload();
};

function addNotebook() {
  const name = prompt("Tên sổ ghi chú", "Sổ ghi chú mới")?.trim();
  const result = current(); if (!name || !result) return;
  const book = newNotebook(name); const id = `${N}${book.id}`;
  result.state.workspaces.push({ id, kind: "empty", name, documents: [], activeDocumentId: null, notebooks: [book], activeNotebookId: book.id, sourcePage: 1 });
  result.state.activeWorkspaceId = id; result.state.workspaceMode = "note";
  const normalized = normalize(result.state); save(normalized.state, normalized.meta); location.reload();
}
function renamePdf(id: string) {
  const result = current(); const record = result?.meta.pdfs.find((x) => x.id === id); if (!result || !record) return;
  const name = prompt("Đổi tên PDF", titleOf(record.name))?.trim(); if (!name) return;
  const next = `${name.replace(/\.pdf$/i, "")}.pdf`;
  for (const ws of result.state.workspaces) {
    ws.documents = (ws.documents || []).map((d: AnyObj) => d.id === id ? { ...d, name: next } : d);
    if (ws.id === `${P}${id}`) ws.name = titleOf(next);
  }
  const normalized = normalize(result.state); save(normalized.state, normalized.meta); location.reload();
}
function renameBook(id: string) {
  const result = current(); const record = result?.meta.notebooks.find((x) => x.id === id); if (!result || !record) return;
  const name = prompt("Đổi tên sổ ghi chú", record.title)?.trim(); if (!name) return;
  const ws = result.state.workspaces.find((x) => x.id === record.workspaceId); if (!ws) return;
  ws.name = name; ws.notebooks = ws.notebooks.map((b: AnyObj) => b.id === id ? { ...b, title: name } : b);
  const normalized = normalize(result.state); save(normalized.state, normalized.meta); location.reload();
}
function linkBook(id: string, docId: string | null) {
  const result = current(); const record = result?.meta.notebooks.find((x) => x.id === id); if (!result || !record) return;
  const ws = result.state.workspaces.find((x) => x.id === record.workspaceId); const pdf = docId ? result.state.workspaces.find((x) => x.id === `${P}${docId}`)?.documents?.[0] : null;
  if (!ws) return; ws.documents = pdf ? [cloneDoc(pdf)] : []; ws.activeDocumentId = pdf?.id || null; ws.kind = pdf ? "document" : "empty";
  const normalized = normalize(result.state); normalized.state.activeWorkspaceId = ws.id; normalized.state.workspaceMode = pdf ? "split" : "note"; save(normalized.state, normalized.meta); location.reload();
}
function deleteBook(id: string) {
  const result = current(); const record = result?.meta.notebooks.find((x) => x.id === id); if (!result || !record || !confirm(`Xóa sổ ghi chú “${record.title}”? PDF liên kết sẽ được giữ lại.`)) return;
  result.state.workspaces = result.state.workspaces.filter((x) => x.id !== record.workspaceId);
  const normalized = normalize(result.state); save(normalized.state, normalized.meta); location.reload();
}
async function deletePdf(id: string) {
  const result = current(); const record = result?.meta.pdfs.find((x) => x.id === id); if (!result || !record || !confirm(`Xóa PDF “${record.name}”? Các sổ sẽ được giữ lại và chỉ bỏ liên kết PDF.`)) return;
  result.state.workspaces = result.state.workspaces.filter((x) => x.id !== record.workspaceId).map((ws) => ws.documents?.some((d: AnyObj) => d.id === id) ? { ...ws, kind: "empty", documents: [], activeDocumentId: null } : ws);
  const normalized = normalize(result.state); save(normalized.state, normalized.meta);
  try {
    const db = await new Promise<IDBDatabase>((ok, fail) => { const r = indexedDB.open("mednote-local", 1); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
    const tx = db.transaction("documents", "readwrite"); tx.objectStore("documents").delete(`pdf:${id}`); db.close();
  } catch { /* metadata deletion still succeeds */ }
  location.reload();
}

function pdfInput() {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((x) => x.accept.toLowerCase().includes("pdf"));
}
function importPdf() {
  const result = current(); const baseline = result?.meta.pdfs.map((x) => x.id) || [];
  sessionStorage.setItem(IMPORT, JSON.stringify(baseline));
  const input = pdfInput(); if (!input) return alert("Không tìm thấy bộ chọn PDF. Hãy đóng thư viện và thử lại.");
  input.click(); watchImport(baseline);
}
function watchImport(baseline: string[]) {
  const old = new Set(baseline); const start = Date.now();
  const timer = setInterval(() => {
    const state = read(); if (!state) return;
    const ids = new Set<string>(state.workspaces.flatMap((w) => (w.documents || []).map((d: AnyObj) => d.id)));
    const added = [...ids].filter((id) => !old.has(id));
    if (added.length) {
      clearInterval(timer); const normalized = normalize(state, false); save(normalized.state, normalized.meta); sessionStorage.removeItem(IMPORT);
      const record = normalized.meta.pdfs.find((x) => added.includes(x.id)); return record ? reload(record.workspaceId, "reader") : location.reload();
    }
    if (Date.now() - start > 20000) { clearInterval(timer); sessionStorage.removeItem(IMPORT); }
  }, 250);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const style = `
.ind-lib{position:relative;z-index:3;width:min(980px,calc(100vw - 40px));max-height:min(820px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #c9d4d7;border-radius:18px;background:#f7f9f9;box-shadow:0 24px 80px #14252b47;color:#24383f}.ind-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 16px;border-bottom:1px solid #dfe6e8;background:#fff}.ind-head div{display:grid;gap:3px}.ind-head strong{font-size:20px}.ind-head span,.ind-sec small,.ind-copy small{color:#71858c;font-size:11px}.ind-close,.ind-act{width:34px;height:34px;border:0;border-radius:9px;background:transparent;cursor:pointer}.ind-close:hover,.ind-act:hover{background:#eaf0f1}.ind-act.del:hover{background:#fdebec;color:#b43a43}.ind-tools,.ind-body{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ind-tools{padding:16px 22px;background:#fff}.ind-primary{min-height:62px;display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid #1d7181;border-radius:13px;background:#1d7181;color:#fff;text-align:left;cursor:pointer}.ind-primary.alt{background:#f4f8f8;color:#31535d;border-color:#c8d5d8}.ind-primary span{display:grid;gap:2px}.ind-primary small{opacity:.75}.ind-body{min-height:0;padding:0 22px 22px;overflow:auto}.ind-sec{min-width:0;padding:14px;border:1px solid #d9e1e3;border-radius:15px;background:#fff}.ind-sec h3{margin:0 0 10px;font-size:15px}.ind-list{display:grid;gap:8px}.ind-card{display:flex;align-items:center;border:1px solid #dde4e6;border-radius:12px;background:#fbfcfc}.ind-card:hover{border-color:#8dbbc4;background:#fff}.ind-open{min-width:0;flex:1;display:flex;align-items:center;gap:10px;padding:11px;border:0;background:transparent;text-align:left;cursor:pointer}.ind-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:#e4f1f3;color:#176a7a;font-weight:800}.ind-icon.note{background:#f3eddf;color:#846321}.ind-copy{min-width:0;display:grid;gap:3px}.ind-copy strong,.ind-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ind-actions{display:flex;padding-right:6px}.ind-note-main{min-width:0;flex:1}.ind-link{display:flex;align-items:center;gap:7px;padding:0 10px 10px 61px;color:#667c83;font-size:10px}.ind-link select{min-width:0;flex:1;height:28px;border:1px solid #cbd7da;border-radius:8px;background:#fff}.ind-empty{padding:30px 15px;border:1px dashed #cbd7da;border-radius:11px;color:#829297;text-align:center;font-size:12px}@media(max-width:760px){.ind-lib{width:calc(100vw - 20px);max-height:calc(100vh - 20px)}.ind-tools,.ind-body{grid-template-columns:1fr}.ind-head,.ind-tools{padding-left:14px;padding-right:14px}.ind-body{padding:0 14px 16px}}
`;
function injectStyle() { if (document.getElementById("independent-library-style")) return; const el = document.createElement("style"); el.id = "independent-library-style"; el.textContent = style; document.head.append(el); }
function panel(backdrop: HTMLElement) {
  const result = current(); const pdfs = result?.meta.pdfs || []; const books = result?.meta.notebooks || [];
  const pdfHtml = pdfs.map((p) => `<article class="ind-card"><button class="ind-open" data-open-pdf="${esc(p.workspaceId)}"><b class="ind-icon">PDF</b><span class="ind-copy"><strong>${esc(titleOf(p.name))}</strong><small>Mở độc lập</small></span></button><span class="ind-actions"><button class="ind-act" data-rename-pdf="${esc(p.id)}">✎</button><button class="ind-act del" data-delete-pdf="${esc(p.id)}">⌫</button></span></article>`).join("") || '<div class="ind-empty">Chưa có PDF.</div>';
  const bookHtml = books.map((b) => {
    const ws = result?.state.workspaces.find((w) => w.id === b.workspaceId); const count = ws?.notebooks?.[0]?.pages?.length || 0;
    const options = ['<option value="">Không liên kết</option>', ...pdfs.map((p) => `<option value="${esc(p.id)}"${p.id === b.linkedDocumentId ? " selected" : ""}>${esc(titleOf(p.name))}</option>`)].join("");
    return `<article class="ind-card"><div class="ind-note-main"><button class="ind-open" data-open-book="${esc(b.workspaceId)}" data-linked="${b.linkedDocumentId ? "1" : "0"}"><b class="ind-icon note">SỔ</b><span class="ind-copy"><strong>${esc(b.title)}</strong><small>${count} trang · ${b.linkedDocumentId ? "có liên kết PDF" : "không liên kết PDF"}</small></span></button><label class="ind-link">Liên kết PDF <select data-link-book="${esc(b.id)}">${options}</select></label></div><span class="ind-actions"><button class="ind-act" data-rename-book="${esc(b.id)}">✎</button><button class="ind-act del" data-delete-book="${esc(b.id)}">⌫</button></span></article>`;
  }).join("") || '<div class="ind-empty">Chưa có sổ ghi chú.</div>';
  const el = document.createElement("aside"); el.className = "ind-lib"; el.innerHTML = `<header class="ind-head"><div><strong>Thư viện</strong><span>PDF và sổ ghi chú là hai thư mục độc lập</span></div><button class="ind-close" data-close>✕</button></header><div class="ind-tools"><button class="ind-primary" data-import><b>＋</b><span><strong>Thêm PDF</strong><small>Không tự tạo sổ ghi chú</small></span></button><button class="ind-primary alt" data-new-book><b>＋</b><span><strong>Tạo sổ</strong><small>Không cần chọn PDF</small></span></button></div><div class="ind-body"><section class="ind-sec"><h3>PDF <small>(${pdfs.length})</small></h3><div class="ind-list">${pdfHtml}</div></section><section class="ind-sec"><h3>Sổ ghi chú <small>(${books.length})</small></h3><div class="ind-list">${bookHtml}</div></section></div>`;
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-close],[data-import],[data-new-book],[data-open-pdf],[data-open-book],[data-rename-pdf],[data-delete-pdf],[data-rename-book],[data-delete-book]"); if (!t) return;
    if (t.dataset.close !== undefined) backdrop.querySelector<HTMLButtonElement>('.library-panel button[aria-label="Đóng"]')?.click();
    else if (t.dataset.import !== undefined) importPdf(); else if (t.dataset.newBook !== undefined) addNotebook();
    else if (t.dataset.openPdf) reload(t.dataset.openPdf, "reader"); else if (t.dataset.openBook) reload(t.dataset.openBook, t.dataset.linked === "1" ? "split" : "note");
    else if (t.dataset.renamePdf) renamePdf(t.dataset.renamePdf); else if (t.dataset.deletePdf) void deletePdf(t.dataset.deletePdf);
    else if (t.dataset.renameBook) renameBook(t.dataset.renameBook); else if (t.dataset.deleteBook) deleteBook(t.dataset.deleteBook);
  });
  el.addEventListener("change", (e) => { const select = (e.target as HTMLElement).closest<HTMLSelectElement>("select[data-link-book]"); if (select) linkBook(select.dataset.linkBook!, select.value || null); });
  return el;
}
function mount() {
  if (ensure()) return location.reload(); injectStyle();
  for (const backdrop of document.querySelectorAll<HTMLElement>(".library-backdrop")) {
    if (backdrop.querySelector(".ind-lib")) continue;
    const native = backdrop.querySelector<HTMLElement>(".library-panel"); if (!native) continue;
    native.style.display = "none"; backdrop.append(panel(backdrop));
  }
}
function init() {
  const migrated = ensure(); if (migrated && document.readyState !== "loading") return location.reload();
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount, { once: true }) : mount();
  const pending = sessionStorage.getItem(IMPORT); if (pending) try { watchImport(JSON.parse(pending)); } catch { sessionStorage.removeItem(IMPORT); }
}
init();
export {};
