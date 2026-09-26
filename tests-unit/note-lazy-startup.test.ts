import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository, V6_KEYS } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import { createV6LibraryFixture } from "./v6-library-fixture";

test("normal startup reads no content; selecting a Sheet loads and saves only that Sheet", async () => {
  const dbName = `note-lazy-startup-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  const source = createV6LibraryFixture();
  await repository.replaceLibrary(source);
  const reads: string[] = [];
  const originalGet = IDBObjectStore.prototype.get;
  const originalGetAll = IDBObjectStore.prototype.getAll;
  const originalOpenCursor = IDBObjectStore.prototype.openCursor;
  IDBObjectStore.prototype.get = function (key) {
    reads.push(String(key));
    return originalGet.call(this, key);
  };
  // No unbounded value reads may bypass the per-key trace.
  IDBObjectStore.prototype.getAll = () => { throw new Error("Unexpected eager getAll"); };
  IDBObjectStore.prototype.openCursor = () => { throw new Error("Unexpected eager value cursor"); };
  const store = new NoteStore(repository);
  const contentReads = () => reads.filter((key) => key.startsWith(V6_KEYS.sheetContent));
  try {
    // Exercise the production path, not the old skipMigration test shortcut.
    await store.initialize({ deferActiveSheet: true });
    assert.deepEqual(contentReads(), []);
    assert.equal(store.getSnapshot().activeSheetContent, null);
    assert.deepEqual(store.getSnapshot().pageSheetContents, {});
    assert.equal(store.getSnapshot().structure?.sheets.length, source.notes.sheets.length);

    store.patchActiveSheetContent({ body: "must not overwrite an unopened Sheet" });
    await store.flush();
    assert.equal(store.getSnapshot().dirty, false);

    await store.openSheet("sheet-thyroid-1");
    assert.deepEqual(contentReads(), [`${V6_KEYS.sheetContent}sheet-thyroid-1`]);
    assert.equal(store.getSnapshot().activeSheetContent?.body, "Thyrozol");
    // An old visibility effect must neither navigate back nor hydrate its target.
    await store.ensureActiveSheetContent("sheet-dm-2");
    await store.ensureActiveSheetContent("sheet-thyroid-1");
    assert.equal(contentReads().length, 1);

    store.patchActiveSheetContent({ body: "Updated thyroid note" });
    await store.openSheet("sheet-dm-1");
    assert.deepEqual(contentReads(), [`${V6_KEYS.sheetContent}sheet-thyroid-1`, `${V6_KEYS.sheetContent}sheet-dm-1`]);
    assert.equal((await repository.loadSheetContent("sheet-thyroid-1"))?.body, "Updated thyroid note");
    assert.deepEqual(await repository.loadSheetContent("sheet-dm-2"), source.sheetContents["sheet-dm-2"]);
  } finally {
    IDBObjectStore.prototype.get = originalGet;
    IDBObjectStore.prototype.getAll = originalGetAll;
    IDBObjectStore.prototype.openCursor = originalOpenCursor;
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("startup repairs duplicate notebook names without reading or rewriting Sheet content", async () => {
  const dbName = `note-lazy-titles-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  const source = createV6LibraryFixture();
  source.notes.notebooks.push({ id: "nb-second", title: "Nội tiết", order: 1 });
  source.notes.sections.find((section) => section.id === "sec-thyroid")!.notebookId = "nb-second";
  source.notes.sections.find((section) => section.id === "sec-thyroid")!.order = 0;
  await repository.replaceLibrary(source);
  const store = new NoteStore(repository);
  const originalLoad = repository.loadSheetContent.bind(repository);
  repository.loadSheetContent = async () => { throw new Error("Unexpected Sheet read during title repair"); };
  try {
    await store.initialize({ deferActiveSheet: true });
    assert.deepEqual(store.getSnapshot().structure?.notebooks.map((notebook) => notebook.title), ["Nội tiết", "Nội tiết (2)"]);
    repository.loadSheetContent = originalLoad;
    const saved = await repository.loadLibrary();
    assert.deepEqual(saved?.sheetContents, source.sheetContents);
    assert.deepEqual(saved?.notes.notebooks.map((notebook) => notebook.title), ["Nội tiết", "Nội tiết (2)"]);
  } finally {
    repository.loadSheetContent = originalLoad;
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});
