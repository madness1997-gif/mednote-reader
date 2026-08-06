const KEY = "mednote-library-v2";
const META = "mednote-independent-library-v1";
const BACKUP = "mednote-library-v2-before-independent";
export const IMPORT = "mednote-independent-import-baseline";
export const BOOT = "mednote-independent-boot-v2";
const DELETED_BOOKS = "mednote-independent-deleted-books";
const DELETED_PDFS = "mednote-independent-deleted-pdfs";
const P = "pdfspace:";
const N = "notespace:";
const H = "__mednote_reader_placeholder__:";

type AnyObj = Record<string, any>;
export type State = {
  workspaces: AnyObj[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
  savedAt?: number;
};
export type Meta = {
  version: 1;
  migratedAt: number;
  pdfs: { id: string; workspaceId: string; name: string }[];
  notebooks: { id: string; workspaceId: string; title: string; linkedDocumentId: string | null }[];
};

const rid = (prefix: string) => `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
export const titleOf = (name: string) => name.replace(/\.pdf$/i, "") || "Tài liệu PDF";
const readJson = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
};
const readSet = (key: string) => new Set<string>(readJson<string[]>(key, []));
const writeSet = (key: string, values: Set<string>) => localStorage.setItem(key, JSON.stringify([...values]));
const read = (): State | null => {
  const value = readJson<State | null>(KEY, null);
  return value && Array.isArray(value.workspaces) ? value : null;
};
const readMeta = (): Meta | null => {
  const value = readJson<Meta | null>(META, null);
  return value?.version === 1 ? value : null;
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
const isUntouchedGeneratedNotebook = (book: AnyObj, ws: AnyObj) => {
  if (!String(book.title || "").startsWith("Ghi chú —") || book.pages?.length !== 1 || !ws.documents?.length) return false;
  const page = book.pages[0] || {};
  if (page.strokes?.length || page.excerpts?.length) return false;
  const plain = `${page.body || ""}${page.bodyHtml || ""}`.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return true;
  const firstAidTemplate = page.paper?.template === "first-aid"
    && String(page.title || "").trim() === "TÊN CHỦ ĐỀ"
    && /TỔNG QUAN/i.test(plain)
    && /YẾU TỐ NGUY CƠ/i.test(plain)
    && /CHẨN ĐOÁN/i.test(plain);
  return firstAidTemplate;
};

function normalize(state: State, initial = false): { state: State; meta: Meta; changed: boolean } {
  const previousMeta = readMeta();
  const deletedBooks = readSet(DELETED_BOOKS);
  const deletedPdfs = readSet(DELETED_PDFS);
  const source = state.workspaces || [];
  const active = source.find((w) => w.id === state.activeWorkspaceId) || source[0];
  const docs = new Map<string, { doc: AnyObj; ws: AnyObj }>();
  const books = new Map<string, { book: AnyObj; ws: AnyObj; linked: string | null }>();

  for (const ws of source) for (const doc of ws.documents || []) {
    if (!doc?.id || deletedPdfs.has(doc.id)) continue;
    const old = docs.get(doc.id);
    const prefer = ws.id === state.activeWorkspaceId || (!String(old?.ws.id).startsWith(P) && String(ws.id).startsWith(P));
    if (!old || prefer) docs.set(doc.id, { doc: cloneDoc(doc), ws });
  }
  for (const ws of source) for (const book of ws.notebooks || []) {
    if (!book?.id || isPlaceholder(book) || deletedBooks.has(book.id)) continue;
    if (!initial && !String(ws.id).startsWith(N) && isUntouchedGeneratedNotebook(book, ws)) continue;
    if (!books.has(book.id) || ws.id === state.activeWorkspaceId) {
      const linked = ws.activeDocumentId || ws.documents?.[0]?.id || null;
      books.set(book.id, { book, ws, linked: linked && !deletedPdfs.has(linked) ? linked : null });
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
  const activeBook = active?.notebooks?.find((b: AnyObj) => !isPlaceholder(b) && !deletedBooks.has(b.id));
  const activeDoc = active?.activeDocumentId || active?.documents?.[0]?.id;
  if (activeBook && books.has(activeBook.id)) activeWorkspaceId = `${N}${activeBook.id}`;
  else if (activeDoc && docs.has(activeDoc)) activeWorkspaceId = `${P}${activeDoc}`;

  const next: State = { ...state, workspaces, activeWorkspaceId, readerShare: Number.isFinite(state.readerShare) ? state.readerShare : 50 };
  const meta: Meta = { version: 1, migratedAt: previousMeta?.migratedAt || Date.now(), pdfs, notebooks };
  const strip = (value: AnyObj) => JSON.stringify({ ...value, savedAt: undefined });
  return { state: next, meta, changed: strip(state) !== strip(next) || JSON.stringify(previousMeta) !== JSON.stringify(meta) };
}

export function migrateOnce(): boolean {
  const state = read();
  if (!state?.workspaces.length || readMeta()) return false;
  const result = normalize(state, true);
  if (!localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, localStorage.getItem(KEY) || "");
  save(result.state, result.meta);
  return true;
}
export const current = () => {
  const state = read();
  if (!state) return null;
  const result = normalize(state, false);
  if (result.changed) save(result.state, result.meta);
  return result;
};
export const reload = (workspaceId: string, mode: "reader" | "note" | "split") => {
  const result = current();
  if (!result) return;
  result.state.activeWorkspaceId = workspaceId;
  result.state.workspaceMode = mode;
  save(result.state, result.meta);
  location.reload();
};

export function addNotebook() {
  const name = prompt("Tên sổ ghi chú", "Sổ ghi chú mới")?.trim();
  const result = current();
  if (!name || !result) return;
  const book = newNotebook(name);
  const id = `${N}${book.id}`;
  result.state.workspaces.push({ id, kind: "empty", name, documents: [], activeDocumentId: null, notebooks: [book], activeNotebookId: book.id, sourcePage: 1 });
  result.state.activeWorkspaceId = id;
  result.state.workspaceMode = "note";
  const normalized = normalize(result.state);
  save(normalized.state, normalized.meta);
  location.reload();
}
export function renamePdf(id: string) {
  const result = current();
  const record = result?.meta.pdfs.find((item) => item.id === id);
  if (!result || !record) return;
  const name = prompt("Đổi tên PDF", titleOf(record.name))?.trim();
  if (!name) return;
  const next = `${name.replace(/\.pdf$/i, "")}.pdf`;
  for (const ws of result.state.workspaces) {
    ws.documents = (ws.documents || []).map((doc: AnyObj) => doc.id === id ? { ...doc, name: next } : doc);
    if (ws.id === `${P}${id}`) ws.name = titleOf(next);
  }
  const normalized = normalize(result.state);
  save(normalized.state, normalized.meta);
  location.reload();
}
export function renameBook(id: string) {
  const result = current();
  const record = result?.meta.notebooks.find((item) => item.id === id);
  if (!result || !record) return;
  const name = prompt("Đổi tên sổ ghi chú", record.title)?.trim();
  if (!name) return;
  const ws = result.state.workspaces.find((item) => item.id === record.workspaceId);
  if (!ws) return;
  ws.name = name;
  ws.notebooks = ws.notebooks.map((book: AnyObj) => book.id === id ? { ...book, title: name } : book);
  const normalized = normalize(result.state);
  save(normalized.state, normalized.meta);
  location.reload();
}
export function linkBook(id: string, docId: string | null) {
  const result = current();
  const record = result?.meta.notebooks.find((item) => item.id === id);
  if (!result || !record) return;
  const ws = result.state.workspaces.find((item) => item.id === record.workspaceId);
  const pdf = docId ? result.state.workspaces.find((item) => item.id === `${P}${docId}`)?.documents?.[0] : null;
  if (!ws) return;
  ws.documents = pdf ? [cloneDoc(pdf)] : [];
  ws.activeDocumentId = pdf?.id || null;
  ws.kind = pdf ? "document" : "empty";
  const normalized = normalize(result.state);
  normalized.state.activeWorkspaceId = ws.id;
  normalized.state.workspaceMode = pdf ? "split" : "note";
  save(normalized.state, normalized.meta);
  location.reload();
}
export function deleteBook(id: string) {
  const result = current();
  const record = result?.meta.notebooks.find((item) => item.id === id);
  if (!result || !record || !confirm(`Xóa sổ ghi chú “${record.title}”? PDF liên kết sẽ được giữ lại.`)) return;
  const deleted = readSet(DELETED_BOOKS);
  deleted.add(id);
  writeSet(DELETED_BOOKS, deleted);
  result.state.workspaces = result.state.workspaces
    .map((ws: AnyObj): AnyObj => ({ ...ws, notebooks: (ws.notebooks || []).filter((book: AnyObj) => book.id !== id) }))
    .filter((ws) => ws.notebooks?.length || ws.documents?.length);
  if (result.state.activeWorkspaceId === record.workspaceId) {
    result.state.activeWorkspaceId = result.state.workspaces.find((ws) => ws.documents?.length)?.id || result.state.workspaces[0]?.id || "";
    result.state.workspaceMode = result.state.workspaces.find((ws) => ws.id === result.state.activeWorkspaceId)?.documents?.length ? "reader" : "note";
  }
  const normalized = normalize(result.state);
  save(normalized.state, normalized.meta);
  location.reload();
}
export async function deletePdf(id: string) {
  const result = current();
  const record = result?.meta.pdfs.find((item) => item.id === id);
  if (!result || !record || !confirm(`Xóa PDF “${record.name}”? Các sổ sẽ được giữ lại và chỉ bỏ liên kết PDF.`)) return;
  const deleted = readSet(DELETED_PDFS);
  deleted.add(id);
  writeSet(DELETED_PDFS, deleted);
  result.state.workspaces = result.state.workspaces
    .filter((ws) => ws.id !== record.workspaceId)
    .map((ws) => ws.documents?.some((doc: AnyObj) => doc.id === id) ? { ...ws, kind: "empty", documents: [], activeDocumentId: null } : ws);
  const normalized = normalize(result.state);
  save(normalized.state, normalized.meta);
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("mednote-local", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").delete(`pdf:${id}`);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch { /* metadata deletion still succeeds */ }
  location.reload();
}

function pdfInput() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((input) => input.accept.toLowerCase().includes("pdf"));
}
export function importPdf() {
  const result = current();
  const baseline = result?.meta.pdfs.map((item) => item.id) || [];
  sessionStorage.setItem(IMPORT, JSON.stringify(baseline));
  const input = pdfInput();
  if (!input) return alert("Không tìm thấy bộ chọn PDF. Hãy đóng thư viện và thử lại.");
  input.click();
  watchImport(baseline);
}
export function watchImport(baseline: string[]) {
  const old = new Set(baseline);
  const start = Date.now();
  const timer = window.setInterval(() => {
    const state = read();
    if (!state) return;
    const ids = new Set<string>(state.workspaces.flatMap((ws) => (ws.documents || []).map((doc: AnyObj) => doc.id)));
    const added = [...ids].filter((id) => !old.has(id));
    if (added.length) {
      window.clearInterval(timer);
      const normalized = normalize(state, false);
      save(normalized.state, normalized.meta);
      sessionStorage.removeItem(IMPORT);
      const record = normalized.meta.pdfs.find((item) => added.includes(item.id));
      if (record) reload(record.workspaceId, "reader");
      else location.reload();
      return;
    }
    if (Date.now() - start > 20000) {
      window.clearInterval(timer);
      sessionStorage.removeItem(IMPORT);
    }
  }, 150);
}
