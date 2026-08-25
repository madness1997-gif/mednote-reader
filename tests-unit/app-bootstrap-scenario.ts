import "fake-indexeddb/auto";

import { createBlankPage } from "../app/note-runtime-adapter";
import { DEFAULT_READER, createEmptyWorkspace, type PersistedLibrary, type WorkspaceItem } from "../app/document-runtime-adapter";
import { IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { localBinaryStorage } from "../app/local-binary-storage";
import type { LibraryV6 } from "../app/note-repository";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });

const scenario = process.argv[2];

function runtimeWorkspace(id: string, body: string, documentName = `${id}.pdf`, kind: WorkspaceItem["kind"] = "document"): WorkspaceItem {
  const page = createBlankPage();
  page.id = `${id}-sheet`;
  page.title = `${id} page`;
  page.body = body;
  const notebook = {
    id: `${id}-notebook`,
    title: `${id} notebook`,
    pages: [page],
    activePageId: page.id,
    createdAt: 1,
  };
  return {
    id,
    kind,
    name: id,
    documents: kind === "empty" ? [] : [{
      id: `${id}-document`,
      name: documentName,
      size: body.length,
      lastModified: 1,
      reader: { ...DEFAULT_READER },
    }],
    activeDocumentId: kind === "empty" ? null : `${id}-document`,
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 1,
  };
}

function snapshot(workspaces: WorkspaceItem[], activeWorkspaceId = workspaces[0].id, overrides: Partial<PersistedLibrary> = {}): PersistedLibrary {
  return {
    workspaces,
    activeWorkspaceId,
    readerShare: 50,
    workspaceMode: "split",
    noteZoom: 1,
    savedAt: 10,
    ...overrides,
  };
}

function v6Library(contextIds = ["v6-workspace"]): LibraryV6 {
  const documents = contextIds.map((id) => ({
    id: `${id}-document`,
    name: `${id}.pdf`,
    size: id.length,
    lastModified: 1,
    available: true,
    payload: { reader: { ...DEFAULT_READER } },
  }));
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "v6-notebook", title: "V6", order: 0 }],
      sections: [{ id: "v6-section", notebookId: "v6-notebook", title: "Section", order: 0 }],
      pages: [{ id: "v6-page", sectionId: "v6-section", title: "Page", order: 0 }],
      sheets: [{ id: "v6-sheet", pageId: "v6-page", order: 0 }],
      active: { activeNotebookId: "v6-notebook", activeSectionId: "v6-section", activePageId: "v6-page", activeSheetId: "v6-sheet" },
    },
    sheetContents: { "v6-sheet": { body: "from v6" } },
    documents: {
      documents,
      contexts: contextIds.map((id) => ({
        id,
        kind: "document",
        name: id,
        documentIds: [`${id}-document`],
        activeDocumentId: `${id}-document`,
        sourcePage: 1,
      })),
      groups: [],
      links: [],
      linkRelations: [],
    },
    preferences: { activeDocumentContextId: contextIds[0], readerShare: 64, workspaceMode: "reader", noteZoom: 1.4 },
    savedAt: 600,
  };
}

function writeRawRecord(key: string, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("mednote-local", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("documents")) request.result.createObjectStore("documents");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("documents", "readwrite");
      transaction.objectStore("documents").put(value, key);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  });
}

function readRawRecord(key: string) {
  return new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open("mednote-local", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("documents", "readonly");
      const read = transaction.objectStore("documents").get(key);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => database.close();
    };
  });
}

async function seedStoredV5Library() {
  const contextId = "v5-workspace";
  const notebookId = "v5-notebook";
  const sectionId = "v5-section";
  const pageId = "v5-page";
  const sheetId = "v5-sheet";
  const documentId = "v5-document";
  const records: Array<[string, unknown]> = [
    ["library:v5:meta", {
      version: 5,
      notebookIds: [notebookId],
      sectionIds: [sectionId],
      pageIds: [pageId],
      sheetIds: [sheetId],
      linkIds: [],
      contextIds: [contextId],
      activeDocumentContextId: contextId,
      activeNotebookId: notebookId,
      activeSectionId: sectionId,
      activePageId: pageId,
      activeSheetId: sheetId,
      readerShare: 61,
      workspaceMode: "reader",
      noteZoom: 1.25,
      savedAt: 505,
    }],
    ["library:v5:workspace", { id: "workspace", title: "MedNote" }],
    [`library:v5:notebook:${notebookId}`, { id: notebookId, title: "V5 notebook", order: 0 }],
    [`library:v5:section:${sectionId}`, { id: sectionId, notebookId, title: "V5 section", order: 0 }],
    [`library:v5:page:${pageId}`, { id: pageId, sectionId, title: "V5 page", order: 0 }],
    [`library:v5:sheet:${sheetId}`, { id: sheetId, pageId, order: 0, content: { body: "from v5" } }],
    [`library:v5:document-context:${contextId}`, {
      id: contextId,
      kind: "document",
      name: contextId,
      documents: [{ id: documentId, name: "v5-workspace.pdf", size: 7, lastModified: 1, reader: { ...DEFAULT_READER } }],
      activeDocumentId: documentId,
      notebookIds: [notebookId],
      sourcePage: 1,
    }],
  ];
  for (const [key, value] of records) await writeRawRecord(key, value);
}

