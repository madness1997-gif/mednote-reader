import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { NoteSidebarController, type NoteSidebarPrompts } from "../app/note-sidebar-controller";
import { projectNoteSidebar } from "../app/note-sidebar-model";
import type { LibraryV6 } from "../app/note-repository";
import { NoteStore } from "../app/note-store";
import { DEFAULT_NEW_NOTE_PAPER } from "../app/note-runtime-adapter";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [
        { id: "sec-a", notebookId: "nb", title: "Đái tháo đường", order: 0 },
        { id: "sec-b", notebookId: "nb", title: "Tuyến giáp", order: 1 },
      ],
      pages: [
        { id: "page-a", sectionId: "sec-a", title: "Điều trị", order: 0 },
        { id: "page-b", sectionId: "sec-b", title: "Cường giáp", order: 0 },
      ],
      sheets: [
        { id: "sheet-a1", pageId: "page-a", order: 0 },
        { id: "sheet-a2", pageId: "page-a", order: 1 },
        { id: "sheet-b1", pageId: "page-b", order: 0 },
      ],
      active: { activeNotebookId: "nb", activeSectionId: "sec-a", activePageId: "page-a", activeSheetId: "sheet-a1" },
    },
    sheetContents: {
      "sheet-a1": { body: "Metformin" },
      "sheet-a2": { body: "SGLT2i" },
      "sheet-b1": { body: "Thiamazole" },
    },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "note", noteZoom: 1 },
    savedAt: 1,
  };
}

async function harness(textAnswers: string[] = []) {
  const dbName = `mednote-sidebar-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(library());
  const store = new NoteStore(repository);
  await store.initialize({ skipMigration: true });
  const prompts: NoteSidebarPrompts = {
    requestText: async () => textAnswers.shift() ?? null,
    requestSelect: async () => null,
    confirm: () => true,
    alert: () => undefined,
  };
  return { dbName, repository, store, controller: new NoteSidebarController(store, prompts) };
}

test("sidebar projection exposes ordered metadata without SheetContent", () => {
  const model = projectNoteSidebar(library().notes);
  assert.deepEqual(model.notebooks, [{ id: "nb", title: "Nội tiết" }]);
  assert.deepEqual(model.sections.map((section) => [section.title, section.pages.length]), [
    ["Đái tháo đường", 1],
    ["Tuyến giáp", 1],
  ]);
  assert.deepEqual(model.pages[0].sheets.map((sheet) => sheet.label), ["Tờ 1", "Tờ 2"]);
  assert.equal(JSON.stringify(model).includes("Metformin"), false);
  assert.equal("content" in model.pages[0].sheets[0], false);
});

test("sidebar controller owns compound Section and last-Sheet workflows", async () => {
  const { dbName, store, controller } = await harness(["Biến chứng"]);
  try {
    let model = projectNoteSidebar(store.getSnapshot().structure!);
    await controller.createSection(model.notebooks[0]);

    const structureAfterCreate = store.getSnapshot().structure!;
    const createdSection = structureAfterCreate.sections.find((section) => section.title === "Biến chứng");
    assert.ok(createdSection);
    const createdPage = structureAfterCreate.pages.find((page) => page.sectionId === createdSection.id);
    assert.ok(createdPage, "a new Section must receive its first Page");

    model = projectNoteSidebar(structureAfterCreate);
    const projectedSection = model.sections.find((section) => section.id === createdSection.id)!;
    const projectedPage = projectedSection.pages[0];
    await controller.deleteSheet(projectedPage, projectedPage.sheets[0]);
    assert.equal(store.getSnapshot().structure?.pages.some((page) => page.id === projectedPage.id), false, "deleting the last Sheet removes its Page");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("new Notebook, Page and Sheet content defaults to First Aid", async () => {
  const { dbName, repository, store } = await harness();
  const expectFirstAid = async (sheetId: string | undefined) => {
    assert.ok(sheetId);
    const content = await repository.loadSheetContent(sheetId);
    assert.deepEqual(content?.paper, DEFAULT_NEW_NOTE_PAPER);
    assert.deepEqual(content?.firstAid, { version: 1, blocks: [] });
  };
  try {
    await store.createNotebook("Sổ First Aid mới");
    await expectFirstAid(store.getSnapshot().structure?.active.activeSheetId);

    await store.createPage("sec-a", "Page First Aid mới");
    await expectFirstAid(store.getSnapshot().structure?.active.activeSheetId);

    await store.createSheet("page-a");
    await expectFirstAid(store.getSnapshot().structure?.active.activeSheetId);
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("sidebar UI remains a render consumer and CI watches its real boundaries", async () => {
  const [sidebar, styles, workflow] = await Promise.all([
    readFile(new URL("../app/note-sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/note-sidebar.css", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/sidebar-controls-e2e.yml", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(sidebar, /note-store|note-domain|mednote-dialog/);
  assert.ok(sidebar.indexOf('status === "error"') < sidebar.indexOf('status === "idle"'), "error state must win over the loading fallback");
  assert.doesNotMatch(styles, /:has\(|note-sidebar-v6/);
  for (const path of ["app/note-sidebar-controller.ts", "app/note-sidebar-model.ts", "app/ui/note-navigation-host.tsx"]) {
    assert.match(workflow, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(workflow, /app\/note-navigation\.ts/);
});
