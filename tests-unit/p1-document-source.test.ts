import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";
import { createDriveBackup, stageDriveBackup } from "../app/drive-backup";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { remapDocumentReferencesInContent, resolveDocumentSource, type DocumentSourceExcerpt } from "../app/note-document-source";
import { NoteStore } from "../app/note-store";
import type { LibraryV6 } from "../app/note-repository";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nguồn PDF", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Section", order: 0 }],
      pages: [{ id: "page", sectionId: "sec", title: "Page", order: 0 }],
      sheets: [
        { id: "sheet-a", pageId: "page", order: 0 },
        { id: "sheet-b", pageId: "page", order: 1 },
      ],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet-a" },
    },
    sheetContents: {
      "sheet-a": {
        body: "AMR",
        excerpts: [{
          id: "excerpt-a",
          kind: "text",
          sourceKind: "pdf",
          documentId: "doc-a",
          documentName: "A.pdf",
          page: 12,
          rect: { x1: 1, y1: 2, x2: 3, y2: 4 },
          text: "historical provenance",
        }],
      },
      "sheet-b": {
        body: "Other",
        excerpts: [{ id: "excerpt-b", kind: "text", sourceKind: "pdf", documentId: "doc-b", documentName: "Other.pdf", page: 2 }],
      },
    },
    documents: {
      documents: [
        { id: "doc-a", name: "A.pdf", size: 10, lastModified: 1, available: true, payload: {} },
        { id: "doc-b", name: "Other.pdf", size: 20, lastModified: 2, available: true, payload: {} },
      ],
      contexts: [{ id: "ctx", kind: "collection", name: "Collection", documentIds: ["doc-a", "doc-b"], activeDocumentId: "doc-a", sourcePage: 1 }],
      groups: [{ id: "ctx", name: "Collection", documentIds: ["doc-a", "doc-b"], createdAt: 1, updatedAt: 1 }],
      links: [
        { id: "link-a", documentId: "doc-a", targetType: "page", targetId: "page" },
        { id: "link-b", documentId: "doc-b", targetType: "page", targetId: "page" },
      ],
      linkRelations: [{ id: "rel", linkIds: ["link-a", "link-b"], kind: "workspace", sourceType: "group", sourceId: "ctx", createdAt: 1, updatedAt: 1 }],
    },
    preferences: { activeDocumentContextId: "ctx", readerShare: 50, workspaceMode: "split", noteZoom: 1 },
    savedAt: 1,
  };
}

function firstExcerpt(content: Record<string, unknown> | null) {
  assert.ok(content && Array.isArray(content.excerpts));
  return content.excerpts[0] as DocumentSourceExcerpt<Record<string, number>> & Record<string, unknown>;
}

test("P1 resolver uses current DocumentGraph name and historical fallback only when unavailable", () => {
  const base = library();
  const excerpt = firstExcerpt(base.sheetContents["sheet-a"]);
  const renamed = structuredClone(base.documents);
  renamed.documents[0].name = "B.pdf";
  assert.deepEqual(resolveDocumentSource(excerpt, renamed), {
    documentId: "doc-a",
    displayName: "B.pdf",
    page: 12,
    rect: { x1: 1, y1: 2, x2: 3, y2: 4 },
    available: true,
  });
  const missing = { ...renamed, documents: renamed.documents.filter((document) => document.id !== "doc-a") };
  const deleted = resolveDocumentSource(excerpt, missing);
  assert.equal(deleted?.available, false);
  assert.equal(deleted?.displayName, "A.pdf");
  assert.equal(deleted?.page, 12);
  assert.deepEqual(deleted?.rect, { x1: 1, y1: 2, x2: 3, y2: 4 });
  assert.equal(resolveDocumentSource({ sourceKind: "manual", documentName: "manual.png" }, renamed), null);
  assert.equal(resolveDocumentSource({ sourceKind: "pdf", documentId: "temp-doc-1", documentName: "old.pdf", page: 3 }, { documents: [] }, [{ id: "temp-doc-1", name: "temporary.pdf" }])?.displayName, "temporary.pdf");
});

test("P1 pure remap changes only document identity", () => {
  const content = library().sheetContents["sheet-a"];
  const before = structuredClone(firstExcerpt(content));
  const result = remapDocumentReferencesInContent(content, new Map([["doc-a", "doc-new"]]));
  assert.equal(result.changed, true);
  const excerpt = firstExcerpt(result.content);
  assert.equal(excerpt.documentId, "doc-new");
  assert.equal(excerpt.documentName, before.documentName);
  assert.equal(excerpt.page, before.page);
  assert.deepEqual(excerpt.rect, before.rect);
  assert.equal(excerpt.text, before.text);
});

