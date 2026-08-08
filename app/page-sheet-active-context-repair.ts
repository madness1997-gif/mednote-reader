const APP_KEY = "mednote-library-v2";
const META_WORKSPACE_ID = "__mednote_relations_v2__";
const PLACEHOLDER_PREFIX = "__mednote_reader_placeholder__:";

type AnyObject = Record<string, any>;

type AppState = {
  workspaces?: AnyObject[];
  activeWorkspaceId?: string;
  workspaceMode?: "split" | "reader" | "note";
  [key: string]: any;
};

function usableNotebook(notebook: AnyObject | undefined) {
  return Boolean(notebook && !String(notebook.id || "").startsWith(PLACEHOLDER_PREFIX));
}

function repairActiveContext() {
  let state: AppState | null = null;
  try {
    const raw = localStorage.getItem(APP_KEY);
    state = raw ? JSON.parse(raw) as AppState : null;
  } catch {
    return;
  }
  if (!state || !Array.isArray(state.workspaces) || !state.workspaces.length) return;

  const visible = state.workspaces.filter((workspace) => String(workspace?.id || "") !== META_WORKSPACE_ID);
  if (!visible.length) return;

  // React itself falls back to the first workspace when activeWorkspaceId is stale.
  // Keep the persisted state aligned with what the canvas is actually rendering so
  // the imperative OneNote navigator does not see a different/invalid context.
  let workspace = visible.find((item) => String(item.id) === String(state!.activeWorkspaceId || ""));
  let changed = false;
  if (!workspace) {
    workspace = visible[0];
    state.activeWorkspaceId = String(workspace.id);
    changed = true;
  }

  const notebooks = Array.isArray(workspace.notebooks) ? workspace.notebooks : [];
  const usable = notebooks.filter((item: AnyObject) => usableNotebook(item));
  if (!usable.length) return;

  // page.tsx renders `activeNotebook ?? notebooks[0]`. Mirror that exact fallback.
  // Previously currentContext() returned null when activeNotebookId was stale, which
  // left the 120px sidebar host visible but empty — exactly the blank strip seen on
  // Android desktop-site mode.
  const active = usable.find((item: AnyObject) => String(item.id) === String(workspace!.activeNotebookId || ""));
  if (!active) {
    workspace.activeNotebookId = String(usable[0].id);
    changed = true;
  }

  if (!changed) return;
  try {
    state.savedAt = Date.now();
    localStorage.setItem(APP_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mednote-active-context-repaired"));
  } catch {
    // Keep the UI usable if storage is unavailable.
  }
}

repairActiveContext();
window.addEventListener("storage", repairActiveContext);
window.addEventListener("mednote-library-changed", repairActiveContext as EventListener);
window.setInterval(repairActiveContext, 500);

export {};
