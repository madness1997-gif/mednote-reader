import type { DocumentGraph, DocumentRecord } from "./document-domain";
import { ordered, type NoteStructure } from "./note-domain";

export type NoteLibraryItem = {
  id: string;
  title: string;
  sectionCount: number;
  pageCount: number;
  sheetCount: number;
  linkedDocumentIds: string[];
  linkedDocuments: { id: string; name: string }[];
};

export type DocumentLibraryItem = {
  id: string;
  kind: string;
  name: string;
  documents: DocumentRecord[];
  activeDocumentId: string | null;
  sourcePage: number;
  linkedNotebookIds: string[];
};

export type LibraryProjection = {
  notes: NoteLibraryItem[];
  documents: DocumentLibraryItem[];
};

function notebookIdForTarget(
  structure: NoteStructure,
  targetType: "page" | "sheet",
  targetId: string,
) {
  const pageId = targetType === "page"
    ? targetId
    : structure.sheets.find((sheet) => sheet.id === targetId)?.pageId;
  const page = structure.pages.find((record) => record.id === pageId);
  const section = page && structure.sections.find((record) => record.id === page.sectionId);
  return section?.notebookId || null;
}

export function linkedNotebookIdsForDocuments(
  graph: DocumentGraph,
  structure: NoteStructure,
  documentIds: Iterable<string>,
) {
  const documentSet = new Set(documentIds);
  const result: string[] = [];
  const seen = new Set<string>();
  graph.links.forEach((link) => {
    if (!documentSet.has(link.documentId)) return;
    const notebookId = notebookIdForTarget(structure, link.targetType, link.targetId);
    if (!notebookId || seen.has(notebookId)) return;
    seen.add(notebookId);
    result.push(notebookId);
  });
  return result;
}

export function linkedDocumentIdsForNotebook(
  graph: DocumentGraph,
  structure: NoteStructure,
  notebookId: string,
) {
  const result: string[] = [];
  const seen = new Set<string>();
  graph.links.forEach((link) => {
    if (notebookIdForTarget(structure, link.targetType, link.targetId) !== notebookId || seen.has(link.documentId)) return;
    seen.add(link.documentId);
    result.push(link.documentId);
  });
  return result;
}

export function projectLibrary(structure: NoteStructure, graph: DocumentGraph): LibraryProjection {
  const documentById = new Map(graph.documents.map((document) => [document.id, document]));
  const notes = ordered(structure.notebooks).map((notebook) => {
    const sections = structure.sections.filter((section) => section.notebookId === notebook.id);
    const sectionIds = new Set(sections.map((section) => section.id));
    const pages = structure.pages.filter((page) => sectionIds.has(page.sectionId));
    const pageIds = new Set(pages.map((page) => page.id));
    const linkedDocumentIds = linkedDocumentIdsForNotebook(graph, structure, notebook.id);
    return {
      id: notebook.id,
      title: notebook.title,
      sectionCount: sections.length,
      pageCount: pages.length,
      sheetCount: structure.sheets.filter((sheet) => pageIds.has(sheet.pageId)).length,
      linkedDocumentIds,
      linkedDocuments: linkedDocumentIds.flatMap((id) => {
        const document = documentById.get(id);
        return document ? [{ id: document.id, name: document.name }] : [];
      }),
    } satisfies NoteLibraryItem;
  });

  const documents = graph.contexts
    .filter((context) => context.kind !== "temporary")
    .flatMap((context) => {
      const contextDocuments = context.documentIds.flatMap((id) => {
        const document = documentById.get(id);
        return document ? [document] : [];
      });
      if (!contextDocuments.length) return [];
      return [{
        id: context.id,
        kind: context.kind,
        name: context.name,
        documents: contextDocuments,
        activeDocumentId: context.activeDocumentId && contextDocuments.some((document) => document.id === context.activeDocumentId)
          ? context.activeDocumentId
          : contextDocuments[0]?.id || null,
        sourcePage: Math.max(1, context.sourcePage || 1),
        linkedNotebookIds: linkedNotebookIdsForDocuments(graph, structure, contextDocuments.map((document) => document.id)),
      } satisfies DocumentLibraryItem];
    });

  return { notes, documents };
}
