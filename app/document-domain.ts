import type { NoteStructure } from "./note-domain";

export type DocumentRecord = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  available: boolean;
  payload: Record<string, unknown>;
};

export type DocumentContext = {
  id: string;
  kind: string;
  name: string;
  documentIds: string[];
  activeDocumentId: string | null;
  sourcePage: number;
};

export type DocumentGroup = {
  id: string;
  name: string;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type NoteDocumentLink = {
  id: string;
  documentId: string;
  targetType: "page" | "sheet";
  targetId: string;
};

/**
 * Semantics that do not belong in the core many-to-many link. They remain
 * separate so workspace presets and content anchors cannot become a second
 * owner of note hierarchy.
 */
export type DocumentLinkRelation = {
  id: string;
  linkIds: string[];
  kind: "workspace" | "content";
  sourceType: "document" | "group";
  sourceId: string;
  legacyTargetType?: "notebook" | "section" | "page" | "block";
  legacyTargetId?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  workspacePreset?: {
    workspaceMode?: "split" | "reader" | "note";
    readerShare?: number;
    noteZoom?: number;
    activeDocumentId?: string | null;
    pdfPages?: Record<string, number>;
  };
  contentAnchor?: {
    documentId?: string;
    pdfPage?: number;
    rect?: Record<string, unknown>;
    annotationId?: string;
    quote?: string;
  };
};

export type DocumentGraph = {
  documents: DocumentRecord[];
  contexts: DocumentContext[];
  groups: DocumentGroup[];
  links: NoteDocumentLink[];
  linkRelations: DocumentLinkRelation[];
};

export type DocumentInvariantIssue = {
  code: "duplicate-id" | "missing-document" | "missing-group" | "missing-target" | "missing-link" | "invalid-context";
  entity: "document" | "context" | "group" | "link" | "link-relation";
  id: string;
  message: string;
};

export type DocumentNotebookLinkIndex = {
  documentIdsByNotebookId: ReadonlyMap<string, readonly string[]>;
  notebookIdsByDocumentId: ReadonlyMap<string, readonly string[]>;
};

/**
 * Resolve the many-to-many Document -> Page/Sheet links to their owning
 * Notebook once. Runtime and Library projections share this domain index so
 * neither becomes a second owner of the relationship.
 */
export function indexDocumentNotebookLinks(
  graph: DocumentGraph,
  notes: NoteStructure,
): DocumentNotebookLinkIndex {
  const notebookIdBySectionId = new Map(notes.sections.map((section) => [section.id, section.notebookId]));
  const notebookIdByPageId = new Map(notes.pages.map((page) => [page.id, notebookIdBySectionId.get(page.sectionId)]));
  const pageIdBySheetId = new Map(notes.sheets.map((sheet) => [sheet.id, sheet.pageId]));
  const documentIds = new Set(graph.documents.map((record) => record.id));
  const documentIdsByNotebookId = new Map<string, Set<string>>();
  const notebookIdsByDocumentId = new Map<string, Set<string>>();

  graph.links.forEach((link) => {
    if (!documentIds.has(link.documentId)) return;
    const pageId = link.targetType === "page" ? link.targetId : pageIdBySheetId.get(link.targetId);
    const notebookId = pageId ? notebookIdByPageId.get(pageId) : undefined;
    if (!notebookId) return;

    const linkedDocuments = documentIdsByNotebookId.get(notebookId) || new Set<string>();
    linkedDocuments.add(link.documentId);
    documentIdsByNotebookId.set(notebookId, linkedDocuments);

    const linkedNotebooks = notebookIdsByDocumentId.get(link.documentId) || new Set<string>();
    linkedNotebooks.add(notebookId);
    notebookIdsByDocumentId.set(link.documentId, linkedNotebooks);
  });

  return {
    documentIdsByNotebookId: new Map([...documentIdsByNotebookId].map(([id, links]) => [id, [...links]])),
    notebookIdsByDocumentId: new Map([...notebookIdsByDocumentId].map(([id, links]) => [id, [...links]])),
  };
}

export function linkedNotebookIdsForDocuments(
  graph: DocumentGraph,
  notes: NoteStructure,
  documentIds: Iterable<string>,
) {
  const { notebookIdsByDocumentId } = indexDocumentNotebookLinks(graph, notes);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const documentId of documentIds) {
    (notebookIdsByDocumentId.get(documentId) || []).forEach((notebookId) => {
      if (seen.has(notebookId)) return;
      seen.add(notebookId);
      result.push(notebookId);
    });
  }
  return result;
}

