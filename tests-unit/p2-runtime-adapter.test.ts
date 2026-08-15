import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentGraph } from "../app/document-domain";
import { ordered, type NoteStructure } from "../app/note-domain";
import {
  DEFAULT_PAPER,
  createBlankPage,
  notePageToSheetContent,
  notebookFromStructure,
} from "../app/note-runtime-adapter";
import {
  createReaderPlaceholder,
  documentRuntimeWorkspace,
  documentWorkspaceInput,
  isReaderPlaceholder,
  workspacesFromDocumentGraph,
  type WorkspaceItem,
} from "../app/document-runtime-adapter";

function structureFixture(): NoteStructure {
  return {
    workspace: { id: "workspace", title: "MedNote" },
    notebooks: [{ id: "n1", title: "Sổ 1", order: 0 }],
    sections: [
      { id: "s2", notebookId: "n1", title: "Phần 2", order: 1 },
      { id: "s1", notebookId: "n1", title: "Phần 1", order: 0 },
    ],
    pages: [
      { id: "p2", sectionId: "s1", title: "Page 2", order: 1 },
      { id: "p3", sectionId: "s2", title: "Page 3", order: 0 },
      { id: "p1", sectionId: "s1", title: "Page 1", order: 0 },
    ],
    sheets: [
      { id: "sh2", pageId: "p1", order: 1 },
      { id: "sh4", pageId: "p3", order: 0 },
      { id: "sh1", pageId: "p1", order: 0 },
      { id: "sh3", pageId: "p2", order: 0 },
    ],
    active: { activeNotebookId: "n1", activeSectionId: "s1", activePageId: "p1", activeSheetId: "sh1" },
  };
}

test("P2 v6 structure keeps full runtime navigation while unsupplied Sheets stay lazy", () => {
  const structure = structureFixture();
  assert.deepEqual(ordered(structure.sections.filter((section) => section.notebookId === "n1")).map((section) => section.id), ["s1", "s2"]);
  assert.deepEqual(ordered(structure.pages.filter((page) => page.sectionId === "s1")).map((page) => page.id), ["p1", "p2"]);
  assert.deepEqual(ordered(structure.sheets.filter((sheet) => sheet.pageId === "p1")).map((sheet) => sheet.id), ["sh1", "sh2"]);

  const runtime = notebookFromStructure(
    structure,
    "n1",
    { sh1: { body: "Sheet 1" } },
    { body: "Active draft" },
  );
  assert.ok(runtime);
  assert.deepEqual(runtime.pages.map((page) => page.id), ["sh1", "sh2", "sh3", "sh4"]);
  assert.deepEqual(runtime.pages.map((page) => page.title), ["Page 1", "Page 1", "Page 2", "Page 3"]);
  assert.equal(runtime.pages[0].body, "Sheet 1");
  assert.equal(runtime.pages[0].paper.template, "ruled");
  assert.equal(runtime.pages[0].__mednoteLazyPage, undefined);
  assert.equal(runtime.pages[1].__mednoteLazyPage, true);
  assert.equal(runtime.pages[2].__mednoteLazyPage, true);
  assert.equal(runtime.pages[3].__mednoteLazyPage, true);
  assert.equal(runtime.activePageId, "sh1");
});

test("P2 note runtime round-trip never writes navigation metadata into SheetContent", () => {
  const page = createBlankPage(null, 1, DEFAULT_PAPER);
  page.id = "sheet-1";
  page.title = "Current Page title";
  page.titleHtml = "<b>legacy</b>";
  page.__mednoteLazyPage = true;
  page.body = "Draft body";
  const content = notePageToSheetContent(page);
  assert.equal(content.body, "Draft body");
  for (const key of ["id", "title", "titleHtml", "logicalPageTitle", "__mednoteLazyPage", "pageId", "sectionId", "notebookId", "order"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(content, key), false, `SheetContent leaked ${key}`);
  }
});

