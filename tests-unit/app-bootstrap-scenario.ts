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
  if (scenario === "v5-precedence") {
    const { saveIncrementalLibrary } = await import("../app/incremental-library-store");
    await saveIncrementalLibrary(snapshot([runtimeWorkspace("v5-workspace", "from v5")], "v5-workspace", {
      readerShare: 61,
      workspaceMode: "reader",
      noteZoom: 1.25,
      savedAt: 505,
    }));
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
}));