async function seed() {
  if (scenario === "v6") {
    await new IndexedDbNoteRepository().replaceLibrary(v6Library());
  }
  if (scenario === "v6-runtime") {
    await new IndexedDbNoteRepository().replaceLibrary(v6Library(["context-a", "context-b"]));
    localStorage.setItem("mednote-document-runtime-v1", JSON.stringify(snapshot([
      runtimeWorkspace("context-a", "runtime a"),
      runtimeWorkspace("context-b", "runtime b"),
    ], "context-b", { readerShare: 72, workspaceMode: "note", noteZoom: 1.6, savedAt: 777 })));
  }
  if (scenario === "v6-with-v5") {
    await new IndexedDbNoteRepository().replaceLibrary(v6Library());
    // Deliberately malformed: reading this as a v5 library would throw. A
    // verified v6 bootstrap must delete the namespace without hydrating it.
    await writeRawRecord("library:v5:meta", { version: 5, contextIds: null });
    await writeRawRecord("library:v5:orphan", { stale: true });
  }
  if (scenario === "v5-precedence") {
    await seedStoredV5Library();
    localStorage.setItem("mednote-library-v2", JSON.stringify(snapshot([runtimeWorkspace("v2-workspace", "from v2")], "v2-workspace", {
      readerShare: 30,
      workspaceMode: "note",
      noteZoom: .75,
      savedAt: 202,
    })));
  }
  if (scenario === "corrupt") {
    localStorage.setItem("mednote-library-v2", "{bad");
    localStorage.setItem("mednote-document-runtime-v1", "{bad");
    localStorage.setItem("mednote-notebook-v1", "{bad");
    localStorage.setItem("mednote-relations-v2", "{bad");
  }
  if (scenario === "legacy-notebook") {
    const page = createBlankPage();
    page.id = "legacy-sheet";
    page.title = "Legacy page";
    page.body = "legacy notebook body";
    // The v1 fixture predates FirstAidDocument. Do not let today's helper add
    // a structured empty document that could never exist in that legacy data.
    page.firstAid = undefined;
    localStorage.setItem("mednote-notebook-v1", JSON.stringify({ pages: [page], activeNoteId: page.id, readerShare: 43 }));
  }
  if (scenario === "legacy-pdf") {
    await writeRawRecord("current-pdf", {
      blob: new Blob(["legacy-one"], { type: "application/pdf" }),
      name: "Legacy Harrison.pdf",
    });
  }
  if (scenario === "temporary") {
    localStorage.setItem("mednote-document-runtime-v1", JSON.stringify(snapshot([
      runtimeWorkspace("temporary-workspace", "temporary", "temporary.pdf", "temporary"),
      runtimeWorkspace("persistent-workspace", "persistent"),
    ], "temporary-workspace", { readerShare: 58, workspaceMode: "reader", noteZoom: 1.2, savedAt: 909 })));
  }
}

await seed();
const { bootstrapMedNote } = await import("../app/app-bootstrap");
const { noteRepository, noteStore } = await import("../app/note-store");
const first = await bootstrapMedNote();

let pdf: { name?: string; text?: string; textAfterSecondBootstrap?: string } | undefined;
if (scenario === "legacy-pdf") {
  const documentId = first.workspaces[0]?.documents[0]?.id;
  const stored = documentId ? await localBinaryStorage.readPdf(documentId) : undefined;
  await writeRawRecord("current-pdf", {
    blob: new Blob(["legacy-two"], { type: "application/pdf" }),
    name: "Legacy Harrison.pdf",
  });
  await bootstrapMedNote();
  const afterSecond = documentId ? await localBinaryStorage.readPdf(documentId) : undefined;
  pdf = {
    name: stored?.name,
    text: await stored?.blob.text(),
    textAfterSecondBootstrap: await afterSecond?.blob.text(),
  };
}

const state = noteStore.getSnapshot();
const library = await noteRepository.loadLibrary();
const v5StoragePresent = scenario === "v6-with-v5"
  ? Boolean(await readRawRecord("library:v5:meta") || await readRawRecord("library:v5:orphan"))
  : undefined;
process.stdout.write(JSON.stringify({
  result: {
    workspaceIds: first.workspaces.map((workspace) => workspace.id),
    workspaceKinds: first.workspaces.map((workspace) => workspace.kind),
    documentNames: first.workspaces.flatMap((workspace) => workspace.documents.map((document) => document.name)),
    activeWorkspaceId: first.activeWorkspaceId,
    readerShare: first.readerShare,
    workspaceMode: first.workspaceMode,
    noteZoom: first.noteZoom,
    savedAt: first.savedAt,
    warnings: first.warnings || [],
  },
  activeBody: state.activeSheetContent?.body,
  notebookTitles: state.structure?.notebooks.map((notebook) => notebook.title) || [],
  libraryDocumentNames: library?.documents.documents.map((document) => document.name) || [],
  pdf,
  v5StoragePresent,
}));
