export const APP_KEY = "mednote-library-v2";
export const RELATION_KEY = "mednote-relations-v2";
export const LEGACY_META_KEY = "mednote-independent-library-v1";
export const BACKUP_KEY = "mednote-library-v2-before-relations-v2";
export const DB_NAME = "mednote-local";
export const DB_STORE = "documents";
export const META_WORKSPACE_ID = "__mednote_relations_v2__";
export const PLACEHOLDER_PREFIX = "__mednote_reader_placeholder__:";
export const GENERATED_NOTE_PREFIX = "Ghi chú —";
export const SOURCE_WORKSPACE_PREFIX = "relation-source:";
export const NOTE_WORKSPACE_PREFIX = "relation-note:";

export const IMPORT_SESSION_KEY = "mednote-relation-import-baseline";

export type RelationKind = "workspace" | "content";
export type SourceType = "document" | "group";
export type TargetType = "notebook" | "section" | "page" | "block";

export type AnyObject = Record<string, any>;

export type AppState = {
  workspaces: AnyObject[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
  savedAt?: number;
};

export type RelationSource = { type: SourceType; id: string };
export type RelationTarget = {
  type: TargetType;
  id: string;
  notebookId: string;
  sectionId?: string;
  pageId?: string;
};

export type WorkspaceRelation = {
  id: string;
  kind: "workspace";
  source: RelationSource;
  target: RelationTarget;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  snapshot?: {
    workspaceMode?: "split" | "reader" | "note";
    readerShare?: number;
    noteZoom?: number;
    activeDocumentId?: string | null;
    pdfPages?: Record<string, number>;
  };
};

export type ContentRelation = {
  id: string;
  kind: "content";
  source: RelationSource;
  target: RelationTarget;
  createdAt: number;
  updatedAt: number;
  locator?: {
    documentId?: string;
    pdfPage?: number;
    rect?: AnyObject;
    annotationId?: string;
    quote?: string;
  };
};

export type Relation = WorkspaceRelation | ContentRelation;

export type DocumentRecord = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  available: boolean;
};

