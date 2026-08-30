import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { createDriveBackup, parseDriveBackup, stageDriveBackup, verifyLibraryRoundTrip } from "../app/drive-backup";
import { installDesktopLifecycle } from "../app/desktop-lifecycle";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import type { LibraryV6 } from "../app/note-repository";

function library(): LibraryV6 {
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Đái tháo đường", order: 0 }],
      pages: [
        { id: "page-1", sectionId: "sec", title: "Điều trị", order: 0 },
        { id: "page-2", sectionId: "sec", title: "Theo dõi", order: 1 },
      ],
      sheets: [
        { id: "sheet-1", pageId: "page-1", order: 0 },
        { id: "sheet-2", pageId: "page-2", order: 0 },
      ],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page-1", activeSheetId: "sheet-1" },
    },
    sheetContents: {
      "sheet-1": { body: "Metformin", excerpts: [] },
      "sheet-2": { body: "HbA1c", excerpts: [] },
    },
    documents: { documents: [], contexts: [], groups: [], links: [], linkRelations: [] },
    preferences: { activeDocumentContextId: "", readerShare: 50, workspaceMode: "split", noteZoom: 1 },
    savedAt: 1,
  };
}

test("PDF links are many-to-many and deleting documents keeps notes intact", async () => {
  const dbName = `mednote-wave3-links-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  try {
    await repository.replaceLibrary(library());
    const now = Date.now();
    await repository.saveDocumentWorkspace({
      documents: [
        { id: "doc-a", name: "ADA.pdf", size: 10, lastModified: 1, available: true, payload: {} },
        { id: "doc-b", name: "IDSA.pdf", size: 20, lastModified: 2, available: true, payload: {} },
      ],
      context: { id: "ctx", kind: "collection", name: "Guidelines", documentIds: ["doc-a", "doc-b"], activeDocumentId: "doc-a", sourcePage: 1 },
      group: { id: "ctx", name: "Guidelines", documentIds: ["doc-a", "doc-b"], createdAt: now, updatedAt: now },
      links: [
        { id: "link-a-1", documentId: "doc-a", targetType: "page", targetId: "page-1" },
        { id: "link-b-1", documentId: "doc-b", targetType: "page", targetId: "page-1" },
      ],
      linkRelations: [{ id: "rel-1", linkIds: ["link-a-1", "link-b-1"], kind: "workspace", sourceType: "group", sourceId: "ctx", createdAt: now, updatedAt: now }],
    });
    await repository.saveDocumentWorkspace({
      documents: [{ id: "doc-a", name: "ADA.pdf", size: 10, lastModified: 1, available: true, payload: {} }],
      context: { id: "ctx", kind: "collection", name: "Guidelines", documentIds: ["doc-a", "doc-b"], activeDocumentId: "doc-a", sourcePage: 1 },
      links: [{ id: "link-a-2", documentId: "doc-a", targetType: "sheet", targetId: "sheet-2" }],
      linkRelations: [{ id: "rel-2", linkIds: ["link-a-2"], kind: "content", sourceType: "document", sourceId: "doc-a", createdAt: now, updatedAt: now }],
    });
    const graph = await repository.loadDocumentGraph();
    assert.equal(graph?.links.filter((link) => link.targetId === "page-1").length, 2, "Một Page nhận link từ nhiều PDF");
    assert.equal(graph?.links.filter((link) => link.documentId === "doc-a").length, 2, "Một PDF liên kết nhiều note target");

    const beforeNotes = await repository.loadNoteStructure();
    await repository.deleteDocumentWorkspace("ctx");
    const after = await repository.loadLibrary();
    assert.deepEqual(after?.notes, beforeNotes);
    assert.deepEqual(after?.documents, { documents: [], contexts: [], groups: [], links: [], linkRelations: [] });
  } finally {
    await deleteNoteRepositoryDatabase(dbName);
  }
});

test("Drive v2 stages and verifies IDs, hierarchy, links and content hashes", async () => {
  const source = library();
  source.documents = {
    documents: [{ id: "doc", name: "Harrison.pdf", size: 42, lastModified: 7, available: true, payload: {} }],
    contexts: [{ id: "ctx", kind: "document", name: "Harrison", documentIds: ["doc"], activeDocumentId: "doc", sourcePage: 12 }],
    groups: [],
    links: [{ id: "link", documentId: "doc", targetType: "page", targetId: "page-1" }],
    linkRelations: [{ id: "relation", linkIds: ["link"], kind: "workspace", sourceType: "document", sourceId: "doc", createdAt: 1, updatedAt: 1 }],
  };
  const backup = createDriveBackup(source);
  const staged = await stageDriveBackup(backup, `mednote-wave3-stage-${crypto.randomUUID()}`);
  verifyLibraryRoundTrip(source, staged);

  const tampered = structuredClone(backup);
  tampered.library.sheetContents["sheet-1"] = { body: "tampered" };
  assert.throws(() => parseDriveBackup(tampered), /Hash nội dung Sheet/);
  assert.throws(() => parseDriveBackup({ workspaces: [] }), /manifest v2/);
});

test("Drive staging accepts a valid manifest whose Sheet records are not already in repository order", async () => {
  const source = library();
  source.notes.sheets.reverse();
  source.sheetContents = {
    "sheet-2": source.sheetContents["sheet-2"],
    "sheet-1": source.sheetContents["sheet-1"],
  };

  const staged = await stageDriveBackup(
    createDriveBackup(source),
    `mednote-wave3-unsorted-stage-${crypto.randomUUID()}`,
  );

  assert.deepEqual(staged.notes.sheets.map((sheet) => sheet.id), ["sheet-1", "sheet-2"]);
  assert.equal(staged.sheetContents["sheet-1"].body, "Metformin");
  assert.equal(staged.sheetContents["sheet-2"].body, "HbA1c");
  verifyLibraryRoundTrip(source, staged);
});

test("desktop lifecycle flushes the renderer store before acknowledging close", async () => {
  let listener: ((requestId: string) => void) | null = null;
  const completions: unknown[][] = [];
  let flushes = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      mednoteDesktop: {
        isDesktop: true,
        onFlushRequested: (callback: (requestId: string) => void) => { listener = callback; return () => undefined; },
        completeFlush: (...args: unknown[]) => { completions.push(args); },
      },
    },
  });
  installDesktopLifecycle({ flush: async () => { flushes += 1; } } as never);
  assert.ok(listener);
  (listener as (requestId: string) => void)("close-1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(flushes, 1);
  assert.deepEqual(completions, [["close-1", true]]);

  const [main, preload, lifecycle, closeLifecycle] = await Promise.all([
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop-lifecycle.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/window-close-lifecycle.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(main, /createWindowCloseLifecycle/);
  assert.match(main, /app:flush-result/);
  assert.match(closeLifecycle, /app:flush-before-close/);
  assert.match(closeLifecycle, /query-session-end/);
  assert.match(preload, /onFlushRequested/);
  assert.match(lifecycle, /await store\.flush\(\)/);
  assert.doesNotMatch(main, /IndexedDB|Notebook\.pages|library:v6/);
  delete (globalThis as { window?: unknown }).window;
});
