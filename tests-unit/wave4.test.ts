import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import type { LibraryV6 } from "../app/note-repository";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Đái tháo đường", order: 0 }],
      pages: [
        { id: "page-a", sectionId: "sec", title: "Điều trị", order: 0 },
        { id: "page-b", sectionId: "sec", title: "Theo dõi", order: 1 },
      ],
      sheets: [
        { id: "sheet-a1", pageId: "page-a", order: 0 },
        { id: "sheet-a2", pageId: "page-a", order: 1 },
        { id: "sheet-b1", pageId: "page-b", order: 0 },
      ],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page-a", activeSheetId: "sheet-a1" },
    },
    sheetContents: {
      "sheet-a1": { body: "Metformin" },
      "sheet-a2": { body: "SGLT2i" },
      "sheet-b1": { body: "HbA1c" },
    },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "note", noteZoom: 1 },
    savedAt: 1,
  };
}

function largeContinuousLibrary(activePageSheets = 128, siblingPageSheets = 16): LibraryV6 {
  const source = library();
  const activeSheets = Array.from({ length: activePageSheets }, (_, order) => ({
    id: `sheet-a-${order + 1}`,
    pageId: "page-a",
    order,
  }));
  const siblingSheets = Array.from({ length: siblingPageSheets }, (_, order) => ({
    id: `sheet-b-${order + 1}`,
    pageId: "page-b",
    order,
  }));
  source.notes.sheets = [...activeSheets, ...siblingSheets];
  source.notes.active = {
    activeNotebookId: "nb",
    activeSectionId: "sec",
    activePageId: "page-a",
    activeSheetId: activeSheets[0].id,
  };
  source.sheetContents = Object.fromEntries([...activeSheets, ...siblingSheets].map((sheet) => [
    sheet.id,
    { body: `${sheet.id}: ${"clinical-note ".repeat(80)}` },
  ]));
  return source;
}