export type DocumentGroup = {
  id: string;
  name: string;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type NoteSection = {
  id: string;
  title: string;
  pageIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type NotebookRecord = {
  id: string;
  title: string;
  workspaceId: string;
  sections: NoteSection[];
  activeSectionId: string;
  available: boolean;
  updatedAt: number;
};

export type RelationLibrary = {
  version: 2;
  documents: DocumentRecord[];
  groups: DocumentGroup[];
  notebooks: NotebookRecord[];
  relations: Relation[];
  migratedLegacyV1?: boolean;
  updatedAt: number;
};

export type LibraryView = RelationLibrary & {
  pages: Record<string, { id: string; title: string; notebookId: string; sectionId: string }>;
};

export const now = () => Date.now();
export const uid = (prefix: string) => {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const cleanPdfTitle = (name: string) => name.replace(/\.pdf$/i, "") || "Tài liệu PDF";
export { cleanPdfTitle as titleOf };

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function readAppState(): AppState | null {
  const value = readJson<AppState | null>(APP_KEY, null);
  return value && Array.isArray(value.workspaces) ? value : null;
}

export function blankPage(id = uid("page"), title = "Trang 1") {
  return {
    id,
    title,
    titleHtml: title,
    body: "",
    bodyHtml: "",
    citationPage: null,
    strokes: [],
    excerpts: [],
    paper: { size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
    text: { font: "times", size: 12, color: "auto", bold: false, italic: false, underline: false, align: "left" },
  };
}

export function createNotebookObject(title: string) {
  const page = blankPage();
  return {
    id: uid("notebook"),
    title,
    pages: [page],
    activePageId: page.id,
    createdAt: now(),
  };
}

export function placeholderNotebook(sourceId: string) {
  const page = blankPage(`${PLACEHOLDER_PREFIX}page:${sourceId}`, "Reader");
  return {
    id: `${PLACEHOLDER_PREFIX}${sourceId}`,
    title: "Reader",
    pages: [page],
    activePageId: page.id,
    createdAt: 0,
  };
}

export function isPlaceholderNotebook(notebook: AnyObject | undefined) {
  return Boolean(notebook && String(notebook.id || "").startsWith(PLACEHOLDER_PREFIX));
}

export function defaultTemplateIsUntouched(page: AnyObject | undefined) {
  if (!page || page.strokes?.length || page.excerpts?.length) return false;
  const text = `${page.body || ""} ${page.bodyHtml || ""}`
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return true;
  return page.paper?.template === "first-aid"
    && String(page.title || "").trim() === "TÊN CHỦ ĐỀ"
    && /TỔNG QUAN/i.test(text)
    && /YẾU TỐ NGUY CƠ/i.test(text)
    && /CHẨN ĐOÁN/i.test(text);
}

export function untouchedGeneratedNotebook(workspace: AnyObject, notebook: AnyObject) {
  return workspace.documents?.length
    && String(notebook.title || "").startsWith(GENERATED_NOTE_PREFIX)
    && notebook.pages?.length === 1
    && defaultTemplateIsUntouched(notebook.pages[0]);
}

export function emptyLibrary(): RelationLibrary {
  return { version: 2, documents: [], groups: [], notebooks: [], relations: [], updatedAt: now() };
}

export function hiddenWorkspace(library: RelationLibrary) {
  const placeholder = placeholderNotebook("relations-meta");
  return {
    id: META_WORKSPACE_ID,
    kind: "empty",
    name: "MedNote Relations",
    documents: [],
    activeDocumentId: null,
    notebooks: [placeholder],
    activeNotebookId: placeholder.id,
    sourcePage: 1,
    relationLibrary: library,
  };
}

export function libraryFromState(state: AppState | null) {
  const embedded = state?.workspaces.find((workspace) => workspace.id === META_WORKSPACE_ID)?.relationLibrary as RelationLibrary | undefined;
  const local = readJson<RelationLibrary | null>(RELATION_KEY, null);
  if (local?.version === 2 && embedded?.version === 2) return local.updatedAt >= embedded.updatedAt ? local : embedded;
  if (local?.version === 2) return local;
  if (embedded?.version === 2) return embedded;
  return emptyLibrary();
}

export function stableLibrary(library: RelationLibrary) {
  return JSON.stringify({ ...library, updatedAt: 0 });
}

export function writeStateAndLibrary(state: AppState, library: RelationLibrary, forceState = true) {
  const nextLibrary = { ...library, version: 2 as const, updatedAt: now() };
  localStorage.setItem(RELATION_KEY, JSON.stringify(nextLibrary));
  const workspaces = state.workspaces.filter((workspace) => workspace.id !== META_WORKSPACE_ID);
  workspaces.push(hiddenWorkspace(nextLibrary));
  const nextState = { ...state, workspaces, savedAt: now() };
  if (forceState) {
    localStorage.setItem(APP_KEY, JSON.stringify(nextState));
    // Chained sidebar actions (for example: create Sheet, then open it) must
    // immediately read the state they just wrote. Otherwise readAppState()
    // still sees React's previous live snapshot and silently rolls the action back.
    if (typeof window !== "undefined") {
      (window as Window & { __MEDNOTE_LIVE_STATE__?: AppState }).__MEDNOTE_LIVE_STATE__ = clone(nextState);
      window.dispatchEvent(new CustomEvent("mednote-live-state-changed"));
    }
  }
  return { state: nextState, library: nextLibrary };
}

export function ensureVisibleWorkspace(state: AppState) {
  const visible = state.workspaces.filter((workspace) => workspace.id !== META_WORKSPACE_ID);
  if (visible.length) {
    if (!visible.some((workspace) => workspace.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = visible[0].id;
      state.workspaceMode = visible[0].documents?.length ? "reader" : "note";
    }
    return;
  }
  const notebook = createNotebookObject("Sổ ghi chú mới");
  state.workspaces.push({
    id: `${NOTE_WORKSPACE_PREFIX}${notebook.id}`,
    kind: "empty",
    name: notebook.title,
    documents: [],
    activeDocumentId: null,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  });
  state.activeWorkspaceId = `${NOTE_WORKSPACE_PREFIX}${notebook.id}`;
  state.workspaceMode = "note";
}

export function normalizeSections(record: NotebookRecord | undefined, notebook: AnyObject): NotebookRecord {
  const pages = Array.isArray(notebook.pages) ? notebook.pages : [];
  const pageIds = new Set(pages.map((page: AnyObject) => String(page.id)));
  const seen = new Set<string>();
  const sections = (record?.sections || []).map((section, index, source) => ({
    ...section,
    title: source.length === 1 && section.title === "Chưa phân loại" ? "Phần 1" : section.title,
    pageIds: section.pageIds.filter((id) => pageIds.has(id) && !seen.has(id) && Boolean(seen.add(id))),
  })).filter((section) => section.pageIds.length || section.title !== "Chưa phân loại");
  const missing = pages.map((page: AnyObject) => String(page.id)).filter((id: string) => !seen.has(id));
  if (!sections.length) {
    sections.push({ id: uid("section"), title: "Phần 1", pageIds: [], createdAt: now(), updatedAt: now() });
  }
  const preferred = sections.find((section) => section.id === record?.activeSectionId) || sections[0];
  preferred.pageIds.push(...missing);
  const activeSection = sections.find((section) => section.pageIds.includes(String(notebook.activePageId || ""))) || preferred;
  const next = {
    id: String(notebook.id),
    title: String(notebook.title || "Sổ ghi chú"),
    workspaceId: record?.workspaceId || `${NOTE_WORKSPACE_PREFIX}${notebook.id}`,
    sections,
    activeSectionId: activeSection.id,
    available: true,
    updatedAt: record?.updatedAt || now(),
  };
  if (record) {
    const previousShape = JSON.stringify({ title: record.title, workspaceId: record.workspaceId, sections: record.sections, activeSectionId: record.activeSectionId, available: record.available });
    const nextShape = JSON.stringify({ title: next.title, workspaceId: next.workspaceId, sections: next.sections, activeSectionId: next.activeSectionId, available: next.available });
    if (previousShape !== nextShape) next.updatedAt = now();
  }
  return next;
}

export function findNotebook(state: AppState, notebookId: string) {
  for (const workspace of state.workspaces) {
    const notebook = workspace.notebooks?.find((item: AnyObject) => String(item.id) === notebookId && !isPlaceholderNotebook(item));
    if (notebook) return { workspace, notebook };
  }
  return null;
}

export function findPageContext(library: RelationLibrary, pageId: string) {
  for (const notebook of library.notebooks) {
    for (const section of notebook.sections) {
      if (section.pageIds.includes(pageId)) return { notebook, section };
    }
  }
  return null;
}

export function sourceKey(source: RelationSource) {
  return `${source.type}:${source.id}`;
}

export function targetKey(target: RelationTarget) {
  return `${target.type}:${target.id}`;
}

export function sameEndpoints(a: Relation, source: RelationSource, target: RelationTarget) {
  return sourceKey(a.source) === sourceKey(source) && targetKey(a.target) === targetKey(target);
}

export function dedupeRelations(relations: Relation[]) {
  const result: Relation[] = [];
  for (const relation of [...relations].sort((a, b) => a.updatedAt - b.updatedAt)) {
    const index = result.findIndex((item) => sameEndpoints(item, relation.source, relation.target));
    if (index >= 0) result.splice(index, 1);
    result.push(relation);
  }
  return result;
}

export function importLegacyRelations(library: RelationLibrary) {
  if (library.migratedLegacyV1) return library;
  const legacy = readJson<AnyObject | null>(LEGACY_META_KEY, null);
  if (legacy?.notebooks && Array.isArray(legacy.notebooks)) {
    for (const item of legacy.notebooks) {
      if (!item.linkedDocumentId || !item.id) continue;
      const target: RelationTarget = { type: "notebook", id: String(item.id), notebookId: String(item.id) };
      const source: RelationSource = { type: "document", id: String(item.linkedDocumentId) };
      library.relations = library.relations.filter((relation) => !sameEndpoints(relation, source, target));
      library.relations.push({
        id: uid("workspace-relation"), kind: "workspace", source, target,
        isDefault: true, createdAt: now(), updatedAt: now(),
      });
    }
  }
  library.migratedLegacyV1 = true;
  return library;
}
