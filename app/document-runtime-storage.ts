import {
  documentRuntimeWorkspace,
  type PersistedLibrary,
  type WorkspaceItem,
} from "./document-runtime-adapter";

const DOCUMENT_RUNTIME_KEY = "mednote-document-runtime-v1";
const RELATION_META_WORKSPACE_ID = "__mednote_relations_v2__";

export function readDocumentRuntimeSnapshot(): PersistedLibrary | null {
  const raw = localStorage.getItem(DOCUMENT_RUNTIME_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PersistedLibrary;
  return Array.isArray(parsed?.workspaces) && parsed.workspaces.length ? parsed : null;
}

export function persistentDocumentWorkspaces(workspaces: WorkspaceItem[]) {
  return workspaces.filter((workspace) => workspace.kind !== "temporary" && workspace.id !== RELATION_META_WORKSPACE_ID);
}

export function saveDocumentRuntimeSnapshot(snapshot: PersistedLibrary) {
  const persistentWorkspaces = persistentDocumentWorkspaces(snapshot.workspaces);
  localStorage.setItem(DOCUMENT_RUNTIME_KEY, JSON.stringify({
    ...snapshot,
    workspaces: persistentWorkspaces.map(documentRuntimeWorkspace),
  }));
}
