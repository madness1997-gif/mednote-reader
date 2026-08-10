import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { DocumentLibraryController } from "../app/document-library-controller";
import { createEmptyWorkspace, workspacesFromDocumentGraph, type PersistedLibrary, type WorkspaceItem } from "../app/document-runtime-adapter";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import type { LibraryV6 } from "../app/note-repository";

function emptyLibrary(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Đái tháo đường", order: 0 }],
      pages: [{ id: "page", sectionId: "sec", title: "Điều trị", order: 0 }],
      sheets: [{ id: "sheet", pageId: "page", order: 0 }],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet" },
    },
    sheetContents: { sheet: { body: "Metformin", excerpts: [] } },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "split", noteZoom: 1 },
    savedAt: 1,
  };
}

function pdf(name: string, body = name, lastModified = 1) {
  return new File([body], name, { type: "application/pdf", lastModified });
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function harness() {
  const dbName = `mednote-p5-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(emptyLibrary());
  const notes = new NoteStore(repository);
  await notes.initialize({ skipMigration: true });
  const binaries = new Map<string, { blob: Blob; name: string }>();
  const runtime: PersistedLibrary[] = [];
  let clock = 100;
  const controller = new DocumentLibraryController({
    notes,
    pdfStorage: {
      savePdf: async (id, name, blob) => { binaries.set(id, { blob, name }); },
      readPdf: async (id) => binaries.get(id),
      deletePdf: async (id) => { binaries.delete(id); },
    },
    saveRuntime: (snapshot) => { runtime.push(structuredClone(snapshot)); },
    now: () => ++clock,
    random: () => 0.25,
  });
  const close = () => deleteNoteRepositoryDatabase(dbName);
  return { repository, notes, binaries, runtime, controller, close };
}

function baseInput(files: File[], workspaces: WorkspaceItem[] = [createEmptyWorkspace()]) {
  return {
    files,
    saveToLibrary: true,
    workspaces,
    activeWorkspaceId: workspaces[0].id,
    destination: { mode: "none" } as const,
    readerShare: 46,
    workspaceMode: "split" as const,
    noteZoom: 1.15,
  };
}

test("P5 controller is unavailable until bootstrap activates it", async () => {
  const context = await harness();
  try {
    await assert.rejects(context.controller.importPdfFiles(baseInput([pdf("ADA.pdf")])), /chưa khởi động/);
    context.controller.activate();
    assert.equal(context.controller.isReady(), true);
  } finally { await context.close(); }
});

test("imports one persistent PDF without creating a note and persists reload state", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const beforeNotes = structuredClone(context.notes.getSnapshot().structure);
    const result = await context.controller.importPdfFiles(baseInput([pdf("ADA.pdf", "ada")]));
    const workspace = result.workspaces[0];
    assert.equal(workspace.kind, "document");
    assert.equal(workspace.noteNotebookId, null);
    assert.equal(await context.binaries.get(workspace.documents[0].id)?.blob.text(), "ada");
    assert.equal((await context.repository.loadDocumentGraph())?.contexts[0].id, workspace.id);
    assert.deepEqual(context.notes.getSnapshot().structure, beforeNotes, "PDF-only must not create note hierarchy");
    const snapshot = context.runtime.at(-1)!;
    assert.equal(snapshot.activeWorkspaceId, workspace.id);
    assert.equal(snapshot.readerShare, 46);
    assert.equal(snapshot.workspaceMode, "reader");
    assert.equal(snapshot.noteZoom, 1.15);
    const structure = await context.repository.loadNoteStructure();
    const graph = await context.repository.loadDocumentGraph();
    assert.ok(structure && graph);
    assert.equal(workspacesFromDocumentGraph(graph, structure)[0].documents[0].name, "ADA.pdf");
  } finally { await context.close(); }
});

test("imports a persistent collection and deletes one PDF without losing the collection", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const imported = await context.controller.importPdfFiles(baseInput([pdf("A.pdf"), pdf("B.pdf", "b", 2)]));
    assert.equal(imported.workspaces[0].kind, "collection");
    assert.equal(imported.workspaces[0].documents.length, 2);
    const removedId = imported.workspaces[0].documents[0].id;
    const keptId = imported.workspaces[0].documents[1].id;
    const result = await context.controller.deleteDocument({
      workspaceId: imported.workspaces[0].id,
      documentId: removedId,
      workspaces: imported.workspaces,
      activeWorkspaceId: imported.activeWorkspaceId,
      readerShare: 46,
      workspaceMode: imported.workspaceMode,
      noteZoom: 1.15,
    });
    assert.deepEqual(result.workspaces[0].documents.map((document) => document.id), [keptId]);
    assert.equal(context.binaries.has(removedId), false);
    assert.equal(context.binaries.has(keptId), true);
    assert.deepEqual((await context.repository.loadDocumentGraph())?.contexts[0].documentIds, [keptId]);
    assert.deepEqual(result.removedDocumentIds, [removedId]);
  } finally { await context.close(); }
});

test("temporary PDF stays outside DocumentGraph, then Save Library remaps excerpt IDs", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const temporary = await context.controller.importPdfFiles({ ...baseInput([pdf("Temp.pdf", "temp")]), saveToLibrary: false });
    const tempWorkspace = temporary.workspaces[0];
    const tempId = tempWorkspace.documents[0].id;
    assert.equal(tempWorkspace.kind, "temporary");
    assert.equal((await context.repository.loadDocumentGraph())?.documents.length, 0);
    assert.equal(context.runtime.at(-1)?.workspaces.some((workspace) => workspace.kind === "temporary"), false);
    assert.equal(await (await context.controller.readPdf(tempId))?.blob.text(), "temp");

    context.notes.updateActiveSheetContent({
      body: "historical",
      excerpts: [{ id: "excerpt", kind: "text", sourceKind: "pdf", documentId: tempId, documentName: "Temp.pdf", page: 7 }],
    });
    await context.notes.flush();
    const saved = await context.controller.saveTemporaryWorkspace({
      workspaceId: tempWorkspace.id,
      workspaces: temporary.workspaces,
      activeWorkspaceId: temporary.activeWorkspaceId,
      hasActiveNote: true,
      readerShare: 46,
      workspaceMode: temporary.workspaceMode,
      noteZoom: 1.15,
    });
    const persistedId = saved.workspaces[0].documents[0].id;
    assert.match(persistedId, /^doc-/);
    assert.notEqual(persistedId, tempId);
    assert.equal((await context.repository.loadDocumentGraph())?.documents[0].id, persistedId);
    const excerpt = (await context.repository.loadSheetContent("sheet"))?.excerpts?.[0] as { documentId?: string; documentName?: string; page?: number };
    assert.equal(excerpt.documentId, persistedId);
    assert.equal(excerpt.documentName, "Temp.pdf");
    assert.equal(excerpt.page, 7);
    assert.equal(await (await context.controller.readPdf(persistedId))?.blob.text(), "temp");
    assert.equal(context.runtime.at(-1)?.activeWorkspaceId, saved.activeWorkspaceId);
  } finally { await context.close(); }
});

test("rename updates DocumentRecord and binary metadata without rewriting SheetContent", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const imported = await context.controller.importPdfFiles(baseInput([pdf("Old.pdf")]));
    const documentId = imported.workspaces[0].documents[0].id;
    context.notes.updateActiveSheetContent({
      excerpts: [{ id: "excerpt", kind: "text", sourceKind: "pdf", documentId, documentName: "Old.pdf", page: 3 }],
    });
    await context.notes.flush();
    const before = await context.repository.loadSheetContent("sheet");
    const renamed = await context.controller.renameWorkspace({
      workspaceId: imported.workspaces[0].id,
      name: "New",
      workspaces: imported.workspaces,
      activeWorkspaceId: imported.activeWorkspaceId,
      readerShare: 46,
      workspaceMode: imported.workspaceMode,
      noteZoom: 1.15,
    });
    assert.equal(renamed.workspaces[0].documents[0].name, "New.pdf");
    assert.equal((await context.repository.loadDocumentGraph())?.documents[0].name, "New.pdf");
    assert.equal(context.binaries.get(documentId)?.name, "New.pdf");
    assert.deepEqual(await context.repository.loadSheetContent("sheet"), before);
  } finally { await context.close(); }
});

test("delete workspace keeps the note and historical PDF provenance", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const imported = await context.controller.importPdfFiles({
      ...baseInput([pdf("Linked.pdf")]),
      destination: { mode: "existing", notebookId: "nb", target: { targetType: "page", targetId: "page" } },
    });
    const documentId = imported.workspaces[0].documents[0].id;
    context.notes.updateActiveSheetContent({
      body: "keep me",
      excerpts: [{ id: "excerpt", kind: "text", sourceKind: "pdf", documentId, documentName: "Linked.pdf", page: 9 }],
    });
    await context.notes.flush();
    const result = await context.controller.deleteWorkspace({
      workspaceId: imported.workspaces[0].id,
      workspaces: imported.workspaces,
      activeWorkspaceId: imported.activeWorkspaceId,
      readerShare: 46,
      workspaceMode: imported.workspaceMode,
      noteZoom: 1.15,
    });
    assert.equal(result.workspaces[0].kind, "empty");
    assert.equal(result.workspaces[0].noteNotebookId, "nb");
    assert.equal((await context.repository.loadDocumentGraph())?.documents.length, 0);
    const content = await context.repository.loadSheetContent("sheet");
    const excerpt = content?.excerpts?.[0] as { sourceKind?: string; documentId?: string; page?: number };
    assert.equal(content?.body, "keep me");
    assert.equal(excerpt.sourceKind, "pdf");
    assert.equal(excerpt.documentId, documentId);
    assert.equal(excerpt.page, 9);
  } finally { await context.close(); }
});

test("links imports to an existing Page or Sheet", async () => {
  for (const target of [{ targetType: "page", targetId: "page" }, { targetType: "sheet", targetId: "sheet" }] as const) {
    const context = await harness();
    try {
      context.controller.activate();
      const imported = await context.controller.importPdfFiles({
        ...baseInput([pdf(`${target.targetType}.pdf`)]),
        destination: { mode: "existing", notebookId: "nb", target },
      });
      const graph = await context.repository.loadDocumentGraph();
      assert.equal(graph?.links[0].targetType, target.targetType);
      assert.equal(graph?.links[0].targetId, target.targetId);
      assert.equal(imported.workspaces[0].noteNotebookId, "nb");
      assert.equal(imported.workspaceMode, "split");
    } finally { await context.close(); }
  }
});

test("import can create Notebook, Section or Page destinations", async () => {
  const destinations = [
    { mode: "notebook", title: "Sổ mới" } as const,
    { mode: "section", notebookId: "nb", title: "Phần mới" } as const,
    { mode: "page", notebookId: "nb", sectionId: "sec", title: "Trang mới" } as const,
  ];
  for (const [index, destination] of destinations.entries()) {
    const context = await harness();
    try {
      context.controller.activate();
      const result = await context.controller.importPdfFiles({
        ...baseInput([pdf(`created-${index}.pdf`)]),
        destination,
      });
      const structure = await context.repository.loadNoteStructure();
      assert.equal(result.workspaces[0].noteNotebookId !== null, true);
      if (destination.mode === "notebook") assert.ok(structure?.notebooks.some((item) => item.title === destination.title));
      if (destination.mode === "section") assert.ok(structure?.sections.some((item) => item.title === destination.title));
      if (destination.mode === "page") assert.ok(structure?.pages.some((item) => item.title === destination.title));
      assert.equal((await context.repository.loadDocumentGraph())?.links.length, 1);
    } finally { await context.close(); }
  }
});

test("note-only workspace survives document mutations and remains usable", async () => {
  const context = await harness();
  try {
    context.controller.activate();
    const noteOnly = createEmptyWorkspace();
    noteOnly.noteNotebookId = "nb";
    const imported = await context.controller.importPdfFiles(baseInput([pdf("Other.pdf")], [noteOnly]));
    const deleted = await context.controller.deleteWorkspace({
      workspaceId: imported.workspaces[0].id,
      workspaces: imported.workspaces,
      activeWorkspaceId: imported.activeWorkspaceId,
      readerShare: 46,
      workspaceMode: imported.workspaceMode,
      noteZoom: 1.15,
    });
    assert.ok(deleted.workspaces.some((workspace) => workspace.id === noteOnly.id && workspace.noteNotebookId === "nb"));
    const created = await context.notes.createPage("sec", "Note-only vẫn hoạt động", {});
    assert.ok(created.active.activePageId);
  } finally { await context.close(); }
});

test("page.tsx delegates document lifecycle mutations and contains no readiness polling", async () => {
  const [page, controller] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/document-library-controller.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /documentLibrary\.importPdfFiles/);
  assert.match(page, /documentLibrary\.saveTemporaryWorkspace/);
  assert.match(page, /documentLibrary\.renameWorkspace/);
  assert.match(page, /documentLibrary\.deleteDocument/);
  assert.match(page, /documentLibrary\.deleteWorkspace/);
  assert.match(page, /documentLibrary\.linkWorkspaceToNote/);
  assert.doesNotMatch(page, /while\s*\(!readyRef\.current\)/);
  assert.doesNotMatch(page, /temporaryPdfBlobsRef/);
  assert.doesNotMatch(page, /noteStore\.remapDocumentReferences/);
  assert.doesNotMatch(page, /noteStore\.deleteDocumentFromWorkspace/);
  assert.doesNotMatch(page, /noteStore\.deleteDocumentWorkspace/);
  assert.match(controller, /this\.notes\.remapDocumentReferences/);
  assert.match(controller, /this\.pdfStorage\.deletePdf/);
  assert.match(controller, /this\.writeRuntime/);
});
