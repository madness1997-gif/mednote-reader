import {
  BACKUP_KEY, META_WORKSPACE_ID, NOTE_WORKSPACE_PREFIX, type AnyObject, type AppState, type DocumentGroup, type LibraryView, type RelationLibrary, type RelationSource, type RelationTarget, type ContentRelation,
  clone, dedupeRelations, ensureVisibleWorkspace, findNotebook, findPageContext, importLegacyRelations, isPlaceholderNotebook, libraryFromState, normalizeSections, now,
  placeholderNotebook, readAppState, sameEndpoints, stableLibrary, untouchedGeneratedNotebook, uid, writeStateAndLibrary,
} from "./relation-library-shared";

function reconcile(state: AppState, inputLibrary: RelationLibrary) {
  const library = clone(inputLibrary);
  const oldLibrary = stableLibrary(library);
  const documents = new Map(library.documents.map((document) => [document.id, { ...document, available: false }]));
  const notebooks = new Map(library.notebooks.map((notebook) => [notebook.id, { ...notebook, available: false }]));
  const discoveredGroups: DocumentGroup[] = [];

  for (const workspace of state.workspaces) {
    if (workspace.id === META_WORKSPACE_ID) continue;
    workspace.documents = Array.isArray(workspace.documents) ? workspace.documents : [];
    workspace.notebooks = Array.isArray(workspace.notebooks) ? workspace.notebooks : [];

    for (const document of workspace.documents) {
      documents.set(String(document.id), {
        id: String(document.id),
        name: String(document.name || "Tài liệu.pdf"),
        size: Number(document.size || 0),
        lastModified: Number(document.lastModified || 0),
        available: true,
      });
    }

    if (workspace.documents.length > 1 && !String(workspace.id).startsWith(NOTE_WORKSPACE_PREFIX)) {
      const ids = workspace.documents.map((document: AnyObject) => String(document.id));
      const signature = ids.slice().sort().join("|");
      const existing = library.groups.find((group) => group.documentIds.slice().sort().join("|") === signature);
      const nextName = existing?.name || String(workspace.name || `Khối ${ids.length} tài liệu`);
      const changed = !existing || existing.name !== nextName || existing.documentIds.join("|") !== ids.join("|");
      discoveredGroups.push({
        id: existing?.id || uid("group"),
        name: nextName,
        documentIds: ids,
        createdAt: existing?.createdAt || now(),
        updatedAt: changed ? now() : existing.updatedAt,
      });
    }

    const keptNotebooks: AnyObject[] = [];
    for (const notebook of workspace.notebooks) {
      if (isPlaceholderNotebook(notebook)) {
        keptNotebooks.push(notebook);
        continue;
      }

      // An untouched generated note can stay absent from the Library while the
      // workspace is Reader-only, but it must NEVER be removed from app state.
      // Removing it here used to leave React showing a Note canvas from memory
      // while the OneNote navigator could no longer find that notebook.
      const isActiveVisibleNote = state.activeWorkspaceId === String(workspace.id)
        && state.workspaceMode !== "reader"
        && String(workspace.activeNotebookId || "") === String(notebook.id || "");
      if (untouchedGeneratedNotebook(workspace, notebook) && !isActiveVisibleNote) {
        keptNotebooks.push(notebook);
        continue;
      }

      const normalized = normalizeSections(notebooks.get(String(notebook.id)), notebook);
      normalized.workspaceId = String(workspace.id).startsWith(NOTE_WORKSPACE_PREFIX)
        ? String(workspace.id)
        : `${NOTE_WORKSPACE_PREFIX}${notebook.id}`;
      notebooks.set(normalized.id, normalized);
      keptNotebooks.push(notebook);
    }
    workspace.notebooks = keptNotebooks;
    if (!workspace.notebooks.length && workspace.documents.length) {
      const placeholder = placeholderNotebook(String(workspace.id));
      workspace.notebooks = [placeholder];
      workspace.activeNotebookId = placeholder.id;
    }
  }

  library.documents = [...documents.values()];
  library.notebooks = [...notebooks.values()];
  for (const group of discoveredGroups) {
    const index = library.groups.findIndex((item) => item.id === group.id);
    if (index >= 0) library.groups[index] = group;
    else library.groups.push(group);
  }
  library.groups = library.groups.map((group) => ({
    ...group,
    documentIds: group.documentIds.filter((id, index, array) => array.indexOf(id) === index),
  })).filter((group) => group.documentIds.length > 0);

  // A deleted PDF must never keep a relation that can reopen or point back to
  // a stale source. The notebook itself stays available as an independent note.
  const availableDocumentIds = new Set(library.documents.filter((document) => document.available).map((document) => document.id));
  const availableGroupIds = new Set(library.groups
    .filter((group) => group.documentIds.some((id) => availableDocumentIds.has(id)))
    .map((group) => group.id));
  library.relations = library.relations.filter((relation) => relation.source.type === "document"
      ? availableDocumentIds.has(relation.source.id)
      : availableGroupIds.has(relation.source.id));

  for (const notebookRecord of library.notebooks.filter((item) => item.available)) {
    const found = findNotebook(state, notebookRecord.id);
    if (!found) continue;
    for (const page of found.notebook.pages || []) {
      const context = findPageContext(library, String(page.id));
      for (const excerpt of page.excerpts || []) {
        if (!excerpt.documentId) continue;
        const source: RelationSource = { type: "document", id: String(excerpt.documentId) };
        const target: RelationTarget = {
          type: "block",
          id: String(excerpt.id),
          notebookId: notebookRecord.id,
          sectionId: context?.section.id,
          pageId: String(page.id),
        };
        const existing = library.relations.find((relation) => sameEndpoints(relation, source, target));
        const relation: ContentRelation = {
          id: existing?.kind === "content" ? existing.id : uid("content-relation"),
          kind: "content",
          source,
          target,
          createdAt: existing?.createdAt || Number(excerpt.createdAt || now()),
          updatedAt: existing?.kind === "content" ? existing.updatedAt : now(),
          locator: {
            documentId: String(excerpt.documentId),
            pdfPage: Number(excerpt.page || 0) || undefined,
            rect: excerpt.rect,
            quote: excerpt.text,
          },
        };
        library.relations = library.relations.filter((item) => !sameEndpoints(item, source, target));
        library.relations.push(relation);
      }
    }
  }

  library.relations = dedupeRelations(library.relations);
  importLegacyRelations(library);
  ensureVisibleWorkspace(state);
  const changed = oldLibrary !== stableLibrary(library);
  return { state, library, changed };
}

