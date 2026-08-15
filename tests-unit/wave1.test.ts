import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateNoteStructure, validateSheetContents, type NoteStructure } from "../app/note-domain";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository, V6_KEYS } from "../app/indexeddb-note-repository";
import { contentHash, migrateLegacySnapshotToV6, migrateStoredLibraryToV6, migrateV5ToV6, verifyMigration, type LegacySnapshot, type V5MigrationSource } from "../app/note-migration";
import { relationV2FromV6, type LegacyRelationV2 } from "../app/relation-v2-migration";

const fixture = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const v3 = fixture<LegacySnapshot>("tests/fixtures/v3/library.json");
const v4 = fixture<LegacySnapshot>("tests/fixtures/v4/library.json");
const v5 = fixture<V5MigrationSource>("tests/fixtures/v5/library.json");
const relation = fixture<LegacyRelationV2>("tests/fixtures/relation-v2/library.json");

async function rawRead<T>(dbName: string, key: string): Promise<T | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction("documents", "readonly").objectStore("documents").get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function rawDelete(dbName: string, key: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("documents", "readwrite");
      transaction.objectStore("documents").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function rawWrite(dbName: string, key: string, value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("documents", "readwrite");
      transaction.objectStore("documents").put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function traceIndexedDbReads<T>(operation: () => Promise<T>) {
  const prototype = IDBObjectStore.prototype as any;
  const original = prototype.get;
  const keys: string[] = [];
  prototype.get = function tracedGet(key: IDBValidKey | IDBKeyRange) {
    keys.push(String(key));
    return original.call(this, key);
  };
  try {
    return { value: await operation(), keys };
  } finally {
    prototype.get = original;
  }
}

test("domain v6 separates Sheet metadata from content and rejects invalid active chains", () => {
  const structure: NoteStructure = {
    workspace: { id: "workspace", title: "MedNote" },
    notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
    sections: [{ id: "sec", notebookId: "nb", title: "ĐTĐ", order: 0 }],
    pages: [{ id: "page", sectionId: "sec", title: "Điều trị", order: 0 }],
    sheets: [{ id: "sheet", pageId: "page", order: 0 }],
    active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet" },
  };
  const contents = { sheet: { body: "Metformin", logicalPageTitle: "bản sao sai" } };
  assert.deepEqual(validateNoteStructure(structure), []);
  assert.ok(validateSheetContents(structure, contents).some((issue) => issue.code === "navigation-metadata-in-content"));
  delete contents.sheet.logicalPageTitle;
  assert.deepEqual(validateSheetContents(structure, contents), []);
  assert.ok(validateSheetContents(structure, {}).some((issue) => issue.code === "missing-content"));
  assert.ok(validateSheetContents(structure, { sheet: {}, orphan: {} }).some((issue) => issue.code === "orphan-content"));
  structure.active.activePageId = "missing";
  assert.ok(validateNoteStructure(structure).some((issue) => issue.code === "invalid-active-chain"));

  for (const file of ["app/note-domain.ts", "app/document-domain.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["']react/);
    assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|window\.|document\./);
  }
});

test("v3/v4/v5 fixtures migrate without metadata or content loss", () => {
  const migratedV3 = migrateLegacySnapshotToV6(v3, 3, relation);
  const migratedV4 = migrateLegacySnapshotToV6(v4, 4);
  const migratedV5 = migrateV5ToV6(v5, relation);
  verifyMigration(migratedV3);
  verifyMigration(migratedV4);
  verifyMigration(migratedV5);

  assert.equal(migratedV3.library.notes.pages.length, 1);
  assert.equal(migratedV3.library.notes.sheets.length, 2);
  assert.deepEqual(migratedV3.library.notes.active, { activeNotebookId: "nb-endo", activeSectionId: "sec-diabetes", activePageId: "page-dm", activeSheetId: "sheet-dm-2" });
  for (const sheet of migratedV3.library.notes.sheets) {
    assert.deepEqual(Object.keys(sheet).sort(), ["id", "order", "pageId"]);
    for (const key of ["logicalPageId", "logicalPageTitle", "title", "sheetOrder"]) assert.equal(Object.hasOwn(migratedV3.library.sheetContents[sheet.id], key), false);
  }
  assert.deepEqual(migratedV4.library.sheetContents[migratedV4.library.notes.sheets[0].id].paper, { template: "first-aid" });
  assert.deepEqual(migratedV5.report, {
    ...migratedV5.report,
    sourceVersion: 5,
    notebookCount: 1,
    sectionCount: 2,
    pageCount: 2,
    sheetCount: 3,
    documentCount: 2,
  });
  assert.ok(migratedV5.library.documents.links.some((link) => link.documentId === "doc-idsa" && link.targetType === "page" && link.targetId === "page-dm"));
  assert.ok(migratedV5.library.documents.links.some((link) => link.documentId === "doc-ada" && link.targetType === "sheet" && link.targetId === "sheet-dm-2"));
  assert.deepEqual(migratedV5.library.documents.linkRelations.find((item) => item.id === "relation-group-page")?.workspacePreset?.pdfPages, { "doc-ada": 12, "doc-idsa": 3 });
  assert.equal(migratedV5.library.documents.linkRelations.find((item) => item.id === "relation-content-block")?.contentAnchor?.annotationId, "ann-1");
  assert.deepEqual(migratedV5.report.warnings, []);

  const brokenRelation = structuredClone(relation);
  brokenRelation.relations![0].target = { type: "page", id: "missing-page", notebookId: "missing-notebook" };
  assert.match(migrateV5ToV6(v5, brokenRelation).report.warnings[0], /không resolve được target/);

  const rebuilt = relationV2FromV6(migratedV5.library);
  assert.deepEqual(rebuilt.notebooks?.[0].sections[0].pageIds, ["sheet-dm-1", "sheet-dm-2"]);
  assert.deepEqual(rebuilt.relations?.find((item) => item.id === "relation-group-page")?.source, { type: "group", id: "group-guidelines" });
  assert.deepEqual(rebuilt.relations?.find((item) => item.id === "relation-content-block")?.target, {
    type: "block", id: "fa-1", notebookId: "nb-endo", sectionId: "sec-diabetes", pageId: "sheet-dm-2", logicalPageId: "page-dm", scope: "sheet",
  });
});

test("repository v6 uses direct transactional CRUD", async () => {
  const dbName = `mednote-wave1-repository-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(migrateV5ToV6(v5, relation).library);
    const beforeMeta = await rawRead(dbName, V6_KEYS.meta);
    const beforeSheet = await rawRead(dbName, `${V6_KEYS.sheet}sheet-dm-1`);
    const beforeContent = await rawRead(dbName, `${V6_KEYS.sheetContent}sheet-dm-1`);
    await repository.renamePage("page-dm", "Điều trị ĐTĐ type 2");
    assert.equal((await rawRead<{ title: string }>(dbName, `${V6_KEYS.page}page-dm`))?.title, "Điều trị ĐTĐ type 2");
    const afterMeta = await rawRead<Record<string, any>>(dbName, V6_KEYS.meta);
    const { savedAt: beforeSavedAt, ...beforeMetaContract } = beforeMeta as Record<string, any>;
    const { savedAt: afterSavedAt, ...afterMetaContract } = afterMeta!;
    assert.deepEqual(afterMetaContract, beforeMetaContract, "Rename Page chỉ được đổi mốc commit ở meta");
    assert.ok(afterSavedAt > beforeSavedAt, "Mỗi mutation phải tăng savedAt");
    assert.deepEqual(await rawRead(dbName, `${V6_KEYS.sheet}sheet-dm-1`), beforeSheet, "Rename Page không được copy title xuống Sheet");
    assert.deepEqual(await rawRead(dbName, `${V6_KEYS.sheetContent}sheet-dm-1`), beforeContent, "Rename Page không được đọc/ghi SheetContent");

    const sectionId = await repository.createSection({ id: "sec-complications", notebookId: "nb-endo", title: "Biến chứng" });
    const created = await repository.createPage({ id: "page-neuropathy", sheetId: "sheet-neuropathy", sectionId, title: "Bệnh thần kinh", content: { body: "DPN" } });
    assert.deepEqual(created, { activeNotebookId: "nb-endo", activeSectionId: "sec-complications", activePageId: "page-neuropathy", activeSheetId: "sheet-neuropathy" });
    await repository.setActiveState({ activeNotebookId: "nb-endo", activeSectionId: "sec-thyroid", activePageId: "page-thyroid", activeSheetId: "sheet-thyroid-1" });
    await repository.movePage("page-thyroid", "sec-diabetes", 0);
    assert.deepEqual(await repository.readActiveState(), { activeNotebookId: "nb-endo", activeSectionId: "sec-diabetes", activePageId: "page-thyroid", activeSheetId: "sheet-thyroid-1" });
    await repository.createSheet({ id: "sheet-neuropathy-2", pageId: "page-neuropathy", content: { body: "CAN" } });
    await repository.moveSheet("sheet-neuropathy-2", "page-dm", 1);
    await assert.rejects(repository.deleteSheet("sheet-neuropathy"), /ít nhất một Sheet/);
    await repository.setActiveState({ activeNotebookId: "nb-endo", activeSectionId: "sec-diabetes", activePageId: "page-dm", activeSheetId: "sheet-neuropathy-2" });
    await assert.rejects(repository.setActiveState({ activeNotebookId: "nb-endo", activeSectionId: "sec-thyroid", activePageId: "page-dm", activeSheetId: "sheet-dm-1" }), /chuỗi Notebook/);
    await repository.deletePage("page-dm");

    const library = await repository.loadLibrary();
    assert.ok(library);
    assert.equal(library.notes.pages.some((item) => item.id === "page-dm"), false);
    assert.equal(library.notes.sheets.some((item) => ["sheet-dm-1", "sheet-dm-2", "sheet-neuropathy-2"].includes(item.id)), false);
    assert.equal(Object.keys(library.sheetContents).some((id) => ["sheet-dm-1", "sheet-dm-2", "sheet-neuropathy-2"].includes(id)), false);
    assert.equal(library.documents.links.some((link) => link.targetId === "page-dm" || ["sheet-dm-1", "sheet-dm-2", "sheet-neuropathy-2"].includes(link.targetId)), false);
    assert.deepEqual(library.notes.pages.find((item) => item.id === "page-thyroid"), { id: "page-thyroid", sectionId: "sec-diabetes", title: "Cường giáp", order: 0 });
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("create Notebook atomically creates Section, Page and Sheet", async () => {
  const dbName = `mednote-wave1-create-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(migrateV5ToV6(v5, relation).library);
    const active = await repository.createNotebook({ id: "nb-new", title: "Sổ mới", sectionId: "sec-new", pageId: "page-new", sheetId: "sheet-new", content: { body: "Không gắn PDF" } });
    assert.deepEqual(active, { activeNotebookId: "nb-new", activeSectionId: "sec-new", activePageId: "page-new", activeSheetId: "sheet-new" });
    const structure = await repository.loadNoteStructure();
    assert.ok(structure);
    assert.deepEqual(structure.sections.find((item) => item.id === "sec-new"), { id: "sec-new", notebookId: "nb-new", title: "Phần 1", order: 0 });
    assert.deepEqual(structure.pages.find((item) => item.id === "page-new"), { id: "page-new", sectionId: "sec-new", title: "Page 1", order: 0 });
    assert.deepEqual(structure.sheets.find((item) => item.id === "sheet-new"), { id: "sheet-new", pageId: "page-new", order: 0 });
    assert.deepEqual(await repository.loadSheet("sheet-new"), { id: "sheet-new", pageId: "page-new", order: 0, content: { body: "Không gắn PDF" } });
    await assert.rejects(repository.deleteSection("sec-new"), /ít nhất một Section/);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("structure reads and hierarchy mutations never hydrate SheetContent", async () => {
  const dbName = `mednote-wave15-lazy-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(migrateV5ToV6(v5, relation).library);
    const structureRead = await traceIndexedDbReads(() => repository.loadNoteStructure());
    assert.ok(structureRead.value);
    assert.equal(structureRead.keys.some((key) => key.startsWith(V6_KEYS.sheetContent)), false);
    assert.ok(structureRead.value.sheets.every((sheet) => !Object.hasOwn(sheet, "content")));
    const documentRead = await traceIndexedDbReads(() => repository.loadDocumentGraph());
    assert.ok(documentRead.value);
    assert.equal(documentRead.keys.some((key) => key.startsWith(V6_KEYS.sheetContent)), false);

    const before = await rawRead(dbName, `${V6_KEYS.sheetContent}sheet-dm-1`);
    const moveRead = await traceIndexedDbReads(() => repository.moveSheet("sheet-dm-1", "page-thyroid", 1));
    assert.equal(moveRead.keys.some((key) => key.startsWith(V6_KEYS.sheetContent)), false);
    assert.deepEqual(await rawRead(dbName, `${V6_KEYS.sheetContent}sheet-dm-1`), before);

    const contentRead = await traceIndexedDbReads(() => repository.loadSheetContent("sheet-dm-1"));
    assert.deepEqual(contentRead.value, before);
    assert.deepEqual(contentRead.keys.filter((key) => key.startsWith(V6_KEYS.sheetContent)), [`${V6_KEYS.sheetContent}sheet-dm-1`]);

    const metadataBeforeContentSave = await rawRead(dbName, `${V6_KEYS.sheet}sheet-dm-1`);
    await repository.saveSheetContent("sheet-dm-1", { body: "Nội dung mới" });
    assert.deepEqual(await rawRead(dbName, `${V6_KEYS.sheet}sheet-dm-1`), metadataBeforeContentSave);
    assert.deepEqual(await repository.loadSheetContent("sheet-dm-1"), { body: "Nội dung mới" });
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("missing SheetContent is isolated from structure loading and reported on hydration", async () => {
  const dbName = `mednote-wave15-corrupt-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(migrateV5ToV6(v5, relation).library);
    await rawDelete(dbName, `${V6_KEYS.sheetContent}sheet-dm-1`);
    assert.ok(await repository.loadNoteStructure(), "Structure còn nguyên phải vẫn load được");
    await assert.rejects(repository.loadSheetContent("sheet-dm-1"), /thiếu record/);
    await assert.rejects(repository.loadLibrary(), /thiếu record/);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("full-library validation rejects orphan SheetContent and replaceLibrary removes it", async () => {
  const dbName = `mednote-wave15-orphan-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  const library = migrateV5ToV6(v5, relation).library;
  const orphanKey = `${V6_KEYS.sheetContent}orphan`;
  try {
    await repository.replaceLibrary(library);
    await rawWrite(dbName, orphanKey, { body: "orphan" });
    assert.ok(await repository.loadNoteStructure());
    await assert.rejects(repository.loadLibrary(), /record mồ côi/);
    await repository.replaceLibrary(library);
    assert.equal(await rawRead(dbName, orphanKey), undefined);
    assert.ok(await repository.loadLibrary());
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("storage migration commits v6, verifies hashes, and keeps v5 fallback", async () => {
  const dbName = `mednote-wave1-migration-${crypto.randomUUID()}`;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite");
    const store = transaction.objectStore("documents");
    store.put(v5.meta, "library:v5:meta");
    store.put(v5.workspace, "library:v5:workspace");
    v5.notebooks.forEach((item) => store.put(item, `library:v5:notebook:${item.id}`));
    v5.sections.forEach((item) => store.put(item, `library:v5:section:${item.id}`));
    v5.pages.forEach((item) => store.put(item, `library:v5:page:${item.id}`));
    v5.sheets.forEach((item) => store.put(item, `library:v5:sheet:${item.id}`));
    v5.links.forEach((item) => store.put(item, `library:v5:note-document-link:${item.id}`));
    v5.contexts.forEach((item) => store.put(item, `library:v5:document-context:${item.id}`));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();

  try {
    const migrated = await migrateStoredLibraryToV6({ dbName, relation });
    assert.ok(migrated);
    const repository = new IndexedDbNoteRepository({ dbName });
    const reloaded = await repository.loadLibrary();
    assert.ok(reloaded);
    assert.equal((await rawRead<{ version: number }>(dbName, "library:v5:meta"))?.version, 5);
    assert.equal((await rawRead<{ version: number }>(dbName, V6_KEYS.meta))?.version, 6);
    assert.deepEqual(reloaded.notes.active, { activeNotebookId: "nb-endo", activeSectionId: "sec-diabetes", activePageId: "page-dm", activeSheetId: "sheet-dm-2" });
    assert.deepEqual(Object.fromEntries(reloaded.notes.sheets.map((sheet) => [sheet.id, contentHash(reloaded.sheetContents[sheet.id])])), migrated.report.sheetContentHashes);
    const rebuilt = relationV2FromV6(reloaded);
    assert.deepEqual(rebuilt.groups?.[0].documentIds, ["doc-ada", "doc-idsa"]);
    assert.equal(rebuilt.notebooks?.[0].sections.length, 2);
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("storage migration reads both v3 and v4 record layouts", async () => {
  for (const [version, snapshot, relationSource] of [[3, v3, relation], [4, v4, undefined]] as const) {
    const dbName = `mednote-wave1-v${version}-${crypto.randomUUID()}`;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("documents");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("documents", "readwrite");
      const store = transaction.objectStore("documents");
      store.put({
        version,
        workspaceIds: snapshot.workspaces.map((workspace) => workspace.id),
        activeWorkspaceId: snapshot.activeWorkspaceId,
        readerShare: snapshot.readerShare,
        workspaceMode: snapshot.workspaceMode,
        noteZoom: snapshot.noteZoom,
        savedAt: snapshot.savedAt,
      }, "library:v3:meta");
      const seenNotebooks = new Set<string>();
      const seenSheets = new Set<string>();
      snapshot.workspaces.forEach((workspace) => {
        store.put({ ...workspace, notebooks: undefined, notebookIds: workspace.notebooks.map((notebook: Record<string, any>) => notebook.id) }, `library:v3:workspace:${workspace.id}`);
        workspace.notebooks.forEach((notebook: Record<string, any>) => {
          if (!seenNotebooks.has(notebook.id)) {
            store.put({ ...notebook, pages: undefined, pageIds: notebook.pages.map((sheet: Record<string, any>) => sheet.id) }, `library:v3:notebook:${notebook.id}`);
            seenNotebooks.add(notebook.id);
          }
          notebook.pages.forEach((sheet: Record<string, any>) => {
            if (!seenSheets.has(sheet.id)) store.put(sheet, `library:v3:page:${sheet.id}`);
            seenSheets.add(sheet.id);
          });
        });
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();

    try {
      const migrated = await migrateStoredLibraryToV6({ dbName, relation: relationSource });
      assert.ok(migrated);
      assert.equal(migrated.report.sourceVersion, version);
      assert.equal((await rawRead<{ version: number }>(dbName, "library:v3:meta"))?.version, version);
      assert.equal((await rawRead<{ version: number }>(dbName, V6_KEYS.meta))?.version, 6);
      assert.ok(migrated.library.notes.sheets.every((sheet) => !Object.hasOwn(migrated.library.sheetContents[sheet.id], "logicalPageId")));
    } finally {
      await deleteNoteRepositoryDatabase(dbName);
    }
  }
});

test("storage migration refuses cutover when a legacy relation cannot round-trip", async () => {
  const dbName = `mednote-wave1-blocked-${crypto.randomUUID()}`;
  const brokenRelation = structuredClone(relation);
  brokenRelation.relations![0].target = { type: "page", id: "missing-page", notebookId: "missing-notebook" };
  try {
    await assert.rejects(
      migrateStoredLibraryToV6({ dbName, localSnapshot: v3, localSnapshotVersion: 3, relation: brokenRelation }),
      /Dừng migration v6/,
    );
    assert.equal(await rawRead(dbName, V6_KEYS.meta), undefined, "Không được ghi marker v6 khi relation chưa bảo toàn");
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});