export class DocumentInvariantError extends Error {
  readonly issues: DocumentInvariantIssue[];

  constructor(issues: DocumentInvariantIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "DocumentInvariantError";
    this.issues = issues;
  }
}

function duplicateIssues<T extends { id: string }>(records: T[], entity: DocumentInvariantIssue["entity"]) {
  const seen = new Set<string>();
  const issues: DocumentInvariantIssue[] = [];
  records.forEach((record) => {
    if (!record.id || seen.has(record.id)) {
      issues.push({ code: "duplicate-id", entity, id: record.id, message: `${entity} phải có ID thật và duy nhất: ${record.id || "(rỗng)"}` });
    }
    seen.add(record.id);
  });
  return issues;
}

export function validateDocumentGraph(graph: DocumentGraph, notes: NoteStructure): DocumentInvariantIssue[] {
  const issues = [
    ...duplicateIssues(graph.documents, "document"),
    ...duplicateIssues(graph.contexts, "context"),
    ...duplicateIssues(graph.groups, "group"),
    ...duplicateIssues(graph.links, "link"),
    ...duplicateIssues(graph.linkRelations, "link-relation"),
  ];
  const documents = new Set(graph.documents.map((record) => record.id));
  const groups = new Set(graph.groups.map((record) => record.id));
  const links = new Set(graph.links.map((record) => record.id));
  const pages = new Set(notes.pages.map((record) => record.id));
  const sheets = new Set(notes.sheets.map((record) => record.id));

  graph.contexts.forEach((context) => {
    const missing = context.documentIds.filter((id) => !documents.has(id));
    if (missing.length || (context.activeDocumentId && !context.documentIds.includes(context.activeDocumentId))) {
      issues.push({ code: "invalid-context", entity: "context", id: context.id, message: `DocumentContext ${context.id} có document reference không hợp lệ` });
    }
  });
  graph.groups.forEach((group) => {
    group.documentIds.filter((id) => !documents.has(id)).forEach((id) => {
      issues.push({ code: "missing-document", entity: "group", id: group.id, message: `Group ${group.id} không có Document ${id}` });
    });
  });
  graph.links.forEach((link) => {
    if (!documents.has(link.documentId)) {
      issues.push({ code: "missing-document", entity: "link", id: link.id, message: `Link ${link.id} không có Document ${link.documentId}` });
    }
    const targetExists = link.targetType === "page" ? pages.has(link.targetId) : sheets.has(link.targetId);
    if (!targetExists) {
      issues.push({ code: "missing-target", entity: "link", id: link.id, message: `Link ${link.id} không có ${link.targetType} ${link.targetId}` });
    }
  });
  graph.linkRelations.forEach((relation) => {
    relation.linkIds.filter((id) => !links.has(id)).forEach((id) => {
      issues.push({ code: "missing-link", entity: "link-relation", id: relation.id, message: `Link relation ${relation.id} không có core link ${id}` });
    });
    if (relation.sourceType === "document" && !documents.has(relation.sourceId)) {
      issues.push({ code: "missing-document", entity: "link-relation", id: relation.id, message: `Link relation ${relation.id} không có Document nguồn ${relation.sourceId}` });
    }
    if (relation.sourceType === "group" && !groups.has(relation.sourceId)) {
      issues.push({ code: "missing-group", entity: "link-relation", id: relation.id, message: `Link relation ${relation.id} không có Group nguồn ${relation.sourceId}` });
    }
  });
  return issues;
}

export function assertDocumentGraph(graph: DocumentGraph, notes: NoteStructure) {
  const issues = validateDocumentGraph(graph, notes);
  if (issues.length) throw new DocumentInvariantError(issues);
}