test("rename updates one DocumentRecord, preserves links and does not rewrite stored excerpts", async () => {
  const dbName = `mednote-p1-rename-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    const seed = library();
    await repository.replaceLibrary(seed);
    const input = {
      documents: [{ ...seed.documents.documents[0], name: "B.pdf" }],
      context: { ...seed.documents.contexts[0], name: "Renamed" },
      group: { ...seed.documents.groups[0], name: "Renamed" },
      links: [],
      linkRelations: [],
    };
    const graph = await repository.saveDocumentWorkspace(input);
    assert.equal(graph.documents.find((document) => document.id === "doc-a")?.name, "B.pdf");
    assert.deepEqual(graph.links.map((link) => link.id).sort(), ["link-a", "link-b"]);
    const stored = await repository.loadSheetContent("sheet-a");
    assert.equal(firstExcerpt(stored).documentName, "A.pdf", "historical snapshot must not be rewritten on rename");
    assert.equal(resolveDocumentSource(firstExcerpt(stored), graph)?.displayName, "B.pdf");
    assert.equal((await repository.loadDocumentGraph())?.documents.find((document) => document.id === "doc-a")?.name, "B.pdf");
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("delete one PDF from a collection preserves excerpt provenance and keeps the other PDF usable", async () => {
  const dbName = `mednote-p1-delete-collection-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(library());
    const graph = await repository.deleteDocumentFromWorkspace("ctx", "doc-a");
    assert.deepEqual(graph.documents.map((document) => document.id), ["doc-b"]);
    assert.deepEqual(graph.contexts[0].documentIds, ["doc-b"]);
    assert.equal(graph.contexts[0].activeDocumentId, "doc-b");
    assert.deepEqual(graph.groups[0].documentIds, ["doc-b"]);
    assert.deepEqual(graph.links.map((link) => link.id), ["link-b"]);
    assert.deepEqual(graph.linkRelations[0].linkIds, ["link-b"]);
    const removedExcerpt = firstExcerpt(await repository.loadSheetContent("sheet-a"));
    assert.equal(removedExcerpt.sourceKind, "pdf");
    assert.equal(removedExcerpt.documentId, "doc-a");
    assert.equal(removedExcerpt.documentName, "A.pdf");
    assert.equal(resolveDocumentSource(removedExcerpt, graph)?.available, false);
    const keptExcerpt = firstExcerpt(await repository.loadSheetContent("sheet-b"));
    assert.equal(resolveDocumentSource(keptExcerpt, graph)?.available, true);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("delete a PDF workspace leaves SheetContent untouched and marks source unavailable", async () => {
  const dbName = `mednote-p1-delete-single-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    const seed = library();
    seed.documents.documents = [seed.documents.documents[0]];
    seed.documents.contexts = [{ ...seed.documents.contexts[0], documentIds: ["doc-a"], activeDocumentId: "doc-a" }];
    seed.documents.groups = [{ ...seed.documents.groups[0], documentIds: ["doc-a"] }];
    seed.documents.links = [seed.documents.links[0]];
    seed.documents.linkRelations = [{ ...seed.documents.linkRelations[0], linkIds: ["link-a"] }];
    seed.sheetContents["sheet-b"] = { body: "No PDF source" };
    await repository.replaceLibrary(seed);
    const graph = await repository.deleteDocumentWorkspace("ctx");
    assert.equal(graph.documents.length, 0);
    const excerpt = firstExcerpt(await repository.loadSheetContent("sheet-a"));
    assert.equal(excerpt.sourceKind, "pdf");
    assert.equal(excerpt.documentId, "doc-a");
    assert.equal(excerpt.page, 12);
    assert.deepEqual(excerpt.rect, { x1: 1, y1: 2, x2: 3, y2: 4 });
    assert.equal(resolveDocumentSource(excerpt, graph)?.available, false);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("temporary document IDs remap through NoteStore, survive reload and Drive round-trip", async () => {
  const dbName = `mednote-p1-remap-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    const seed = library();
    const excerpt = firstExcerpt(seed.sheetContents["sheet-a"]);
    excerpt.documentId = "temp-doc-x";
    excerpt.documentName = "Temporary historical.pdf";
    await repository.replaceLibrary(seed);
    const writes: string[] = [];
    const saveSheetContent = repository.saveSheetContent.bind(repository);
    repository.saveSheetContent = async (sheetId, content) => {
      writes.push(sheetId);
      return saveSheetContent(sheetId, content);
    };
    const store = new NoteStore(repository);
    await store.initialize({ skipMigration: true });
    const changed = await store.remapDocumentReferences(new Map([["temp-doc-x", "doc-a"]]));
    assert.equal(changed, 1);
    assert.deepEqual(writes, ["sheet-a"]);
    assert.equal(firstExcerpt(store.getSnapshot().activeSheetContent).documentId, "doc-a");
    const persisted = await repository.loadSheetContent("sheet-a");
    const persistedExcerpt = firstExcerpt(persisted);
    assert.equal(persistedExcerpt.documentId, "doc-a");
    assert.equal(persistedExcerpt.documentName, "Temporary historical.pdf");
    assert.equal(persistedExcerpt.page, 12);
    assert.deepEqual(persistedExcerpt.rect, { x1: 1, y1: 2, x2: 3, y2: 4 });

    const reload = new NoteStore(repository);
    await reload.initialize({ skipMigration: true });
    assert.equal(firstExcerpt(reload.getSnapshot().activeSheetContent).documentId, "doc-a");

    const exported = await repository.loadLibrary();
    assert.ok(exported);
    const backup = createDriveBackup(exported);
    const restored = await stageDriveBackup(backup, `mednote-p1-drive-${crypto.randomUUID()}`);
    assert.equal(firstExcerpt(restored.sheetContents["sheet-a"]).documentId, "doc-a");
    assert.equal(resolveDocumentSource(firstExcerpt(restored.sheetContents["sheet-a"]), restored.documents)?.available, true);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("page runtime consumes resolver while controller owns document-ID remapping", async () => {
  const [page, controller] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/document-library-controller.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /resolveDocumentSource/);
  assert.match(page, /source=\{resolveExcerptSource\(excerpt\)\}/);
  assert.doesNotMatch(page, /documentName:\s*renamedDocument\.name/);
  assert.doesNotMatch(page, /sourceKind:\s*"manual",\s*documentId:\s*undefined/);
  assert.doesNotMatch(page, /Đã quay lại \$\{excerpt\.documentName\}/);
  assert.doesNotMatch(page, /remapDocumentReferences\(idMap\)/);
  assert.match(controller, /remapDocumentReferences\(idMap\)/);
});
