import {
  META_WORKSPACE_ID, NOTE_WORKSPACE_PREFIX, SOURCE_WORKSPACE_PREFIX, type AnyObject, type AppState, type ContentRelation, type Relation, type RelationKind, type RelationLibrary, type RelationSource, type RelationTarget, type WorkspaceRelation,
  clone, dedupeRelations, findNotebook, findPageContext, now, placeholderNotebook, sameEndpoints, sourceKey, targetKey, titleOf, uid, writeStateAndLibrary,
} from "./relation-library-shared";
import { syncFromApp } from "./relation-library-store";

function sourceDocuments(state: AppState, library: RelationLibrary, source: RelationSource) {
  const ids = source.type === "document"
    ? [source.id]
    : library.groups.find((group) => group.id === source.id)?.documentIds || [];
  const map = new Map<string, AnyObject>();
  for (const workspace of state.workspaces) {
    for (const document of workspace.documents || []) {
      if (ids.includes(String(document.id)) && !map.has(String(document.id))) map.set(String(document.id), clone(document));
    }
  }
  return ids.map((id) => map.get(id)).filter((item): item is AnyObject => Boolean(item));
}

function sourceName(library: RelationLibrary, source: RelationSource) {
  if (source.type === "group") return library.groups.find((group) => group.id === source.id)?.name || "Bộ tài liệu";
  return titleOf(library.documents.find((document) => document.id === source.id)?.name || "Tài liệu");
}

function targetSpecificity(target: RelationTarget) {
  return target.type === "page" || target.type === "block" ? 3 : target.type === "section" ? 2 : 1;
}

function matchingWorkspaceRelation(library: RelationLibrary, source: RelationSource) {
  return library.relations
    .filter((relation): relation is WorkspaceRelation => relation.kind === "workspace" && sourceKey(relation.source) === sourceKey(source))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.updatedAt - a.updatedAt || targetSpecificity(b.target) - targetSpecificity(a.target))[0];
}

function relationCoversTarget(relationTarget: RelationTarget, requested: RelationTarget) {
  if (relationTarget.notebookId !== requested.notebookId) return false;
  if (targetKey(relationTarget) === targetKey(requested)) return true;
  if (relationTarget.type === "notebook") return true;
  return relationTarget.type === "section" && relationTarget.id === requested.sectionId;
}

function relationForTarget(library: RelationLibrary, target: RelationTarget) {
  const candidates = library.relations.filter((relation): relation is WorkspaceRelation => relation.kind === "workspace" && relationCoversTarget(relation.target, target));
  return candidates.sort((a, b) => {
    const exactA = targetKey(a.target) === targetKey(target) ? 1 : 0;
    const exactB = targetKey(b.target) === targetKey(target) ? 1 : 0;
    return exactB - exactA
      || targetSpecificity(b.target) - targetSpecificity(a.target)
      || (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0)
      || b.updatedAt - a.updatedAt;
  })[0];
}

function selectTargetPage(library: RelationLibrary, notebook: AnyObject, target: RelationTarget) {
  if (target.type === "page" || target.type === "block") return target.pageId || target.id;
  if (target.type === "section") {
    const section = library.notebooks.find((item) => item.id === target.notebookId)?.sections.find((item) => item.id === target.id);
    return section?.pageIds.includes(String(notebook.activePageId)) ? String(notebook.activePageId) : section?.pageIds[0];
  }
  return String(notebook.activePageId || notebook.pages?.[0]?.id || "");
}

function applySnapshot(documents: AnyObject[], relation: WorkspaceRelation | undefined) {
  if (!relation?.snapshot) return documents;
  return documents.map((document) => {
    const page = relation.snapshot?.pdfPages?.[String(document.id)];
    return page ? { ...document, reader: { ...(document.reader || {}), page } } : document;
  });
}

function saveOpenState(state: AppState, library: RelationLibrary, relation?: WorkspaceRelation) {
  if (relation) {
    relation.lastOpenedAt = now();
    relation.updatedAt = now();
  }
  return writeStateAndLibrary(state, library, true);
}

