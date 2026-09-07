import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { IndexedDbNoteRepository, deleteNoteRepositoryDatabase } from '../app/indexeddb-note-repository';
import { NoteStore } from '../app/note-store';
import { defaultNotebookCover, normalizeNotebookCover } from '../app/notebook-cover';
import { createDriveBackup, parseDriveBackup, verifyLibraryRoundTrip } from '../app/drive-backup';
import { projectLibrary } from '../app/library-projection';
import type { LibraryV6 } from '../app/note-repository';
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

test('cover survives queued rename, reload and Drive restore without changing sheets or navigation', async () => {
  const dbName = `cover-${crypto.randomUUID()}`;
  const restoreName = `${dbName}-restore`;
  try {
    const repository = new IndexedDbNoteRepository({ dbName });
    const original = emptyLibrary();
    await repository.replaceLibrary(original);
    const store = new NoteStore(repository);
    await store.initialize({ skipMigration: true });
    const cover = { ...defaultNotebookCover('nb'), title: 'NỘI TIẾT', subtitle: 'Lâm sàng 2026', template: 'photo' as const, image: 'data:image/jpeg;base64,YWJj', thumbnail: 'data:image/jpeg;base64,YWJj' };
    await Promise.all([store.updateNotebookCover('nb', cover), store.renameNotebook('nb', 'Nội tiết học')]);
    const saved = (await repository.loadLibrary())!;
    assert.deepEqual(saved.notes.notebooks[0].cover, cover);
    assert.equal(saved.notes.notebooks[0].title, 'Nội tiết học');
    assert.deepEqual(saved.notes.active, original.notes.active);
    assert.deepEqual(saved.sheetContents, original.sheetContents);
    assert.ok(saved.savedAt > original.savedAt);
    assert.deepEqual(projectLibrary(saved.notes, saved.documents).notes[0].cover, cover);
    const restored = parseDriveBackup(JSON.parse(JSON.stringify(createDriveBackup(saved))));
    const destination = new IndexedDbNoteRepository({ dbName: restoreName });
    await destination.replaceLibrary(restored);
    verifyLibraryRoundTrip(saved, (await destination.loadLibrary())!);
    await assert.rejects(repository.updateNotebookCover('missing', cover));
    assert.deepEqual((await repository.loadLibrary())!.notes, saved.notes);
  } finally { await deleteNoteRepositoryDatabase(dbName); await deleteNoteRepositoryDatabase(restoreName); }
});
test('legacy notebooks get stable covers; malformed metadata cannot supply remote or oversized image URLs', () => {
  assert.deepEqual(normalizeNotebookCover(undefined, 'nb'), defaultNotebookCover('nb'));
  const result = normalizeNotebookCover({ template: '__proto__', icon: 'constructor', color: 'url(https://example.com)', image: 'https://example.com/a.jpg', thumbnail: 'data:image/jpeg;base64,' + 'a'.repeat(30000), positionX: Infinity, positionY: -10, title: 'a'.repeat(200) }, 'nb');
  assert.equal(result.template, 'academic');
  assert.equal(result.icon, 'book');
  assert.equal(result.image, undefined);
  assert.equal(result.thumbnail, undefined);
  assert.equal(result.positionX, 50);
  assert.equal(result.positionY, 0);
  assert.equal(result.title.length, 120);
});

test('opening a notebook shows its cover and resumes its sheet without altering durable navigation', async () => {
  const dbName = `cover-opening-${crypto.randomUUID()}`;
  try {
    const repository = new IndexedDbNoteRepository({ dbName });
    await repository.replaceLibrary(emptyLibrary());
    const store = new NoteStore(repository);
    await store.initialize({ skipMigration: true });
    await store.createPage('sec', 'Trang thứ hai', { body: 'Đang viết' });
    const secondSheet = store.getSnapshot().structure!.active.activeSheetId;
    await store.openNotebook('nb');
    assert.equal(store.getSnapshot().coverNotebookId, 'nb');
    assert.equal(store.getSnapshot().structure!.active.activeSheetId, secondSheet);
    store.dismissNotebookCover();
    assert.equal(store.getSnapshot().coverNotebookId, null);
    await store.createNotebook('Tim mạch');
    assert.equal(store.getSnapshot().coverNotebookId, store.getSnapshot().structure!.active.activeNotebookId);
    await store.openNotebook('nb');
    assert.equal(store.getSnapshot().structure!.active.activeSheetId, secondSheet);
    await store.openSheet(secondSheet);
    assert.equal(store.getSnapshot().coverNotebookId, null);
    await Promise.all([store.openNotebook('nb'), store.openSheet('sheet')]);
    assert.equal(store.getSnapshot().coverNotebookId, null);
    assert.equal(store.getSnapshot().structure!.active.activeSheetId, 'sheet');
    assert.equal((await repository.loadLibrary())!.sheetContents[secondSheet].body, 'Đang viết');
    assert.equal(Object.hasOwn((await repository.loadLibrary())!, 'coverNotebookId'), false);
  } finally { await deleteNoteRepositoryDatabase(dbName); }
});
