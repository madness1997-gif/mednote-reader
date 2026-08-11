import { loadIncrementalLibrary } from "./incremental-library-store";
import { localBinaryStorage, type StoredPdf } from "./local-binary-storage";
import { noteRepository, noteStore } from "./note-store";
import type { LegacyRelationV2 } from "./note-migration";
import {
  createBlankPage,
  normalizePage,
  type Notebook,
  type NotePage,
} from "./note-runtime-adapter";
import {
  DEFAULT_READER,
  NOTE_RUNTIME_WORKSPACE_ID,
  createEmptyWorkspace,
  createNoteRuntimeWorkspace,
  documentRuntimeWorkspace,
  normalizeWorkspace,
  runtimeWorkspacesFromDocumentGraph,
  type LibraryDocument,
  type PersistedLibrary,
  type WorkspaceItem,
  type WorkspaceMode,
} from "./document-runtime-adapter";
import {
  persistentDocumentWorkspaces,
  readDocumentRuntimeSnapshot,
} from "./document-runtime-storage";

const STORAGE_KEY = "mednote-library-v2";
const LEGACY_STORAGE_KEY = "mednote-notebook-v1";
const LEGACY_RELATION_KEY = "mednote-relations-v2";

type LegacyNotebookState = {
  pages?: NotePage[];
  activeNoteId?: string;
  readerShare?: number;
};

type BootstrapSnapshots = {
  localSnapshot: PersistedLibrary | null;
  documentSnapshot: PersistedLibrary | null;
  incrementalSnapshot: PersistedLibrary | null;
  legacyNotebook: LegacyNotebookState | null;
  relation: LegacyRelationV2 | undefined;
};

export type BootstrapResult = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode: WorkspaceMode;
  noteZoom: number;
  savedAt: number;
  warnings?: string[];
};

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function runtimeSettings(snapshot: PersistedLibrary | null | undefined, fallbackMode: WorkspaceMode) {
  return {
    readerShare: snapshot?.readerShare || 50,
    workspaceMode: snapshot?.workspaceMode === "reader" || snapshot?.workspaceMode === "note"
      ? snapshot.workspaceMode
      : fallbackMode,
    noteZoom: Math.max(.5, Math.min(2, snapshot?.noteZoom || 1)),
    savedAt: snapshot?.savedAt || Date.now(),
  };
}

function resultWithWarnings(result: Omit<BootstrapResult, "warnings">, warnings: string[]): BootstrapResult {
  return warnings.length ? { ...result, warnings } : result;
}

function readSnapshot(key: string, warningLabel: string, warnings: string[]) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLibrary;
    return Array.isArray(parsed?.workspaces) && parsed.workspaces.length ? parsed : null;
  } catch {
    warnings.push(`Không thể đọc ${warningLabel}; đã bỏ qua snapshot này.`);
    return null;
  }
}

function readLegacyNotebook(warnings: string[]) {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LegacyNotebookState : null;
  } catch {
    warnings.push("Không thể đọc notebook v1; đã bỏ qua snapshot này.");
    return null;
  }
}

