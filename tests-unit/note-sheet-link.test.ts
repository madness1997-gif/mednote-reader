import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { noteSheetHref, noteSheetLinkTargets, normalizeNoteLinkSearch, parseNoteSheetHref } from "../app/note-sheet-link";
import { IndexedDbNoteRepository, deleteNoteRepositoryDatabase } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import { createV6LibraryFixture } from "./v6-library-fixture";

test("sheet links round-trip opaque IDs and reject foreign or malformed URLs", () => {
  for (const id of ["sheet-2", "tờ / 2?#&%\"'", "sheet:uuid"]) {
    assert.equal(parseNoteSheetHref(noteSheetHref(id)), id);
  }
  for (const href of [null, "", "#mednote-sheet=", "#mednote-sheet=%", "#mednote-sheet=%00", "#mednote-sheet=x&other=1", "javascript:alert(1)", "https://example.com/#mednote-sheet=x", "//example.com", "#other=x"]) {
    assert.equal(parseNoteSheetHref(href), null);
  }
});

test("picker orders the full note hierarchy and supports Vietnamese search without accents", () => {
  const structure = createV6LibraryFixture().notes;
  structure.sheets.reverse();
  const original = JSON.stringify(structure);
  const targets = noteSheetLinkTargets(structure);
  assert.deepEqual(targets.map((target) => target.sheetId), ["sheet-dm-1", "sheet-dm-2", "sheet-thyroid-1"]);
  assert.equal(targets[1].path, "Nội tiết / Đái tháo đường / Điều trị ĐTĐ · Tờ 2");
  assert.match(normalizeNoteLinkSearch(targets[1].path), /dai thao duong/);
  assert.equal(JSON.stringify(structure), original);
});

test("linked sheet navigation saves the source and survives rename, cross-notebook move and reload", async () => {
  const dbName = `note-links-${Date.now()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  const library = createV6LibraryFixture();
  library.notes.notebooks.push({ id: "nb-other", title: "Sổ khác", order: 1 });
  library.notes.sections.push({ id: "sec-other", notebookId: "nb-other", title: "Mục khác", order: 0 });
  library.notes.pages.push({ id: "page-other", sectionId: "sec-other", title: "Page khác", order: 0 });
  library.notes.sheets.push({ id: "sheet-other", pageId: "page-other", order: 0 });
  library.sheetContents["sheet-other"] = { body: "Đích" };
  await repository.replaceLibrary(library);
  const store = new NoteStore(repository);
  try {
    await store.initialize({ skipMigration: true });
    const href = noteSheetHref("sheet-dm-1");
    const bodyHtml = `<p>Bản nháp mới <a href="${href}">Tham khảo</a></p>`;
    store.patchActiveSheetContent({ bodyHtml });
    await store.openSheet(parseNoteSheetHref(href)!);
    assert.equal((await repository.loadSheetContent("sheet-dm-2"))?.bodyHtml, bodyHtml);
    await store.renamePage("page-dm", "Đổi tên");
    await store.moveSheet("sheet-dm-1", "page-other", 1);
    await store.openSheet("sheet-dm-2");
    await store.openSheet(parseNoteSheetHref(href)!);
    assert.deepEqual(store.activeState(), { activeNotebookId: "nb-other", activeSectionId: "sec-other", activePageId: "page-other", activeSheetId: "sheet-dm-1" });
    assert.equal(noteSheetLinkTargets(store.getSnapshot().structure!).find((item) => item.sheetId === "sheet-dm-1")?.path, "Sổ khác / Mục khác / Page khác · Tờ 2");
    const reopened = new NoteStore(repository);
    await reopened.initialize({ skipMigration: true });
    await reopened.openSheet("sheet-dm-2");
    assert.equal(reopened.getSnapshot().activeSheetContent?.bodyHtml, bodyHtml);
    await reopened.deleteSheet("sheet-dm-1");
    await reopened.openSheet("sheet-dm-2");
    await assert.rejects(reopened.openSheet(parseNoteSheetHref(href)!), /Không tìm thấy Sheet/);
    assert.equal(reopened.activeState()?.activeSheetId, "sheet-dm-2");
  } finally {
    await store.flush();
    await deleteNoteRepositoryDatabase(dbName);
  }
});
