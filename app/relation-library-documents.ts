import {
  DB_NAME, DB_STORE, IMPORT_SESSION_KEY, META_WORKSPACE_ID, type AnyObject, type LibraryView, type RelationSource, type RelationTarget,
  ensureVisibleWorkspace, isPlaceholderNotebook, now, readJson, uid, writeStateAndLibrary,
} from "./relation-library-shared";
import { getLibraryView, syncFromApp } from "./relation-library-store";

export function createGroup(name: string, documentIds: string[]) {
  const synced = syncFromApp();
  const unique = documentIds.filter((id, index, array) => array.indexOf(id) === index);
  if (!synced || !name.trim() || !unique.length) return false;
  synced.library.groups.push({ id: uid("group"), name: name.trim(), documentIds: unique, createdAt: now(), updatedAt: now() });
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function renameGroup(groupId: string, name: string) {
  const synced = syncFromApp();
  const group = synced?.library.groups.find((item) => item.id === groupId);
  if (!synced || !group || !name.trim()) return false;
  group.name = name.trim();
  group.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function deleteGroup(groupId: string) {
  const synced = syncFromApp();
  if (!synced) return false;
  synced.library.groups = synced.library.groups.filter((group) => group.id !== groupId);
  synced.library.relations = synced.library.relations.filter((relation) => !(relation.source.type === "group" && relation.source.id === groupId));
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function renameDocument(documentId: string, name: string) {
  const synced = syncFromApp();
  if (!synced || !name.trim()) return false;
  const pdfName = `${name.trim().replace(/\.pdf$/i, "")}.pdf`;
  for (const workspace of synced.state.workspaces) {
    workspace.documents = (workspace.documents || []).map((document: AnyObject) => String(document.id) === documentId ? { ...document, name: pdfName } : document);
  }
  const record = synced.library.documents.find((document) => document.id === documentId);
  if (record) record.name = pdfName;
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

async function deletePdfBlob(documentId: string) {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(`pdf:${documentId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* The metadata update still succeeds when the browser cannot open IndexedDB. */ }
}

export async function deleteDocument(documentId: string) {
  const synced = syncFromApp();
  if (!synced) return false;
  synced.state.workspaces = synced.state.workspaces.flatMap((workspace) => {
    if (workspace.id === META_WORKSPACE_ID) return [];
    const documents = (workspace.documents || []).filter((document: AnyObject) => String(document.id) !== documentId);
    if (!documents.length && (workspace.notebooks || []).every(isPlaceholderNotebook)) return [];
    const activeSourceDeleted = String(workspace.activeDocumentId || "") === documentId;
    const notebooks = (workspace.notebooks || []).map((notebook: AnyObject) => ({
      ...notebook,
      pages: (notebook.pages || []).map((page: AnyObject) => {
        const detached = (page.excerpts || []).some((excerpt: AnyObject) => String(excerpt.documentId || "") === documentId);
        return {
          ...page,
          citationPage: detached || activeSourceDeleted ? null : page.citationPage,
          excerpts: (page.excerpts || []).map((excerpt: AnyObject) => String(excerpt.documentId || "") === documentId
            ? { ...excerpt, sourceKind: "manual", documentId: undefined, documentName: undefined, page: undefined, rect: undefined }
            : excerpt),
        };
      }),
    }));
    return [{ ...workspace, documents, notebooks, activeDocumentId: documents.some((item: AnyObject) => item.id === workspace.activeDocumentId) ? workspace.activeDocumentId : documents[0]?.id || null, kind: documents.length > 1 ? "collection" : documents.length ? "document" : "empty" }];
  });
  const record = synced.library.documents.find((document) => document.id === documentId);
  if (record) record.available = false;
  synced.library.groups = synced.library.groups.map((group) => ({ ...group, documentIds: group.documentIds.filter((id) => id !== documentId), updatedAt: now() })).filter((group) => group.documentIds.length);
  // A removed PDF leaves every note usable on its own, without a stale source link.
  synced.library.relations = synced.library.relations.filter((relation) => !(relation.source.type === "document" && relation.source.id === documentId));
  ensureVisibleWorkspace(synced.state);
  writeStateAndLibrary(synced.state, synced.library, true);
  await deletePdfBlob(documentId);
  return true;
}

export function pdfInput() {
  return document.querySelector<HTMLInputElement>('input[type="file"][data-pdf-input="library"]')
    || Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((input) => input.accept.toLowerCase().includes("pdf"));
}

export function importPdf() {
  const view = getLibraryView();
  const input = pdfInput();
  if (!view || !input) return false;
  sessionStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(view.documents.filter((document) => document.available).map((document) => document.id)));
  input.click();
  return true;
}

export function watchImport(onDone?: (source: RelationSource) => void) {
  const baseline = new Set(readJson<string[]>(IMPORT_SESSION_KEY, []));
  const started = now();
  const timer = window.setInterval(() => {
    const view = getLibraryView();
    if (!view) return;
    const added = view.documents.filter((document) => document.available && !baseline.has(document.id));
    if (added.length) {
      window.clearInterval(timer);
      sessionStorage.removeItem(IMPORT_SESSION_KEY);
      let source: RelationSource = { type: "document", id: added[0].id };
      if (added.length > 1) {
        const signature = added.map((document) => document.id).sort().join("|");
        let group = view.groups.find((item) => item.documentIds.slice().sort().join("|") === signature);
        if (!group) {
          createGroup(`Khối ${added.length} tài liệu`, added.map((document) => document.id));
          group = getLibraryView()?.groups.find((item) => item.documentIds.slice().sort().join("|") === signature);
        }
        if (group) source = { type: "group", id: group.id };
      }
      onDone?.(source);
      return;
    }
    if (now() - started > 30000) {
      window.clearInterval(timer);
      sessionStorage.removeItem(IMPORT_SESSION_KEY);
    }
  }, 350);
}

export function relationTargetLabel(view: LibraryView, target: RelationTarget) {
  const notebook = view.notebooks.find((item) => item.id === target.notebookId);
  if (!notebook) return "Ghi chú không khả dụng";
  if (target.type === "notebook") return notebook.title;
  const section = notebook.sections.find((item) => item.id === (target.sectionId || target.id));
  if (target.type === "section") return `${notebook.title} / ${section?.title || "Section"}`;
  const page = view.pages[target.pageId || target.id];
  return `${notebook.title} / ${section?.title || "Section"} / ${page?.title || "Trang"}`;
}
