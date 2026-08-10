import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

test("Wave 4 toolbar delegates hierarchy CRUD to the React sidebar", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const start = page.indexOf('<div className={`note-toolbar');
  const end = page.indexOf('{notePanel === "text" && textInsertPopover === "bullets"', start);
  assert.ok(start >= 0 && end > start, "note toolbar source boundary must exist");
  const toolbar = page.slice(start, end);
  assert.doesNotMatch(toolbar, /Sổ mới|Xóa sổ|aria-label="Thêm trang"|aria-label="Xóa trang note"/);
  assert.match(toolbar, /Từng trang/);
  assert.match(toolbar, /Liên tục/);
  assert.match(toolbar, /Xuất note/);
});

test("obsolete imperative hierarchy runtimes are removed", async () => {
  const appFiles = await readdir(new URL("../app", import.meta.url));
  const obsolete = appFiles.filter((name) =>
    name.startsWith("page-sheet-")
    || name.startsWith("independent-library-")
    || name.startsWith("relation-library-")
    || name === "relation-navigation-collapse.ts"
    || name === "relation-note-right-layout.ts"
    || name === "native-library-three-groups.ts");
  assert.deepEqual(obsolete, []);
  const entry = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /page-sheet-|independent-library-|relation-library-|relation-navigation-collapse/);
});
