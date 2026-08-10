import type { PdfAnnotation, PdfFitMode, PdfViewMode } from "./pdf-reader";
import type { DocumentGraph, DocumentRecord } from "./document-domain";
import type { SaveDocumentWorkspaceInput } from "./document-repository";
import type { DriveLibrary } from "./drive-backup";
import type { NoteStructure } from "./note-domain";
import { DEFAULT_NEW_NOTE_PAPER, createBlankPage, createNotebook, normalizePage, type Notebook, type NotePage } from "./note-runtime-adapter";

export type LibraryDocument = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  reader: ReaderState;
};

export type ReaderState = {
  page: number;
  zoom: number;
  fitMode: PdfFitMode;
  rotation: number;
  viewMode: PdfViewMode;
  bookmarks: number[];
  annotations: PdfAnnotation[];
};

export type WorkspaceMode = "split" | "reader" | "note";

export type WorkspaceItem = {
  id: string;
  kind: "document" | "collection" | "temporary" | "demo" | "empty";
  name: string;
  documents: LibraryDocument[];
  activeDocumentId: string | null;
  /** Document-runtime adapter only; Notebook ownership remains in v6. */
  noteNotebookId?: string | null;
  notebooks: Notebook[];
  activeNotebookId: string;
  sourcePage: number;
};

export type PersistedLibrary = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode?: WorkspaceMode;
  noteZoom?: number;
  savedAt?: number;
};

export type LinkedNoteTarget = { targetType: "page" | "sheet"; targetId: string };

export const DEFAULT_READER: ReaderState = { page: 1, zoom: 1, fitMode: "page", rotation: 0, viewMode: "single", bookmarks: [], annotations: [] };

export const READER_PLACEHOLDER_PREFIX = "__mednote_reader_placeholder__:";

function runtimeStableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function normalizeReader(reader?: Partial<ReaderState>): ReaderState {
  return {
    ...DEFAULT_READER,
    ...reader,
    bookmarks: Array.isArray(reader?.bookmarks) ? reader.bookmarks : [],
    annotations: Array.isArray(reader?.annotations) ? reader.annotations : [],
  };
}

export function normalizeWorkspace(workspace: WorkspaceItem): WorkspaceItem {
  return {
    ...workspace,
    documents: workspace.documents.map((document) => ({ ...document, reader: normalizeReader(document.reader) })),
    notebooks: workspace.notebooks.map((notebook) => ({
      ...notebook,
      pages: notebook.pages.map(normalizePage),
    })),
  };
}

export function documentRuntimeWorkspace(workspace: WorkspaceItem): WorkspaceItem {
  const placeholder = createReaderPlaceholder(workspace.id);
  const linkedNotebookId = workspace.noteNotebookId
    || workspace.notebooks.find((notebook) => !isReaderPlaceholder(notebook) && notebook.id === workspace.activeNotebookId)?.id
    || workspace.notebooks.find((notebook) => !isReaderPlaceholder(notebook))?.id
    || null;
  return {
    ...workspace,
    noteNotebookId: linkedNotebookId,
    notebooks: [placeholder],
    activeNotebookId: placeholder.id,
  };
}

export function documentRecordFromRuntime(document: LibraryDocument): DocumentRecord {
  return {
    id: document.id,
    name: document.name,
    size: document.size,
    lastModified: document.lastModified,
    available: true,
    payload: { reader: normalizeReader(document.reader) },
  };
}

export function documentWorkspaceInput(
  workspace: WorkspaceItem,
  target: LinkedNoteTarget | null,
  preset: { workspaceMode: WorkspaceMode; readerShare: number; noteZoom: number },
): SaveDocumentWorkspaceInput {
  const now = Date.now();
  const documents = workspace.documents.map(documentRecordFromRuntime);
  const group = documents.length > 1 ? {
    id: workspace.id,
    name: workspace.name,
    documentIds: documents.map((document) => document.id),
    createdAt: now,
    updatedAt: now,
  } : undefined;
  const links = target ? documents.map((document) => ({
    id: `link-${runtimeStableId(`${document.id}:${target.targetType}:${target.targetId}`)}`,
    documentId: document.id,
    targetType: target.targetType,
    targetId: target.targetId,
  })) : [];
  const linkRelations = target && links.length ? [{
    id: `relation-${runtimeStableId(`${workspace.id}:${target.targetType}:${target.targetId}`)}`,
    linkIds: links.map((link) => link.id),
    kind: "workspace" as const,
    sourceType: group ? "group" as const : "document" as const,
    sourceId: group?.id || documents[0].id,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    workspacePreset: {
      workspaceMode: preset.workspaceMode,
      readerShare: preset.readerShare,
      noteZoom: preset.noteZoom,
      activeDocumentId: workspace.activeDocumentId,
      pdfPages: Object.fromEntries(workspace.documents.map((document) => [document.id, document.reader.page])),
    },
  }] : [];
  return {
    documents,
    context: {
      id: workspace.id,
      kind: workspace.kind,
      name: workspace.name,
      documentIds: documents.map((document) => document.id),
      activeDocumentId: workspace.activeDocumentId,
      sourcePage: workspace.sourcePage,
    },
    group,
    links,
    linkRelations,
  };
}