function openTargetInternal(state: AppState, library: RelationLibrary, target: RelationTarget, source?: RelationSource, relation?: WorkspaceRelation) {
  const found = findNotebook(state, target.notebookId);
  if (!found) return false;
  const notebook = clone(found.notebook);
  const selectedPageId = selectTargetPage(library, notebook, target);
  if (selectedPageId && notebook.pages?.some((page: AnyObject) => String(page.id) === selectedPageId)) notebook.activePageId = selectedPageId;
  const documents = source ? applySnapshot(sourceDocuments(state, library, source), relation) : [];
  const workspaceId = `${NOTE_WORKSPACE_PREFIX}${notebook.id}`;
  const activeDocumentId = relation?.snapshot?.activeDocumentId && documents.some((document) => String(document.id) === relation.snapshot?.activeDocumentId)
    ? relation.snapshot.activeDocumentId
    : documents[0]?.id || null;
  const workspace = {
    id: workspaceId,
    kind: documents.length > 1 ? "collection" : documents.length ? "document" : "empty",
    name: String(notebook.title || "Sổ ghi chú"),
    documents,
    activeDocumentId,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: Number(documents.find((document) => String(document.id) === String(activeDocumentId))?.reader?.page || 1),
  };
  state.workspaces = state.workspaces.filter((item) => item.id !== workspaceId && item.id !== META_WORKSPACE_ID);
  state.workspaces.push(workspace);
  state.activeWorkspaceId = workspaceId;
  state.workspaceMode = documents.length ? relation?.snapshot?.workspaceMode || "split" : "note";
  if (relation?.snapshot?.readerShare) state.readerShare = relation.snapshot.readerShare;
  if (relation?.snapshot?.noteZoom) state.noteZoom = relation.snapshot.noteZoom;
  const record = library.notebooks.find((item) => item.id === notebook.id);
  const context = findPageContext(library, String(notebook.activePageId));
  if (record && context) record.activeSectionId = context.section.id;
  saveOpenState(state, library, relation);
  return true;
}

export function openSource(source: RelationSource) {
  const synced = syncFromApp();
  if (!synced) return false;
  const relation = matchingWorkspaceRelation(synced.library, source);
  if (relation && openTargetInternal(synced.state, synced.library, relation.target, source, relation)) return true;
  const documents = sourceDocuments(synced.state, synced.library, source);
  if (!documents.length) return false;
  const workspaceId = `${SOURCE_WORKSPACE_PREFIX}${source.type}:${source.id}`;
  const placeholder = placeholderNotebook(workspaceId);
  const workspace = {
    id: workspaceId,
    kind: documents.length > 1 ? "collection" : "document",
    name: sourceName(synced.library, source),
    documents,
    activeDocumentId: documents[0]!.id,
    notebooks: [placeholder],
    activeNotebookId: placeholder.id,
    sourcePage: Number(documents[0]!.reader?.page || 1),
  };
  synced.state.workspaces = synced.state.workspaces.filter((item) => item.id !== workspaceId && item.id !== META_WORKSPACE_ID);
  synced.state.workspaces.push(workspace);
  synced.state.activeWorkspaceId = workspaceId;
  synced.state.workspaceMode = "reader";
  saveOpenState(synced.state, synced.library);
  return true;
}

export function openNoteTarget(target: RelationTarget) {
  const synced = syncFromApp();
  if (!synced) return false;
  const relation = relationForTarget(synced.library, target);
  return openTargetInternal(synced.state, synced.library, target, relation?.source, relation);
}

export function upsertRelation(kind: RelationKind, source: RelationSource, target: RelationTarget, _isDefault = false) {
  const synced = syncFromApp();
  if (!synced) return false;
  const nextRelations: Relation[] = [];
  for (const relation of synced.library.relations) {
    if (sameEndpoints(relation, source, target)) continue;
    if (kind === "workspace" && relation.kind === "workspace" && sourceKey(relation.source) === sourceKey(source)) {
      // A source has one primary study destination. Older primary destinations are
      // preserved as ordinary references instead of being silently discarded.
      nextRelations.push({
        id: uid("content-relation"),
        kind: "content",
        source: relation.source,
        target: relation.target,
        createdAt: relation.createdAt,
        updatedAt: now(),
      });
      continue;
    }
    nextRelations.push(relation);
  }
  const base = { id: uid(`${kind}-relation`), kind, source, target, createdAt: now(), updatedAt: now() } as Relation;
  nextRelations.push(kind === "workspace"
    ? { ...base, kind, isDefault: true } as WorkspaceRelation
    : { ...base, kind } as ContentRelation);
  synced.library.relations = dedupeRelations(nextRelations);
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function deleteRelation(relationId: string) {
  const synced = syncFromApp();
  if (!synced) return false;
  synced.library.relations = synced.library.relations.filter((relation) => relation.id !== relationId);
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function currentSnapshot() {
  const synced = syncFromApp();
  if (!synced) return null;
  const workspace = synced.state.workspaces.find((item) => item.id === synced.state.activeWorkspaceId);
  return {
    workspaceMode: synced.state.workspaceMode,
    readerShare: synced.state.readerShare,
    noteZoom: synced.state.noteZoom,
    activeDocumentId: workspace?.activeDocumentId || null,
    pdfPages: Object.fromEntries((workspace?.documents || []).map((document: AnyObject) => [String(document.id), Number(document.reader?.page || 1)])),
  };
}

export function updateWorkspaceRelationSnapshot(relationId: string) {
  const synced = syncFromApp();
  const relation = synced?.library.relations.find((item): item is WorkspaceRelation => item.id === relationId && item.kind === "workspace");
  if (!synced || !relation) return false;
  const snapshot = currentSnapshot();
  if (!snapshot) return false;
  relation.snapshot = snapshot;
  relation.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}
