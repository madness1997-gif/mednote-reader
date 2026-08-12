import { indexDocumentNotebookLinks, type DocumentGraph } from "./document-domain";
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
  name: string;
  documentCount: number;
  linkedNotebookIds: string[];
};

export type LibraryProjection = {
  notes: NoteLibraryItem[];
  documents: DocumentLibraryItem[];
};

export function projectLibrary(structure: NoteStructure, graph: DocumentGraph): LibraryProjection {
  const documentById = new Map(graph.documents.map((document) => [document.id, document]));
  const { documentIdsByNotebookId, notebookIdsByDocumentId } = indexDocumentNotebookLinks(graph, structure);
  const sectionsByNotebookId = new Map<string, number>();
  const pagesByNotebookId = new Map<string, number>();
  const sheetsByNotebookId = new Map<string, number>();
  const notebookIdBySectionId = new Map(structure.sections.map((section) => [section.id, section.notebookId]));
  const notebookIdByPageId = new Map(structure.pages.map((page) => [page.id, notebookIdBySectionId.get(page.sectionId)]));

  structure.sections.forEach((section) => {
    sectionsByNotebookId.set(section.notebookId, (sectionsByNotebookId.get(section.notebookId) || 0) + 1);
  });
  structure.pages.forEach((page) => {
    const notebookId = notebookIdByPageId.get(page.id);
    if (notebookId) pagesByNotebookId.set(notebookId, (pagesByNotebookId.get(notebookId) || 0) + 1);
  });
  structure.sheets.forEach((sheet) => {
    const notebookId = notebookIdByPageId.get(sheet.pageId);
    if (notebookId) sheetsByNotebookId.set(notebookId, (sheetsByNotebookId.get(notebookId) || 0) + 1);
  });

  const notes = ordered(structure.notebooks).map((notebook) => {
    const linkedDocumentIds = [...(documentIdsByNotebookId.get(notebook.id) || [])];
    return {
      id: notebook.id,
      title: notebook.title,
      sectionCount: sectionsByNotebookId.get(notebook.id) || 0,
      pageCount: pagesByNotebookId.get(notebook.id) || 0,
      sheetCount: sheetsByNotebookId.get(notebook.id) || 0,
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
      const contextDocumentIds = context.documentIds.filter((id) => documentById.has(id));
      if (!contextDocumentIds.length) return [];
      return [{
        id: context.id,
        name: context.name,
        documentCount: contextDocumentIds.length,
        linkedNotebookIds: [...new Set(contextDocumentIds.flatMap((documentId) => notebookIdsByDocumentId.get(documentId) || []))],
      } satisfies DocumentLibraryItem];
    });

  return { notes, documents };
}