export function notebookIdForDocumentContext(graph: DocumentGraph, structure: NoteStructure, documentIds: string[]) {
  const documentSet = new Set(documentIds);
  const link = graph.links.find((record) => documentSet.has(record.documentId));
  if (!link) return null;
  const pageId = link.targetType === "page"
    ? link.targetId
    : structure.sheets.find((sheet) => sheet.id === link.targetId)?.pageId;
  const page = structure.pages.find((record) => record.id === pageId);
  const section = page && structure.sections.find((record) => record.id === page.sectionId);
  return section?.notebookId || null;
}

export function workspacesFromDocumentGraph(graph: DocumentGraph, structure: NoteStructure): WorkspaceItem[] {
  const documents = new Map(graph.documents.map((document) => [document.id, document]));
  return graph.contexts.filter((context) => context.kind !== "temporary").flatMap((context) => {
    const contextDocuments = context.documentIds.flatMap((id) => {
      const document = documents.get(id);
      if (!document) return [];
      return [{
        id: document.id,
        name: document.name,
        size: document.size,
        lastModified: document.lastModified,
        reader: normalizeReader(document.payload.reader as Partial<ReaderState> | undefined),
      } satisfies LibraryDocument];
    });
    if (!contextDocuments.length) return [];
    const kind = context.kind === "collection" || context.kind === "demo" || context.kind === "empty" ? context.kind : "document";
    const placeholder = createReaderPlaceholder(context.id);
    return [{
      id: context.id,
      kind,
      name: context.name,
      documents: contextDocuments,
      activeDocumentId: context.activeDocumentId && contextDocuments.some((document) => document.id === context.activeDocumentId)
        ? context.activeDocumentId
        : contextDocuments[0].id,
      noteNotebookId: notebookIdForDocumentContext(graph, structure, context.documentIds),
      notebooks: [placeholder],
      activeNotebookId: placeholder.id,
      sourcePage: Math.max(1, context.sourcePage || 1),
    } satisfies WorkspaceItem];
  });
}

export function workspacesFromLibraryV6(library: DriveLibrary): WorkspaceItem[] {
  return workspacesFromDocumentGraph(library.documents, library.notes);
}

export function createReaderPlaceholder(sourceId: string): Notebook {
  const page = createBlankPage(null, 1, { ...DEFAULT_NEW_NOTE_PAPER, template: "blank" });
  page.id = `${READER_PLACEHOLDER_PREFIX}page:${sourceId}`;
  page.title = "Reader";
  page.body = "";
  page.bodyHtml = "";
  return {
    id: `${READER_PLACEHOLDER_PREFIX}${sourceId}`,
    title: "Reader",
    pages: [page],
    activePageId: page.id,
    createdAt: 0,
  };
}

export function isReaderPlaceholder(notebook: Notebook | undefined) {
  return Boolean(notebook && notebook.id.startsWith(READER_PLACEHOLDER_PREFIX));
}

export function createDemoWorkspace(pages: NotePage[]): WorkspaceItem {
  const notebook: Notebook = {
    id: "demo-notebook",
    title: "Ghi chú mẫu",
    pages,
    activePageId: pages[0].id,
    createdAt: 0,
  };
  return {
    id: "demo-workspace",
    kind: "demo",
    name: "Diabetic Neuropathy — Chapter 3",
    documents: [],
    activeDocumentId: null,
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 126,
  };
}

export function createEmptyWorkspace(): WorkspaceItem {
  const notebook = createNotebook("Ghi chú mới");
  return {
    id: "empty-workspace",
    kind: "empty",
    name: "Chưa có tài liệu",
    documents: [],
    activeDocumentId: null,
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  };
}
