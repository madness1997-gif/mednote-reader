import assert from "node:assert/strict";
import test from "node:test";

import { projectLibrary, linkedNotebookIdsForDocuments } from "../app/library-projection";
import { NOTE_RUNTIME_WORKSPACE_ID, runtimeWorkspacesFromDocumentGraph } from "../app/document-runtime-adapter";
import type { DocumentGraph } from "../app/document-domain";
import type { NoteStructure } from "../app/note-domain";

function fixture() {
  const notebooks = Array.from({ length: 5 }, (_, index) => ({ id: `nb-${index + 1}`, title: `Notebook ${index + 1}`, order: index }));
  const sections = notebooks.map((notebook, index) => ({ id: `sec-${index + 1}`, notebookId: notebook.id, title: `Section ${index + 1}`, order: 0 }));
  const pages = sections.map((section, index) => ({ id: `page-${index + 1}`, sectionId: section.id, title: `Page ${index + 1}`, order: 0 }));
  const sheets = pages.map((page, index) => ({ id: `sheet-${index + 1}`, pageId: page.id, order: 0 }));
  const structure: NoteStructure = {
    workspace: { id: "workspace", title: "MedNote" }, notebooks, sections, pages, sheets,
    active: { activeNotebookId: "nb-5", activeSectionId: "sec-5", activePageId: "page-5", activeSheetId: "sheet-5" },
  };
  const graph: DocumentGraph = {
    documents: [
      { id: "doc-1", name: "One.pdf", size: 10, lastModified: 1, available: true, payload: {} },
      { id: "doc-2", name: "Two.pdf", size: 20, lastModified: 2, available: true, payload: {} },
      { id: "temp-doc", name: "Temp.pdf", size: 1, lastModified: 3, available: true, payload: {} },
    ],
    contexts: [
      { id: "ctx-1", kind: "document", name: "One", documentIds: ["doc-1"], activeDocumentId: "doc-1", sourcePage: 1 },
      { id: "ctx-2", kind: "document", name: "Two", documentIds: ["doc-2"], activeDocumentId: "doc-2", sourcePage: 2 },
      { id: "temp-ctx", kind: "temporary", name: "Temp", documentIds: ["temp-doc"], activeDocumentId: "temp-doc", sourcePage: 1 },
    ],
    groups: [],
    links: [
      { id: "link-1", documentId: "doc-1", targetType: "page", targetId: "page-1" },
      { id: "link-2", documentId: "doc-2", targetType: "sheet", targetId: "sheet-2" },
      { id: "link-3", documentId: "doc-1", targetType: "sheet", targetId: "sheet-2" },
    ],
    linkRelations: [],
  };
  return { structure, graph };
}

test("Library notes are a total projection of NoteStructure while documents exclude temporary contexts", () => {
  const { structure, graph } = fixture();
  const projected = projectLibrary(structure, graph);
  assert.equal(projected.notes.length, structure.notebooks.length);
  assert.deepEqual(projected.notes.map((item) => item.id), ["nb-1", "nb-2", "nb-3", "nb-4", "nb-5"]);
  assert.equal(projected.documents.length, 2);
  assert.equal(projected.documents.some((item) => item.id === "temp-ctx"), false);
  assert.deepEqual(projected.notes.find((item) => item.id === "nb-1")?.linkedDocumentIds, ["doc-1"]);
  assert.deepEqual(projected.notes.find((item) => item.id === "nb-2")?.linkedDocumentIds, ["doc-2", "doc-1"]);
  assert.equal(projected.notes.find((item) => item.id === "nb-5")?.linkedDocumentIds.length, 0);
});

test("one document resolves every linked Notebook instead of first-link ownership", () => {
  const { structure, graph } = fixture();
  assert.deepEqual(linkedNotebookIdsForDocuments(graph, structure, ["doc-1"]), ["nb-1", "nb-2"]);
  assert.deepEqual(projectLibrary(structure, graph).documents.find((item) => item.id === "ctx-1")?.linkedNotebookIds, ["nb-1", "nb-2"]);
});

test("unlink and PDF deletion never remove canonical notebooks", () => {
  const { structure, graph } = fixture();
  const unlinked = { ...graph, links: graph.links.filter((link) => link.documentId !== "doc-1") };
  assert.equal(projectLibrary(structure, unlinked).notes.length, 5);
  const deleted: DocumentGraph = {
    ...graph,
    documents: graph.documents.filter((document) => document.id !== "doc-1"),
    contexts: graph.contexts.filter((context) => context.id !== "ctx-1"),
    links: graph.links.filter((link) => link.documentId !== "doc-1"),
  };
  assert.equal(projectLibrary(structure, deleted).notes.length, 5);
  assert.deepEqual(projectLibrary(structure, deleted).notes.map((item) => item.id), structure.notebooks.map((item) => item.id));
});

test("runtime is document projection plus one stable note shell, never one workspace per Notebook", () => {
  const { structure, graph } = fixture();
  const runtime = runtimeWorkspacesFromDocumentGraph(graph, structure);
  assert.equal(runtime.filter((workspace) => workspace.id === NOTE_RUNTIME_WORKSPACE_ID).length, 1);
  assert.equal(runtime.length, 3);
  assert.equal(runtime.some((workspace) => workspace.id === "temp-ctx"), false);
  assert.equal(runtime.filter((workspace) => workspace.documents.length === 0).length, 1);
});

test("create A then B remains a two-Notebook canonical Library independent of runtime ownership", () => {
  const { structure, graph } = fixture();
  const two = { ...structure, notebooks: structure.notebooks.slice(0, 2), sections: structure.sections.slice(0, 2), pages: structure.pages.slice(0, 2), sheets: structure.sheets.slice(0, 2) };
  const projected = projectLibrary(two, { ...graph, links: [] });
  assert.deepEqual(projected.notes.map((item) => item.id), ["nb-1", "nb-2"]);
});