test("continuous mode hydrates only Sheets in the active Page and keeps one draft owner", async () => {
  const dbName = `mednote-wave4-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const reads: string[] = [];
  const loadSheetContent = repository.loadSheetContent.bind(repository);
  repository.loadSheetContent = async (sheetId: string) => {
    reads.push(sheetId);
    return loadSheetContent(sheetId);
  };
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    reads.length = 0;
    await store.loadPageSheetContents("page-a");
    assert.deepEqual(reads.sort(), ["sheet-a1", "sheet-a2"]);
    assert.deepEqual(Object.keys(store.getSnapshot().pageSheetContents).sort(), ["sheet-a1", "sheet-a2"]);
    assert.equal(reads.includes("sheet-b1"), false, "continuous Page A must not hydrate sibling Page B");

    store.releaseInactiveSheetContents();
    assert.deepEqual(Object.keys(store.getSnapshot().pageSheetContents), ["sheet-a1"], "single view must release inactive Sheet previews");
    await store.loadPageSheetContents("page-a");

    store.patchActiveSheetContent({ body: "Metformin + GLP-1 RA" });
    await store.openSheet("sheet-a2");
    assert.equal((await loadSheetContent("sheet-a1"))?.body, "Metformin + GLP-1 RA");
    assert.deepEqual(Object.keys(store.getSnapshot().pageSheetContents).sort(), ["sheet-a1", "sheet-a2"]);

    await store.openSheet("sheet-b1");
    assert.deepEqual(Object.keys(store.getSnapshot().pageSheetContents), ["sheet-b1"], "cross-Page navigation must release the old Page cache");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("stress: continuous mode preserves drafts and Page boundaries with 128 Sheets", { timeout: 15_000 }, async () => {
  const dbName = `mednote-wave4-128-sheets-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(largeContinuousLibrary());
  const reads: string[] = [];
  const loadSheetContent = repository.loadSheetContent.bind(repository);
  repository.loadSheetContent = async (sheetId: string) => {
    reads.push(sheetId);
    return loadSheetContent(sheetId);
  };
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    reads.length = 0;
    const startedAt = performance.now();
    await store.loadPageSheetContents("page-a");
    const elapsedMs = performance.now() - startedAt;
    const snapshot = store.getSnapshot();

    assert.equal(reads.length, 128);
    assert.equal(new Set(reads).size, 128);
    assert.equal(reads.some((id) => id.startsWith("sheet-b-")), false);
    assert.equal(Object.keys(snapshot.pageSheetContents).length, 128);
    assert.ok(elapsedMs < 5_000, `128-Sheet hydration exceeded budget: ${elapsedMs.toFixed(1)} ms`);

    store.patchActiveSheetContent({ body: "draft under 128-Sheet load" });
    await store.openSheet("sheet-a-128");
    assert.equal((await loadSheetContent("sheet-a-1"))?.body, "draft under 128-Sheet load");
    assert.equal(store.getSnapshot().structure?.active.activeSheetId, "sheet-a-128");
    assert.equal(Object.keys(store.getSnapshot().pageSheetContents).length, 128);

    store.releaseInactiveSheetContents();
    assert.deepEqual(Object.keys(store.getSnapshot().pageSheetContents), ["sheet-a-128"]);
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("PDF content reads do not navigate or populate the live continuous cache", async () => {
  const dbName = `mednote-export-boundary-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    store.patchActiveSheetContent({ body: "Draft chưa rời editor" });
    const before = store.getSnapshot();
    const contents = await store.loadSheetContents(["sheet-a1", "sheet-a2", "sheet-b1"]);
    const after = store.getSnapshot();

    assert.equal(after.structure?.active.activeSheetId, before.structure?.active.activeSheetId);
    assert.equal(after.activeSheetContent?.body, "Draft chưa rời editor");
    assert.deepEqual(Object.keys(after.pageSheetContents), Object.keys(before.pageSheetContents));
    assert.equal(contents["sheet-a1"].body, "Draft chưa rời editor");
    assert.equal(contents["sheet-a2"].body, "SGLT2i");
    assert.equal(contents["sheet-b1"].body, "HbA1c");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("P0 Page rename preserves Sheet drafts and keeps title out of SheetContent", async () => {
  const dbName = `mednote-p0-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    store.patchActiveSheetContent({ body: "Draft trước khi đổi tên" });
    await store.renamePage("page-a", "Điều trị cập nhật");

    const snapshot = store.getSnapshot();
    assert.equal(snapshot.structure?.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");
    assert.equal(snapshot.activeSheetContent?.body, "Draft trước khi đổi tên");
    assert.equal((await repository.loadSheetContent("sheet-a1"))?.body, "Draft trước khi đổi tên");

    await store.openSheet("sheet-a2");
    assert.equal(store.getSnapshot().structure?.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");

    const stored = await repository.loadLibrary();
    assert.equal(stored?.notes.pages.find((page) => page.id === "page-a")?.title, "Điều trị cập nhật");
    for (const content of Object.values(stored?.sheetContents || {})) {
      assert.equal("title" in content, false);
      assert.equal("titleHtml" in content, false);
      assert.equal("logicalPageTitle" in content, false);
    }
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("First Aid Page title stays empty after deleting the legacy Page mới title", async () => {
  const dbName = `mednote-page-title-empty-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  const firstAidLibrary = library();
  firstAidLibrary.notes.pages[0].title = "Page mới";
  firstAidLibrary.sheetContents["sheet-a1"] = {
    ...firstAidLibrary.sheetContents["sheet-a1"],
    paper: { size: "a4", orientation: "portrait", template: "first-aid", color: "white" },
    firstAid: { version: 1, blocks: [] },
  };
  await repository.replaceLibrary(firstAidLibrary);
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    await store.renamePage("page-a", "");

    assert.equal(store.getSnapshot().structure?.pages.find((page) => page.id === "page-a")?.title, "");
    assert.equal((await repository.loadNoteStructure())?.pages.find((page) => page.id === "page-a")?.title, "");
    assert.equal((await repository.loadLibrary())?.notes.pages.find((page) => page.id === "page-a")?.title, "");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});
