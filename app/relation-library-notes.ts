import {
  META_WORKSPACE_ID, NOTE_WORKSPACE_PREFIX, type AnyObject, type NoteSection, type Relation,
  blankPage, clone, createNotebookObject, ensureVisibleWorkspace, findNotebook, now, placeholderNotebook, uid, writeStateAndLibrary,
} from "./relation-library-shared";
import { syncFromApp } from "./relation-library-store";

function relationPageId(relation: Relation) {
  if (relation.target.pageId) return relation.target.pageId;
  return relation.target.type === "page" ? relation.target.id : undefined;
}

function retargetPages(relations: Relation[], notebookId: string, pageIds: string[], sectionId: string) {
  const moved = new Set(pageIds);
  return relations.map((relation) => {
    if (relation.target.notebookId !== notebookId) return relation;
    const pageId = relationPageId(relation);
    if (!pageId || !moved.has(pageId) || relation.target.sectionId === sectionId) return relation;
    return {
      ...relation,
      target: { ...relation.target, sectionId },
      updatedAt: now(),
    } as Relation;
  });
}

export function createNotebook(title: string) {
  const synced = syncFromApp();
  if (!synced || !title.trim()) return false;
  const notebook = createNotebookObject(title.trim());
  const workspaceId = `${NOTE_WORKSPACE_PREFIX}${notebook.id}`;
  synced.state.workspaces = synced.state.workspaces.filter((workspace) => workspace.id !== META_WORKSPACE_ID);
  synced.state.workspaces.push({
    id: workspaceId, kind: "empty", name: notebook.title, documents: [], activeDocumentId: null,
    notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
  });
  const section: NoteSection = { id: uid("section"), title: "Phần 1", pageIds: [notebook.pages[0].id], createdAt: now(), updatedAt: now() };
  synced.library.notebooks.push({
    id: notebook.id, title: notebook.title, workspaceId, sections: [section], activeSectionId: section.id, available: true, updatedAt: now(),
  });
  synced.state.activeWorkspaceId = workspaceId;
  synced.state.workspaceMode = "note";
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function renameNotebook(notebookId: string, title: string) {
  const synced = syncFromApp();
  if (!synced || !title.trim()) return false;
  for (const workspace of synced.state.workspaces) {
    workspace.notebooks = (workspace.notebooks || []).map((notebook: AnyObject) => String(notebook.id) === notebookId ? { ...notebook, title: title.trim() } : notebook);
    if (workspace.activeNotebookId === notebookId) workspace.name = title.trim();
  }
  const record = synced.library.notebooks.find((item) => item.id === notebookId);
  if (record) { record.title = title.trim(); record.updatedAt = now(); }
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function createSection(notebookId: string, title: string) {
  const synced = syncFromApp();
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  if (!synced || !record || !title.trim()) return false;
  const section: NoteSection = { id: uid("section"), title: title.trim(), pageIds: [], createdAt: now(), updatedAt: now() };
  record.sections.push(section);
  record.activeSectionId = section.id;
  record.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function renameSection(notebookId: string, sectionId: string, title: string) {
  const synced = syncFromApp();
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  const section = record?.sections.find((item) => item.id === sectionId);
  if (!synced || !record || !section || !title.trim()) return false;
  section.title = title.trim();
  section.updatedAt = now();
  record.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function deleteSection(notebookId: string, sectionId: string) {
  const synced = syncFromApp();
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  if (!synced || !record || record.sections.length <= 1) return false;
  const section = record.sections.find((item) => item.id === sectionId);
  if (!section) return false;
  const fallback = record.sections.find((item) => item.id !== sectionId)!;
  const movedPageIds = section.pageIds.filter((id) => !fallback.pageIds.includes(id));
  fallback.pageIds.push(...movedPageIds);
  fallback.updatedAt = now();
  record.sections = record.sections.filter((item) => item.id !== sectionId);
  if (record.activeSectionId === sectionId) record.activeSectionId = fallback.id;
  record.updatedAt = now();

  // Direct links to the deleted section disappear. Links to pages/blocks inside it
  // follow those pages to the fallback section, so references never become stale.
  synced.library.relations = retargetPages(
    synced.library.relations.filter((relation) => !(relation.target.type === "section" && relation.target.id === sectionId)),
    notebookId,
    section.pageIds,
    fallback.id,
  );
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function createPage(notebookId: string, sectionId: string, title = "Trang mới") {
  const synced = syncFromApp();
  const found = synced ? findNotebook(synced.state, notebookId) : null;
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  const section = record?.sections.find((item) => item.id === sectionId);
  if (!synced || !found || !record || !section) return false;
  const page = blankPage(uid("page"), title);
  found.notebook.pages.push(page);
  found.notebook.activePageId = page.id;
  section.pageIds.push(page.id);
  section.updatedAt = now();
  record.activeSectionId = section.id;
  record.updatedAt = now();
  for (const workspace of synced.state.workspaces) {
    workspace.notebooks = (workspace.notebooks || []).map((notebook: AnyObject) => String(notebook.id) === notebookId ? clone(found.notebook) : notebook);
  }
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function movePage(notebookId: string, pageId: string, sectionId: string) {
  const synced = syncFromApp();
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  const target = record?.sections.find((item) => item.id === sectionId);
  if (!synced || !record || !target) return false;
  for (const section of record.sections) {
    const hadPage = section.pageIds.includes(pageId);
    section.pageIds = section.pageIds.filter((id) => id !== pageId);
    if (hadPage) section.updatedAt = now();
  }
  if (!target.pageIds.includes(pageId)) target.pageIds.push(pageId);
  target.updatedAt = now();
  record.activeSectionId = target.id;
  record.updatedAt = now();
  synced.library.relations = retargetPages(synced.library.relations, notebookId, [pageId], target.id);
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function deleteNotebook(notebookId: string) {
  const synced = syncFromApp();
  if (!synced) return false;
  const record = synced.library.notebooks.find((item) => item.id === notebookId);
  const sectionIds = new Set(record?.sections.map((section) => section.id) || []);
  const pageIds = new Set(record?.sections.flatMap((section) => section.pageIds) || []);
  synced.state.workspaces = synced.state.workspaces.flatMap((workspace) => {
    if (workspace.id === META_WORKSPACE_ID) return [];
    const notebooks = (workspace.notebooks || []).filter((notebook: AnyObject) => String(notebook.id) !== notebookId);
    if (!notebooks.length && workspace.documents?.length) {
      const placeholder = placeholderNotebook(String(workspace.id));
      return [{ ...workspace, notebooks: [placeholder], activeNotebookId: placeholder.id }];
    }
    if (!notebooks.length && !workspace.documents?.length) return [];
    return [{ ...workspace, notebooks, activeNotebookId: notebooks.some((item: AnyObject) => item.id === workspace.activeNotebookId) ? workspace.activeNotebookId : notebooks[0].id }];
  });
  synced.library.notebooks = synced.library.notebooks.filter((item) => item.id !== notebookId);
  synced.library.relations = synced.library.relations.filter((relation) => relation.target.notebookId !== notebookId && !sectionIds.has(relation.target.id) && !pageIds.has(relation.target.id));
  ensureVisibleWorkspace(synced.state);
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}
