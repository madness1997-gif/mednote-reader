const KEY = "mednote-library-v2";
const META = "mednote-independent-library-v1";
const DELETED_BOOKS = "mednote-independent-deleted-books";
const NOTE_PREFIX = "notespace:";

interface Obj { [key: string]: any }

function untouchedAutoNotebook(workspace: Obj) {
  const book = workspace.notebooks?.[0];
  const page = book?.pages?.[0];
  if (!book || !page || workspace.notebooks.length !== 1 || !workspace.documents?.length) return null;
  if (!String(book.title || "").startsWith("Ghi chú —") || book.pages.length !== 1) return null;
  if (page.strokes?.length || page.excerpts?.length) return null;
  const plain = `${page.body || ""}${page.bodyHtml || ""}`.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const untouched = !plain || (page.paper?.template === "first-aid"
    && String(page.title || "").trim() === "TÊN CHỦ ĐỀ"
    && /TỔNG QUAN/i.test(plain)
    && /YẾU TỐ NGUY CƠ/i.test(plain)
    && /CHẨN ĐOÁN/i.test(plain));
  return untouched ? String(book.id) : null;
}

try {
  const state = JSON.parse(localStorage.getItem(KEY) || "null") as Obj | null;
  if (state && Array.isArray(state.workspaces)) {
    const removed = new Set<string>();
    const workspaces = state.workspaces.filter((workspace: Obj) => {
      if (!String(workspace.id || "").startsWith(NOTE_PREFIX)) return true;
      const id = untouchedAutoNotebook(workspace);
      if (!id) return true;
      removed.add(id);
      return false;
    });
    if (removed.size) {
      const deleted = new Set<string>(JSON.parse(localStorage.getItem(DELETED_BOOKS) || "[]"));
      removed.forEach((id) => deleted.add(id));
      localStorage.setItem(DELETED_BOOKS, JSON.stringify([...deleted]));
      if (!workspaces.some((workspace: Obj) => workspace.id === state.activeWorkspaceId)) {
        state.activeWorkspaceId = workspaces.find((workspace: Obj) => workspace.documents?.length)?.id || workspaces[0]?.id || "";
        state.workspaceMode = workspaces.find((workspace: Obj) => workspace.id === state.activeWorkspaceId)?.documents?.length ? "reader" : "note";
      }
      state.workspaces = workspaces;
      state.savedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(state));
      const meta = JSON.parse(localStorage.getItem(META) || "null") as Obj | null;
      if (meta && Array.isArray(meta.notebooks)) {
        meta.notebooks = meta.notebooks.filter((book: Obj) => !removed.has(String(book.id)));
        localStorage.setItem(META, JSON.stringify(meta));
      }
    }
  }
} catch { /* Keep the original library if repair data is malformed. */ }

export {};