test("P2 runtime Document maps to SaveDocumentWorkspaceInput without persisting compatibility notebooks", () => {
  const realNotebook = notebookFromStructure(structureFixture(), "n1", { sh1: { body: "A" } });
  assert.ok(realNotebook);
  const workspace: WorkspaceItem = {
    id: "collection-1",
    kind: "collection",
    name: "AMR collection",
    documents: [
      { id: "doc-a", name: "A.pdf", size: 10, lastModified: 1, reader: { page: 2, zoom: 1, fitMode: "page", rotation: 0, viewMode: "single", bookmarks: [], annotations: [] } },
      { id: "doc-b", name: "B.pdf", size: 20, lastModified: 2, reader: { page: 7, zoom: 1.2, fitMode: "width", rotation: 0, viewMode: "continuous", bookmarks: [7], annotations: [] } },
    ],
    activeDocumentId: "doc-b",
    noteNotebookId: "n1",
    notebooks: [realNotebook],
    activeNotebookId: "n1",
    sourcePage: 7,
  };
  const input = documentWorkspaceInput(workspace, { targetType: "page", targetId: "p1" }, { workspaceMode: "split", readerShare: 48, noteZoom: 1.1 });
  assert.deepEqual(input.context.documentIds, ["doc-a", "doc-b"]);
  assert.equal(input.context.activeDocumentId, "doc-b");
  assert.equal(input.links?.length, 2);
  assert.equal(input.group?.documentIds.length, 2);
  assert.equal(JSON.stringify(input).includes("notebooks"), false);
  assert.equal((input.documents[1].payload.reader as { page?: number }).page, 7);
});

test("P2 DocumentGraph restores current active document and resolves linked Notebook from NoteStructure", () => {
  const structure = structureFixture();
  const graph: DocumentGraph = {
    documents: [
      { id: "doc-a", name: "A renamed.pdf", size: 10, lastModified: 1, available: true, payload: { reader: { page: 3 } } },
      { id: "doc-b", name: "B.pdf", size: 20, lastModified: 2, available: true, payload: { reader: { page: 9 } } },
    ],
    contexts: [{ id: "collection-1", kind: "collection", name: "Collection", documentIds: ["doc-a", "doc-b"], activeDocumentId: "doc-b", sourcePage: 9 }],
    groups: [{ id: "collection-1", name: "Collection", documentIds: ["doc-a", "doc-b"], createdAt: 1, updatedAt: 1 }],
    links: [{ id: "link-a", documentId: "doc-a", targetType: "page", targetId: "p1" }],
    linkRelations: [],
  };
  const [workspace] = workspacesFromDocumentGraph(graph, structure);
  assert.equal(workspace.activeDocumentId, "doc-b");
  assert.equal(workspace.documents[0].name, "A renamed.pdf");
  assert.equal(workspace.documents[1].reader.page, 9);
  assert.equal(workspace.noteNotebookId, "n1");
  assert.equal(workspace.notebooks.length, 1);
  assert.equal(isReaderPlaceholder(workspace.notebooks[0]), true);
});

test("P2 Reader placeholder remains runtime-only and never becomes a real Notebook owner", () => {
  const placeholder = createReaderPlaceholder("workspace-x");
  assert.equal(isReaderPlaceholder(placeholder), true);
  const runtime = documentRuntimeWorkspace({
    id: "workspace-x",
    kind: "document",
    name: "X",
    documents: [],
    activeDocumentId: null,
    notebooks: [placeholder],
    activeNotebookId: placeholder.id,
    sourcePage: 1,
  });
  assert.equal(runtime.noteNotebookId, null);
  assert.equal(runtime.notebooks.length, 1);
  assert.equal(isReaderPlaceholder(runtime.notebooks[0]), true);
  assert.equal(runtime.activeNotebookId, placeholder.id);
  const input = documentWorkspaceInput(runtime, null, { workspaceMode: "reader", readerShare: 50, noteZoom: 1 });
  assert.equal(JSON.stringify(input).includes("notebooks"), false);
});