function readLegacyRelation(warnings: string[]) {
  try {
    const raw = localStorage.getItem(LEGACY_RELATION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LegacyRelationV2;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    warnings.push("Không thể đọc relation v2; migration tiếp tục không có relation cũ.");
    return undefined;
  }
}

async function readLegacySnapshots(warnings: string[]): Promise<BootstrapSnapshots> {
  const localSnapshot = readSnapshot(STORAGE_KEY, "library v2", warnings);
  let documentSnapshot: PersistedLibrary | null = null;
  let incrementalSnapshot: PersistedLibrary | null = null;
  try {
    documentSnapshot = readDocumentRuntimeSnapshot();
  } catch {
    warnings.push("Không thể đọc document runtime v1; đã dùng runtime dự phòng.");
  }
  try {
    incrementalSnapshot = await loadIncrementalLibrary() as PersistedLibrary | null;
  } catch {
    warnings.push("Không thể đọc incremental library v5; migration tiếp tục với nguồn cũ hơn.");
  }
  return {
    localSnapshot,
    documentSnapshot,
    incrementalSnapshot,
    legacyNotebook: readLegacyNotebook(warnings),
    relation: readLegacyRelation(warnings),
  };
}

function readPreferredRuntimeSnapshot(snapshots: BootstrapSnapshots) {
  return snapshots.documentSnapshot || snapshots.incrementalSnapshot || snapshots.localSnapshot;
}

async function hasCanonicalV6Library(warnings: string[]) {
  try {
    return Boolean(await noteRepository.loadLibrary());
  } catch {
    warnings.push("Không thể kiểm tra library v6 trước bootstrap; sẽ thử các nguồn migration cũ.");
    return false;
  }
}

async function initializeV6Library(snapshots: BootstrapSnapshots, warnings: string[]) {
  const fallbackWorkspace = createEmptyWorkspace();
  const fallbackSnapshot: PersistedLibrary = {
    workspaces: [fallbackWorkspace],
    activeWorkspaceId: fallbackWorkspace.id,
    readerShare: 50,
    workspaceMode: "note",
    noteZoom: 1,
    savedAt: Date.now(),
  };
  try {
    await noteStore.initialize({
      relation: snapshots.relation,
      localSnapshot: snapshots.incrementalSnapshot || snapshots.localSnapshot || undefined,
      fallbackSnapshot,
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Không thể mở kho note v6");
  }
}

function restoreV6DocumentRuntime(preferred: PersistedLibrary | null, warnings: string[]) {
  const state = noteStore.getSnapshot();
  if (!state.structure) return null;
  const workspaces = runtimeWorkspacesFromDocumentGraph(state.documents, state.structure);
  const preferredActiveId = preferred?.activeWorkspaceId;
  const activeWorkspaceId = preferredActiveId && workspaces.some((workspace) => workspace.id === preferredActiveId && workspace.documents.length > 0)
    ? preferredActiveId
    : NOTE_RUNTIME_WORKSPACE_ID;
  const settings = runtimeSettings(preferred, activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID ? "note" : "split");
  return resultWithWarnings({
    workspaces,
    activeWorkspaceId,
    ...settings,
    workspaceMode: activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID && settings.workspaceMode === "reader"
      ? "note"
      : settings.workspaceMode,
  }, warnings);
}

function restoreLegacyRuntime(preferred: PersistedLibrary | null, warnings: string[]) {
  if (!preferred?.workspaces?.length) return null;
  const documentWorkspaces = persistentDocumentWorkspaces(preferred.workspaces)
    .filter((workspace) => workspace.documents.length > 0)
    .map((workspace) => documentRuntimeWorkspace(normalizeWorkspace(workspace)));
  if (!documentWorkspaces.length) return null;
  const workspaces = [...documentWorkspaces, createNoteRuntimeWorkspace()];
  const activeWorkspaceId = documentWorkspaces.some((workspace) => workspace.id === preferred.activeWorkspaceId)
    ? preferred.activeWorkspaceId
    : NOTE_RUNTIME_WORKSPACE_ID;
  const settings = runtimeSettings(preferred, activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID ? "note" : "split");
  return resultWithWarnings({
    workspaces,
    activeWorkspaceId,
    ...settings,
    workspaceMode: activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID && settings.workspaceMode === "reader" ? "note" : settings.workspaceMode,
  }, warnings);
}

function legacyNotebook(legacy: LegacyNotebookState | null, pdf: StoredPdf | undefined, workspace: WorkspaceItem): Notebook {
  const pages = (legacy?.pages?.length ? legacy.pages : [createBlankPage()]).map(normalizePage);
  const activePageId = pages.some((page) => page.id === legacy?.activeNoteId)
    ? legacy!.activeNoteId!
    : pages[0].id;
  return {
    id: `notebook-${stableId(`${pdf?.name || "legacy-notebook"}:${activePageId}`)}`,
    title: pdf ? `Ghi chú — ${pdf.name.replace(/\.pdf$/i, "")}` : workspace.notebooks[0].title,
    pages,
    activePageId,
    createdAt: Date.now(),
  };
}

async function migrateLegacyCurrentPdf(warnings: string[]) {
  try {
    const storedPdf = await localBinaryStorage.readLegacyCurrentPdf();
    if (!storedPdf) return undefined;
    const document: LibraryDocument = {
      id: `doc-${stableId(`${storedPdf.name}:${storedPdf.blob.size}:legacy`)}`,
      name: storedPdf.name,
      size: storedPdf.blob.size,
      lastModified: 0,
      reader: { ...DEFAULT_READER },
    };
    await localBinaryStorage.savePdf(document.id, document.name, storedPdf.blob);
    return { storedPdf, document };
  } catch {
    warnings.push("Không thể đọc hoặc nhập current-pdf cũ.");
    return undefined;
  }
}

function noteOnlyWorkspace() {
  return createNoteRuntimeWorkspace();
}

async function migrateLegacyNotebook(
  legacy: LegacyNotebookState | null,
  pdfMigration: Awaited<ReturnType<typeof migrateLegacyCurrentPdf>>,
  warnings: string[],
) {
  const workspace = createEmptyWorkspace();
  const notebook = legacyNotebook(legacy, pdfMigration?.storedPdf, workspace);
  const restoredWorkspace: WorkspaceItem = pdfMigration ? {
    id: `workspace-${pdfMigration.document.id}`,
    kind: "document",
    name: pdfMigration.storedPdf.name.replace(/\.pdf$/i, ""),
    documents: [pdfMigration.document],
    activeDocumentId: pdfMigration.document.id,
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  } : {
    ...workspace,
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
  };
  const savedAt = Date.now();
  const snapshot: PersistedLibrary = {
    workspaces: [restoredWorkspace],
    activeWorkspaceId: restoredWorkspace.id,
    readerShare: legacy?.readerShare || 50,
    workspaceMode: pdfMigration ? "split" : "note",
    noteZoom: 1,
    savedAt,
  };
  try {
    await noteStore.replaceFromLegacySnapshot(snapshot);
    const restored = restoreV6DocumentRuntime(snapshot, warnings);
    if (restored) return restored;
    const noteWorkspace = noteOnlyWorkspace();
    return resultWithWarnings({
      workspaces: [noteWorkspace],
      activeWorkspaceId: noteWorkspace.id,
      ...runtimeSettings(snapshot, "note"),
    }, warnings);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Không thể migrate dữ liệu v1");
    const documentWorkspaces = pdfMigration ? [documentRuntimeWorkspace(restoredWorkspace)] : [];
    const noteWorkspace = noteOnlyWorkspace();
    return resultWithWarnings({
      workspaces: [...documentWorkspaces, noteWorkspace],
      activeWorkspaceId: pdfMigration ? restoredWorkspace.id : noteWorkspace.id,
      ...runtimeSettings(snapshot, pdfMigration ? "split" : "note"),
    }, warnings);
  }
}

export async function bootstrapMedNote(): Promise<BootstrapResult> {
  const warnings: string[] = [];
  const snapshots = await readLegacySnapshots(warnings);
  const preferred = readPreferredRuntimeSnapshot(snapshots);
  const hadCanonicalLibrary = await hasCanonicalV6Library(warnings);

  await initializeV6Library(snapshots, warnings);

  const v6Runtime = restoreV6DocumentRuntime(preferred, warnings);
  const v6HasDocuments = Boolean(v6Runtime?.workspaces.some((workspace) => workspace.documents.length > 0));
  if (v6Runtime && (hadCanonicalLibrary || v6HasDocuments)) return v6Runtime;

  const legacyRuntime = restoreLegacyRuntime(preferred, warnings);
  if (legacyRuntime) return legacyRuntime;

  const pdfMigration = await migrateLegacyCurrentPdf(warnings);
  if (snapshots.legacyNotebook || pdfMigration) {
    return migrateLegacyNotebook(snapshots.legacyNotebook, pdfMigration, warnings);
  }

  if (v6Runtime) return v6Runtime;

  const workspace = noteOnlyWorkspace();
  return resultWithWarnings({
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    readerShare: 50,
    workspaceMode: "note",
    noteZoom: 1,
    savedAt: Date.now(),
  }, warnings);
}
