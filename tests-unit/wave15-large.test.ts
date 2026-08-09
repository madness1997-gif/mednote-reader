import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository, V6_KEYS } from "../app/indexeddb-note-repository";
import { migrateV5ToV6, type V5MigrationSource } from "../app/note-migration";

type LargeFixtureManifest = {
  notebookCount: number;
  sectionsPerNotebook: number;
  pagesPerSection: number;
  sheetsPerPage: number;
  contentBytesPerSheet: number;
  maxMigrationMs: number;
  maxMigrationHeapBytes: number;
  maxStructureLoadMs: number;
  maxStructureHeapBytes: number;
  maxSerializedStructureBytes: number;
};

const manifest = JSON.parse(readFileSync("tests/fixtures/large-v5/manifest.json", "utf8")) as LargeFixtureManifest;

function buildLargeV5Fixture(): V5MigrationSource {
  const notebooks: Record<string, any>[] = [];
  const sections: Record<string, any>[] = [];
  const pages: Record<string, any>[] = [];
  const sheets: Record<string, any>[] = [];
  const payload = "x".repeat(manifest.contentBytesPerSheet);

  for (let notebookOrder = 0; notebookOrder < manifest.notebookCount; notebookOrder += 1) {
    const notebookId = `large-notebook-${notebookOrder}`;
    notebooks.push({ id: notebookId, title: `Notebook ${notebookOrder}`, order: notebookOrder });
    for (let sectionOrder = 0; sectionOrder < manifest.sectionsPerNotebook; sectionOrder += 1) {
      const sectionId = `${notebookId}-section-${sectionOrder}`;
      sections.push({ id: sectionId, notebookId, title: `Section ${sectionOrder}`, order: sectionOrder });
      for (let pageOrder = 0; pageOrder < manifest.pagesPerSection; pageOrder += 1) {
        const pageId = `${sectionId}-page-${pageOrder}`;
        pages.push({ id: pageId, sectionId, title: `Page ${pageOrder}`, order: pageOrder });
        for (let sheetOrder = 0; sheetOrder < manifest.sheetsPerPage; sheetOrder += 1) {
          const sheetId = `${pageId}-sheet-${sheetOrder}`;
          sheets.push({
            id: sheetId,
            pageId,
            order: sheetOrder,
            content: {
              body: `${sheetId}:${payload}`,
              bodyHtml: `<p>${sheetId}</p>`,
              paper: { template: "first-aid" },
              strokes: [],
              excerpts: [],
            },
          });
        }
      }
    }
  }

  return {
    meta: {
      version: 5,
      notebookIds: notebooks.map((record) => record.id),
      sectionIds: sections.map((record) => record.id),
      pageIds: pages.map((record) => record.id),
      sheetIds: sheets.map((record) => record.id),
      linkIds: [],
      contextIds: ["large-context"],
      activeNotebookId: notebooks[0].id,
      activeSectionId: sections[0].id,
      activePageId: pages[0].id,
      activeSheetId: sheets[0].id,
      activeDocumentContextId: "large-context",
      readerShare: 50,
      workspaceMode: "note",
      noteZoom: 1,
      savedAt: 1,
    },
    workspace: { id: "large-workspace", title: "Large fixture" },
    notebooks,
    sections,
    pages,
    sheets,
    links: [],
    contexts: [{ id: "large-context", kind: "empty", name: "Large fixture", documents: [], activeDocumentId: null, sourcePage: 1 }],
  };
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

test("large v5 fixture migrates within budget and structure load stays content-free", async () => {
  const source = buildLargeV5Fixture();
  const expectedSheetCount = manifest.notebookCount * manifest.sectionsPerNotebook * manifest.pagesPerSection * manifest.sheetsPerPage;
  assert.equal(source.sheets.length, expectedSheetCount);

  globalThis.gc?.();
  const heapBeforeMigration = process.memoryUsage().heapUsed;
  const migrationStartedAt = performance.now();
  const migrated = migrateV5ToV6(source);
  const migrationMs = performance.now() - migrationStartedAt;
  globalThis.gc?.();
  const migrationHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBeforeMigration);
  assert.equal(migrated.library.notes.sheets.length, expectedSheetCount);
  assert.ok(migrationMs < manifest.maxMigrationMs, `Migration mất ${migrationMs.toFixed(0)} ms`);
  assert.ok(migrationHeapBytes < manifest.maxMigrationHeapBytes, `Migration tăng heap ${migrationHeapBytes} bytes`);

  const dbName = `mednote-wave15-large-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    const persistStartedAt = performance.now();
    await repository.replaceLibrary(migrated.library);
    const persistMs = performance.now() - persistStartedAt;

    globalThis.gc?.();
    const heapBeforeStructure = process.memoryUsage().heapUsed;
    const structureStartedAt = performance.now();
    const traced = await traceIndexedDbReads(() => repository.loadNoteStructure());
    const structureLoadMs = performance.now() - structureStartedAt;
    globalThis.gc?.();
    const structureHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBeforeStructure);
    assert.ok(traced.value);
    assert.equal(traced.keys.some((key) => key.startsWith(V6_KEYS.sheetContent)), false, "Structure load không được đọc SheetContent key");
    assert.ok(traced.value.sheets.every((sheet) => !Object.hasOwn(sheet, "content")));
    assert.ok(structureLoadMs < manifest.maxStructureLoadMs, `Structure load mất ${structureLoadMs.toFixed(0)} ms`);
    assert.ok(structureHeapBytes < manifest.maxStructureHeapBytes, `Structure load tăng heap ${structureHeapBytes} bytes`);
    const serializedStructureBytes = Buffer.byteLength(JSON.stringify(traced.value));
    assert.ok(serializedStructureBytes < manifest.maxSerializedStructureBytes, `Structure DTO có ${serializedStructureBytes} bytes`);

    const activeContent = await repository.loadSheetContent(traced.value.active.activeSheetId);
    assert.equal(String(activeContent?.body || "").length, manifest.contentBytesPerSheet + traced.value.active.activeSheetId.length + 1);
    console.log(JSON.stringify({
      sheets: expectedSheetCount,
      sourceContentMiB: Number((expectedSheetCount * manifest.contentBytesPerSheet / 1024 / 1024).toFixed(2)),
      migrationMs: Number(migrationMs.toFixed(1)),
      migrationHeapMiB: Number((migrationHeapBytes / 1024 / 1024).toFixed(2)),
      persistMs: Number(persistMs.toFixed(1)),
      structureLoadMs: Number(structureLoadMs.toFixed(1)),
      structureHeapMiB: Number((structureHeapBytes / 1024 / 1024).toFixed(2)),
      serializedStructureKiB: Number((serializedStructureBytes / 1024).toFixed(2)),
      contentKeysReadByStructure: traced.keys.filter((key) => key.startsWith(V6_KEYS.sheetContent)).length,
    }));
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});