export function prepareRelationLibraryBeforeApp() {
  if (typeof localStorage === "undefined") return;
  const state = readAppState();
  if (!state) return;
  if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
  const library = libraryFromState(state);
  const result = reconcile(state, library);
  writeStateAndLibrary(result.state, result.library, true);
}

export function syncFromApp() {
  const state = readAppState();
  if (!state) return null;
  const currentLibrary = libraryFromState(state);
  const result = reconcile(state, currentLibrary);
  const embedded = state.workspaces.find((workspace) => workspace.id === META_WORKSPACE_ID)?.relationLibrary as RelationLibrary | undefined;
  const needsStateWrite = result.changed || !embedded || stableLibrary(embedded) !== stableLibrary(result.library);
  if (!needsStateWrite) return { state: result.state, library: currentLibrary };
  return writeStateAndLibrary(result.state, result.library, true);
}

export function getLibraryView(): LibraryView | null {
  const synced = syncFromApp();
  if (!synced) return null;
  const pages: LibraryView["pages"] = {};
  for (const notebookRecord of synced.library.notebooks) {
    const found = findNotebook(synced.state, notebookRecord.id);
    if (!found) continue;
    for (const section of notebookRecord.sections) {
      for (const pageId of section.pageIds) {
        const page = found.notebook.pages?.find((item: AnyObject) => String(item.id) === pageId);
        if (page) pages[pageId] = { id: pageId, title: String(page.title || "Trang ghi chú"), notebookId: notebookRecord.id, sectionId: section.id };
      }
    }
  }
  return { ...synced.library, pages };
}
