import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import { NoteNavigation } from "../app/note-navigation";
import type { LibraryV6 } from "../app/note-repository";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb-1", title: "Nội tiết", order: 0 }],
      sections: [
        { id: "sec-1", notebookId: "nb-1", title: "Đái tháo đường", order: 0 },
        { id: "sec-2", notebookId: "nb-1", title: "Tuyến giáp", order: 1 },
      ],
      pages: [
        { id: "page-1", sectionId: "sec-1", title: "Điều trị", order: 0 },
        { id: "page-2", sectionId: "sec-1", title: "Theo dõi", order: 1 },
      ],
      sheets: [
        { id: "sheet-1", pageId: "page-1", order: 0 },
        { id: "sheet-2", pageId: "page-1", order: 1 },
        { id: "sheet-3", pageId: "page-2", order: 0 },
      ],
      active: { activeNotebookId: "nb-1", activeSectionId: "sec-1", activePageId: "page-1", activeSheetId: "sheet-1" },
    },
    sheetContents: {
      "sheet-1": { body: "Metformin" },
      "sheet-2": { body: "SGLT2i" },
      "sheet-3": { body: "HbA1c" },
    },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "note", noteZoom: 1 },
    savedAt: 1,
  };
}

async function harness(name: string) {
  const dbName = `mednote-wave2-${name}-${Date.now()}-${Math.random()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const store = new NoteStore(repository);
  await store.initialize({ skipMigration: true });
  return { dbName, repository, store, navigation: new NoteNavigation(store) };
}

test("NoteStore flushes the old draft before hydrating a different Sheet", async () => {
  const { dbName, repository, store, navigation } = await harness("navigation");
  try {
    assert.equal(store.getSnapshot().activeSheetContent?.body, "Metformin");
    store.updateActiveSheetContent({ body: "Metformin + GLP-1 RA" });
    await navigation.openSheet("sheet-2");
    assert.equal((await repository.loadSheetContent("sheet-1"))?.body, "Metformin + GLP-1 RA");
    assert.equal(store.getSnapshot().structure?.active.activeSheetId, "sheet-2");
    assert.equal(store.getSnapshot().activeSheetContent?.body, "SGLT2i");
    assert.equal(store.getSnapshot().dirty, false);
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("commands update v6 structure in-place without reload state", async () => {
  const { dbName, repository, store } = await harness("commands");
  try {
    await store.renamePage("page-1", "Điều trị ĐTĐ");
    await store.movePage("page-2", "sec-2", 0);
    await store.createPage("sec-2", "Cường giáp", { body: "Thiamazole" });
    const createdPageId = store.getSnapshot().structure?.active.activePageId;
    const createdSheetId = store.getSnapshot().structure?.active.activeSheetId;
    assert.ok(createdPageId);
    assert.ok(createdSheetId);
    assert.equal(store.getSnapshot().activeSheetContent?.body, "Thiamazole");
    const structure = await repository.loadNoteStructure();
    assert.equal(structure?.pages.find((page) => page.id === "page-1")?.title, "Điều trị ĐTĐ");
    assert.equal(structure?.pages.find((page) => page.id === "page-2")?.sectionId, "sec-2");
    assert.equal(structure?.pages.find((page) => page.id === createdPageId)?.sectionId, "sec-2");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("production entrypoint no longer loads imperative note navigation runtimes", async () => {
  const [entry, page, exporter, githubConfig, desktopConfig] = await Promise.all([
    readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/note-pdf-export.tsx", import.meta.url), "utf8"),
    readFile(new URL("../vite.github.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.desktop.config.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(entry, /independent-library-runtime|page-sheet-runtime|relation-navigation-collapse/);
  assert.doesNotMatch(page, /__MEDNOTE_LIVE_STATE__|mednote-live-state-changed|window\.location\.reload|sessionStorage/);
  assert.doesNotMatch(exporter, /page-sheet-state|mednote-live-state-changed|mednote:activate-note-page/);
  assert.doesNotMatch(githubConfig, /incrementalLibraryPersistencePlugin|sidebarCollapseFixPlugin/);
  assert.doesNotMatch(desktopConfig, /incrementalLibraryPersistencePlugin|sidebarCollapseFixPlugin/);
});
