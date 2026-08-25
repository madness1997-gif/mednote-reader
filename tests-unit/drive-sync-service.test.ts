import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "fake-indexeddb/auto";

import { createDriveBackup, parseDriveBackup } from "../app/drive-backup";
import {
  DRIVE_LEGACY_MANIFEST_ID,
  DRIVE_MANIFEST_ID,
  DriveSyncService,
  type DriveRemoteGateway,
  type DriveSyncSnapshot,
} from "../app/drive-sync-service";
import type { DriveAppFile, DriveSharedFiles } from "../app/google-drive";
import { deleteNoteRepositoryDatabase, IndexedDbNoteRepository } from "../app/indexeddb-note-repository";
import { NoteStore } from "../app/note-store";
import { createBlankPage } from "../app/note-runtime-adapter";
import {
  DEFAULT_READER,
  NOTE_RUNTIME_WORKSPACE_ID,
  workspacesFromLibraryV6,
  type PersistedLibrary,
  type WorkspaceItem,
} from "../app/document-runtime-adapter";
import type { LibraryV6 } from "../app/note-repository";

type RemoteRecord = { file: DriveAppFile; blob: Blob };

class MemoryDrive implements DriveRemoteGateway {
  readonly shared = new Map<string, RemoteRecord>();
  readonly legacy = new Map<string, RemoteRecord>();
  readonly upserts: string[] = [];
  readonly revoked: string[] = [];
  sharedFolder: DriveAppFile | null = null;
  failMednoteId: string | null = null;
  private sequence = 0;

  requestToken = async (clientId: string) => `token:${clientId}`;
  resumeToken = async (clientId: string) => `resumed:${clientId}`;
  revokeToken = async (token: string) => { this.revoked.push(token); };
  getUser = async () => ({ displayName: "Bác sĩ", emailAddress: "doctor@example.com" });
  listSharedFiles = async (): Promise<DriveSharedFiles> => ({
    folder: this.sharedFolder,
    files: [...this.shared.values()].map((record) => structuredClone(record.file)),
  });
  listLegacyAppDataFiles = async () => [...this.legacy.values()].map((record) => structuredClone(record.file));
  ensureSharedFolder = async () => {
    this.sharedFolder ||= {
      id: "shared-folder",
      name: "MedNote Reader",
      mimeType: "application/vnd.google-apps.folder",
      modifiedTime: new Date(1).toISOString(),
      properties: { mednoteId: "root:shared:v1" },
    };
    return structuredClone(this.sharedFolder);
  };
  downloadFile = async (_token: string, fileId: string) => {
    const record = [...this.shared.values(), ...this.legacy.values()].find((candidate) => candidate.file.id === fileId);
    if (!record) throw new Error(`missing remote file ${fileId}`);
    return record.blob;
  };
  upsertFile: DriveRemoteGateway["upsertFile"] = async (_token, options) => {
    if (this.failMednoteId === options.mednoteId) throw new Error(`upload failed: ${options.mednoteId}`);
    this.upserts.push(options.mednoteId);
    const target = options.parentId ? this.shared : this.legacy;
    const existing = options.existingId
      ? [...target.entries()].find(([, record]) => record.file.id === options.existingId)
      : undefined;
    const revision = ++this.sequence;
    const id = existing?.[1].file.id || `remote-${revision}`;
    const file: DriveAppFile = {
      id,
      name: options.name,
      mimeType: options.mimeType,
      modifiedTime: new Date(10 + revision).toISOString(),
      version: String(revision),
      size: String(options.blob.size),
      ...(options.parentId
        ? { properties: { mednoteId: options.mednoteId } }
        : { appProperties: { mednoteId: options.mednoteId } }),
    };
    if (existing) target.delete(existing[0]);
    target.set(options.mednoteId, { file, blob: options.blob });
    return structuredClone(file);
  };

  add(space: "shared" | "legacy", mednoteId: string, blob: Blob, name = mednoteId) {
    if (space === "shared" && !this.sharedFolder) void this.ensureSharedFolder();
    const file: DriveAppFile = {
      id: `${space}-${++this.sequence}`,
      name,
      mimeType: blob.type || "application/octet-stream",
      modifiedTime: new Date(10 + this.sequence).toISOString(),
      size: String(blob.size),
      ...(space === "shared" ? { properties: { mednoteId } } : { appProperties: { mednoteId } }),
    };
    (space === "shared" ? this.shared : this.legacy).set(mednoteId, { file, blob });
    return file;
  }
}

function library(input: { body?: string; withAsset?: boolean; documentName?: string } = {}): LibraryV6 {
  const documentName = input.documentName || "Harrison.pdf";
  const excerpt = {
    id: "excerpt-source",
    kind: "image",
    assetId: input.withAsset === false ? undefined : "asset-figure",
    sourceKind: "pdf",
    documentId: "doc-harrison",
    documentName,
    page: 42,
  };
  return {
    version: 6,
    notes: {
      workspace: { id: "workspace", title: "MedNote" },
      notebooks: [{ id: "nb", title: "Nội tiết", order: 0 }],
      sections: [{ id: "sec", notebookId: "nb", title: "Đái tháo đường", order: 0 }],
      pages: [{ id: "page", sectionId: "sec", title: "SGLT2 và thận", order: 0 }],
      sheets: [{ id: "sheet", pageId: "page", order: 0 }],
      active: { activeNotebookId: "nb", activeSectionId: "sec", activePageId: "page", activeSheetId: "sheet" },
    },
    sheetContents: { sheet: { body: input.body || "eGFR slope", excerpts: [excerpt] } },
    documents: {
      documents: [{ id: "doc-harrison", name: documentName, size: 12, lastModified: 7, available: true, payload: { reader: { ...DEFAULT_READER, page: 42 } } }],
      contexts: [{ id: "ctx-harrison", kind: "document", name: "Harrison", documentIds: ["doc-harrison"], activeDocumentId: "doc-harrison", sourcePage: 42 }],
      groups: [],
      links: [{ id: "link-harrison", documentId: "doc-harrison", targetType: "page", targetId: "page" }],
      linkRelations: [{ id: "relation-harrison", linkIds: ["link-harrison"], kind: "workspace", sourceType: "document", sourceId: "doc-harrison", createdAt: 1, updatedAt: 1 }],
    },
    preferences: { activeDocumentContextId: "ctx-harrison", readerShare: 67, workspaceMode: "split", noteZoom: 1.35 },
    savedAt: 123,
  };
}

function legacySnapshot(): PersistedLibrary {
  const page = createBlankPage(42);
  page.id = "legacy-page";
  page.title = "Legacy title";
  page.body = "legacy body";
  page.excerpts = [{
    id: "legacy-image",
    kind: "image",
    assetId: "asset-legacy",
    sourceKind: "pdf",
    documentId: "doc-legacy",
    documentName: "Legacy.pdf",
    page: 5,
  }];
  const notebook = { id: "legacy-notebook", title: "Legacy notebook", pages: [page], activePageId: page.id, createdAt: 1 };
  const workspace: WorkspaceItem = {
    id: "legacy-workspace",
    kind: "document",
    name: "Legacy",
    documents: [{ id: "doc-legacy", name: "Legacy.pdf", size: 6, lastModified: 2, reader: { ...DEFAULT_READER, page: 5 } }],
    activeDocumentId: "doc-legacy",
    noteNotebookId: notebook.id,
    notebooks: [notebook],
    activeNotebookId: notebook.id,
    sourcePage: 5,
  };
  return { workspaces: [workspace], activeWorkspaceId: workspace.id, readerShare: 58, workspaceMode: "split", noteZoom: 1.2, savedAt: 456 };
}

async function harness(seed = library(), remote = new MemoryDrive()) {
  const dbName = `mednote-p6-${crypto.randomUUID()}`;
  const repository = new IndexedDbNoteRepository({ dbName });
  await repository.replaceLibrary(seed);
  const notes = new NoteStore(repository);
  await notes.initialize({ skipMigration: true });
  const pdfs = new Map<string, { blob: Blob; name: string }>();
  const assets = new Map<string, Blob>();
  const binaries = {
    savePdf: async (id: string, name: string, blob: Blob) => { pdfs.set(id, { name, blob }); },
    readPdf: async (id: string) => pdfs.get(id),
    deletePdf: async (id: string) => { pdfs.delete(id); },
    saveAsset: async (id: string, blob: Blob) => { assets.set(id, blob); },
    readAsset: async (id: string) => assets.get(id),
    deleteAsset: async (id: string) => { assets.delete(id); },
  };
  const service = new DriveSyncService({
    notes,
    remote,
    binaries,
    now: () => 999,
  });
  const workspaces = workspacesFromLibraryV6(seed);
  const snapshot: DriveSyncSnapshot = {
    workspaces,
    activeWorkspaceId: seed.preferences.activeDocumentContextId || workspaces[0]?.id || "",
    readerShare: seed.preferences.readerShare,
    workspaceMode: seed.preferences.workspaceMode || "split",
    noteZoom: seed.preferences.noteZoom || 1,
    savedAt: seed.savedAt,
  };
  return { repository, notes, service, remote, binaries, pdfs, assets, snapshot, close: () => deleteNoteRepositoryDatabase(dbName) };
}

test("empty remote syncs a canonical shared v2 bundle and excludes temporary workspaces", async () => {
  const context = await harness();
  try {
    context.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["pdf-body"], { type: "application/pdf" }) });
    context.assets.set("asset-figure", new Blob(["figure"], { type: "image/png" }));
    const temporary: WorkspaceItem = {
      ...context.snapshot.workspaces[0],
      id: "temporary-session",
      kind: "temporary",
      documents: [{ ...context.snapshot.workspaces[0].documents[0], id: "temp-doc-x" }],
      activeDocumentId: "temp-doc-x",
    };
    const result = await context.service.sync("token", {
      ...context.snapshot,
      workspaces: [temporary, ...context.snapshot.workspaces],
      activeWorkspaceId: temporary.id,
    });
    assert.ok(context.remote.sharedFolder);
    assert.deepEqual([...context.remote.shared.keys()].sort(), ["asset:asset-figure", DRIVE_MANIFEST_ID, "pdf:doc-harrison"].sort());
    assert.equal(context.remote.legacy.size, 0);
    assert.equal(result.uploadedFiles, 3);
    const manifest = context.remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    const restored = parseDriveBackup(JSON.parse(await manifest.blob.text()));
    assert.equal(restored.documents.contexts.some((record) => record.id.includes("temporary")), false);
    assert.equal(restored.documents.documents.some((record) => record.id.startsWith("temp-doc-")), false);
    assert.notEqual(restored.preferences.activeDocumentContextId, temporary.id);
  } finally { await context.close(); }
});

test("legacy appData inspection failure does not block canonical Drive login", async () => {
  const remote = new MemoryDrive();
  remote.listLegacyAppDataFiles = async () => { throw new Error("appDataFolder denied"); };
  const context = await harness(library(), remote);
  try {
    const connection = await context.service.connect({ clientId: "desktop.apps.googleusercontent.com" });
    assert.equal(connection.token, "token:desktop.apps.googleusercontent.com");
    assert.equal(connection.user.emailAddress, "doctor@example.com");
    assert.deepEqual(connection.remote, { hasBackup: false, sourceVersion: null, storage: null, remoteRevision: null });
  } finally { await context.close(); }
});

test("desktop Drive resumes a saved session without opening authorization again", async () => {
  const context = await harness();
  try {
    const connection = await context.service.resume({ clientId: "desktop.apps.googleusercontent.com" });
    assert.equal(connection?.token, "resumed:desktop.apps.googleusercontent.com");
    assert.equal(connection?.user.emailAddress, "doctor@example.com");
  } finally { await context.close(); }
});

test("shared v2 is interoperable between web and desktop services and preserves UI/source ownership", async () => {
  const remote = new MemoryDrive();
  const web = await harness(library({ body: "from web" }), remote);
  const desktop = await harness(library({ body: "old desktop", documentName: "Old.pdf" }), remote);
  try {
    web.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["shared-pdf"], { type: "application/pdf" }) });
    web.assets.set("asset-figure", new Blob(["shared-asset"], { type: "image/png" }));
    await web.service.sync("web-token", web.snapshot);
    const restored = await desktop.service.restore("desktop-token");
    assert.equal(restored.sourceVersion, "v2");
    assert.equal(restored.missingFiles, 0);
    assert.equal(restored.snapshot.readerShare, 67);
    assert.equal(restored.snapshot.workspaceMode, "split");
    assert.equal(restored.snapshot.noteZoom, 1.35);
    assert.equal(await desktop.pdfs.get("doc-harrison")?.blob.text(), "shared-pdf");
    assert.equal(await desktop.assets.get("asset-figure")?.text(), "shared-asset");
    const local = await desktop.repository.loadLibrary();
    assert.equal(local?.notes.pages[0].title, "SGLT2 và thận");
    assert.equal(local?.documents.documents[0].name, "Harrison.pdf");
    const excerpt = local?.sheetContents.sheet.excerpts?.[0] as { sourceKind?: string; documentId?: string; documentName?: string; page?: number };
    assert.deepEqual(excerpt, { ...excerpt, sourceKind: "pdf", documentId: "doc-harrison", documentName: "Harrison.pdf", page: 42 });
  } finally {
    await web.close();
    await desktop.close();
  }
});

test("v2 wins over v1 across storage locations", async () => {
  const remote = new MemoryDrive();
  const v2 = library({ body: "canonical v2" });
  remote.add("legacy", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(createDriveBackup(v2))], { type: "application/json" }));
  remote.add("legacy", "pdf:doc-harrison", new Blob(["legacy-appdata-pdf"], { type: "application/pdf" }));
  remote.add("legacy", "asset:asset-figure", new Blob(["legacy-appdata-asset"], { type: "image/png" }));
  remote.add("shared", DRIVE_LEGACY_MANIFEST_ID, new Blob([JSON.stringify(legacySnapshot())], { type: "application/json" }));
  const context = await harness(library({ body: "local" }), remote);
  try {
    const inspection = await context.service.inspectRemote("token");
    assert.deepEqual({ ...inspection, remoteRevision: Boolean(inspection.remoteRevision) }, {
      hasBackup: true,
      sourceVersion: "v2",
      storage: "legacy-appdata",
      remoteRevision: true,
    });
    const restored = await context.service.restore("token");
    assert.equal(restored.sourceVersion, "v2");
    assert.equal((await context.repository.loadSheetContent("sheet"))?.body, "canonical v2");
  } finally { await context.close(); }
});

test("v1 is import-only and the next sync creates shared v2 without mutating legacy", async () => {
  const remote = new MemoryDrive();
  const legacy = legacySnapshot();
  remote.add("legacy", DRIVE_LEGACY_MANIFEST_ID, new Blob([JSON.stringify(legacy)], { type: "application/json" }));
  remote.add("legacy", "pdf:doc-legacy", new Blob(["legacy-pdf"], { type: "application/pdf" }));
  remote.add("legacy", "asset:asset-legacy", new Blob(["legacy-asset"], { type: "image/png" }));
  const before = await remote.legacy.get(DRIVE_LEGACY_MANIFEST_ID)!.blob.text();
  const context = await harness(library({ body: "replace me" }), remote);
  try {
    const restored = await context.service.restore("token");
    assert.equal(restored.sourceVersion, "v1");
    assert.equal(restored.snapshot.activeWorkspaceId, "legacy-workspace");
    assert.equal(await context.pdfs.get("doc-legacy")?.blob.text(), "legacy-pdf");
    assert.equal(await context.assets.get("asset-legacy")?.text(), "legacy-asset");
    await context.service.sync("token", restored.snapshot);
    assert.ok(remote.shared.has(DRIVE_MANIFEST_ID));
    assert.equal(await remote.legacy.get(DRIVE_LEGACY_MANIFEST_ID)!.blob.text(), before);
  } finally { await context.close(); }
});

test("missing PDF and asset keep notes intact while incrementing missingFiles", async () => {
  const remote = new MemoryDrive();
  const source = library({ body: "keep note" });
  remote.add("shared", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(createDriveBackup(source))], { type: "application/json" }));
  const context = await harness(library({ body: "old note" }), remote);
  try {
    const restored = await context.service.restore("token");
    assert.equal(restored.missingFiles, 2);
    const local = await context.repository.loadLibrary();
    assert.equal(local?.sheetContents.sheet.body, "keep note");
    assert.equal((local?.sheetContents.sheet.excerpts?.[0] as { assetId?: string }).assetId, "asset-figure");
    assert.equal(context.pdfs.size, 0);
    assert.equal(context.assets.size, 0);
  } finally { await context.close(); }
});

test("corrupt v2 aborts before local cutover", async () => {
  const remote = new MemoryDrive();
  const source = library({ body: "remote" });
  const corrupted = createDriveBackup(source);
  corrupted.library.sheetContents.sheet = { body: "tampered after hash" };
  remote.add("shared", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(corrupted)], { type: "application/json" }));
  remote.add("shared", "pdf:doc-harrison", new Blob(["remote-pdf"], { type: "application/pdf" }));
  const context = await harness(library({ body: "local survives" }), remote);
  try {
    context.pdfs.set("doc-harrison", { name: "Local.pdf", blob: new Blob(["local-pdf"], { type: "application/pdf" }) });
    await assert.rejects(context.service.restore("token"), /Hash nội dung Sheet/);
    assert.equal((await context.repository.loadSheetContent("sheet"))?.body, "local survives");
    assert.equal(await context.pdfs.get("doc-harrison")?.blob.text(), "local-pdf");
  } finally { await context.close(); }
});

test("failed local cutover rolls binaries and NoteStore back together", async () => {
  const remote = new MemoryDrive();
  const source = library({ body: "remote replacement" });
  remote.add("shared", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(createDriveBackup(source))], { type: "application/json" }));
  remote.add("shared", "pdf:doc-harrison", new Blob(["new-pdf"], { type: "application/pdf" }));
  remote.add("shared", "asset:asset-figure", new Blob(["new-asset"], { type: "image/png" }));
  const context = await harness(library({ body: "local before cutover" }), remote);
  try {
    context.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["old-pdf"], { type: "application/pdf" }) });
    context.assets.set("asset-figure", new Blob(["old-asset"], { type: "image/png" }));
    const saveAsset = context.binaries.saveAsset;
    let failed = false;
    context.binaries.saveAsset = async (id, blob) => {
      if (!failed) {
        failed = true;
        throw new Error("local asset write failed");
      }
      await saveAsset(id, blob);
    };
    await assert.rejects(context.service.restore("token"), /local asset write failed/);
    assert.equal((await context.repository.loadSheetContent("sheet"))?.body, "local before cutover");
    assert.equal(await context.pdfs.get("doc-harrison")?.blob.text(), "old-pdf");
    assert.equal(await context.assets.get("asset-figure")?.text(), "old-asset");
  } finally { await context.close(); }
});

test("sync skips existing binaries and failed upload never rolls back local data", async () => {
  const remote = new MemoryDrive();
  remote.add("shared", "pdf:doc-harrison", new Blob(["already remote"], { type: "application/pdf" }));
  remote.failMednoteId = DRIVE_MANIFEST_ID;
  const context = await harness(library({ body: "local remains" }), remote);
  try {
    context.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["local-pdf"], { type: "application/pdf" }) });
    context.assets.set("asset-figure", new Blob(["new asset"], { type: "image/png" }));
    await assert.rejects(context.service.sync("token", context.snapshot), /upload failed/);
    assert.equal(remote.upserts.includes("pdf:doc-harrison"), false);
    assert.equal(remote.upserts.includes("asset:asset-figure"), true);
    assert.equal((await context.repository.loadSheetContent("sheet"))?.body, "local remains");
    assert.equal(await context.pdfs.get("doc-harrison")?.blob.text(), "local-pdf");
  } finally { await context.close(); }
});

test("concurrent auto-sync requests coalesce to one trailing upload with the latest snapshot", async () => {
  const remote = new MemoryDrive();
  const context = await harness(library({ body: "queued autosync", withAsset: false }), remote);
  let manifestWrites = 0;
  let releaseFirstManifest!: () => void;
  let markFirstManifestStarted!: () => void;
  const firstManifestStarted = new Promise<void>((resolve) => { markFirstManifestStarted = resolve; });
  const firstManifestGate = new Promise<void>((resolve) => { releaseFirstManifest = resolve; });
  const upsert = remote.upsertFile;
  remote.upsertFile = async (token, options) => {
    if (options.mednoteId === DRIVE_MANIFEST_ID) {
      manifestWrites += 1;
      if (manifestWrites === 1) {
        markFirstManifestStarted();
        await firstManifestGate;
      }
    }
    return upsert(token, options);
  };
  try {
    const first = context.service.sync("token", { ...context.snapshot, readerShare: 40 });
    await firstManifestStarted;
    const second = context.service.sync("token", { ...context.snapshot, readerShare: 46 });
    const latest = context.service.sync("token", { ...context.snapshot, readerShare: 52 });
    assert.equal(context.service.isBusy(), true);
    releaseFirstManifest();
    await Promise.all([first, second, latest]);
    assert.equal(manifestWrites, 2);
    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    assert.equal(parseDriveBackup(JSON.parse(await manifest.blob.text())).preferences.readerShare, 52);
  } finally { await context.close(); }
});

test("stress: 128 overlapping auto-sync requests collapse to one latest trailing commit", { timeout: 15_000 }, async () => {
  const remote = new MemoryDrive();
  const context = await harness(library({ body: "sync stress", withAsset: false }), remote);
  let manifestWrites = 0;
  let releaseFirstManifest!: () => void;
  let markFirstManifestStarted!: () => void;
  const firstManifestStarted = new Promise<void>((resolve) => { markFirstManifestStarted = resolve; });
  const firstManifestGate = new Promise<void>((resolve) => { releaseFirstManifest = resolve; });
  const upsert = remote.upsertFile;
  remote.upsertFile = async (token, options) => {
    if (options.mednoteId === DRIVE_MANIFEST_ID) {
      manifestWrites += 1;
      if (manifestWrites === 1) {
        markFirstManifestStarted();
        await firstManifestGate;
      }
    }
    return upsert(token, options);
  };
  try {
    const first = context.service.sync("stress-token", { ...context.snapshot, readerShare: 21 });
    await firstManifestStarted;
    const queued = Array.from({ length: 128 }, (_, index) => context.service.sync("stress-token", {
      ...context.snapshot,
      readerShare: index === 127 ? 79 : 20 + (index % 59),
      noteZoom: 1 + index / 1_000,
    }));
    assert.equal(context.service.isBusy(), true);
    releaseFirstManifest();
    const [firstResult, ...queuedResults] = await Promise.all([first, ...queued]);

    assert.equal(firstResult.snapshot.readerShare, 21);
    assert.equal(manifestWrites, 2);
    assert.ok(queuedResults.every((result) => result.snapshot.readerShare === 79));
    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    const backup = parseDriveBackup(JSON.parse(await manifest.blob.text()));
    assert.equal(backup.preferences.readerShare, 79);
    assert.equal(backup.preferences.noteZoom, 1.127);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(context.service.isBusy(), false);
  } finally { await context.close(); }
});

test("stress: an overlapping second-device commit invalidates a slow stale sync", { timeout: 15_000 }, async () => {
  const remote = new MemoryDrive();
  remote.add("shared", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(createDriveBackup(library({ body: "shared base", withAsset: false })))], { type: "application/json" }));
  const slowDevice = await harness(library({ body: "slow stale device", withAsset: false }), remote);
  const fastDevice = await harness(library({ body: "fresh overlapping device", withAsset: false }), remote);
  try {
    const slowConnection = await slowDevice.service.connect({ clientId: "slow.apps.googleusercontent.com" });
    const fastConnection = await fastDevice.service.connect({ clientId: "fast.apps.googleusercontent.com" });
    slowDevice.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["slow-device-pdf"], { type: "application/pdf" }) });

    let releaseSlowUpload!: () => void;
    let markSlowUploadStarted!: () => void;
    const slowUploadStarted = new Promise<void>((resolve) => { markSlowUploadStarted = resolve; });
    const slowUploadGate = new Promise<void>((resolve) => { releaseSlowUpload = resolve; });
    const upsert = remote.upsertFile;
    let blocked = false;
    remote.upsertFile = async (token, options) => {
      if (!blocked && token === slowConnection.token && options.mednoteId === "pdf:doc-harrison") {
        blocked = true;
        markSlowUploadStarted();
        await slowUploadGate;
      }
      return upsert(token, options);
    };

    const staleSync = slowDevice.service.sync(slowConnection.token, slowDevice.snapshot);
    const staleRejected = assert.rejects(staleSync, /đã thay đổi trên thiết bị khác/);
    await slowUploadStarted;
    await fastDevice.service.sync(fastConnection.token, fastDevice.snapshot);
    releaseSlowUpload();
    await staleRejected;

    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    assert.equal(parseDriveBackup(JSON.parse(await manifest.blob.text())).sheetContents.sheet.body, "fresh overlapping device");
    assert.equal(remote.upserts.filter((id) => id === DRIVE_MANIFEST_ID).length, 1);
  } finally {
    await slowDevice.close();
    await fastDevice.close();
  }
});

test("a second connected device cannot silently overwrite a newer remote manifest", async () => {
  const remote = new MemoryDrive();
  remote.add("shared", DRIVE_MANIFEST_ID, new Blob([JSON.stringify(createDriveBackup(library({ body: "common base", withAsset: false })))], { type: "application/json" }));
  const firstDevice = await harness(library({ body: "device one", withAsset: false }), remote);
  const secondDevice = await harness(library({ body: "device two", withAsset: false }), remote);
  try {
    const firstConnection = await firstDevice.service.connect({ clientId: "first.apps.googleusercontent.com" });
    const secondConnection = await secondDevice.service.connect({ clientId: "second.apps.googleusercontent.com" });
    assert.equal(firstConnection.remote.remoteRevision, secondConnection.remote.remoteRevision);
    await firstDevice.service.sync(firstConnection.token, firstDevice.snapshot);
    await assert.rejects(
      secondDevice.service.sync(secondConnection.token, secondDevice.snapshot),
      /đã thay đổi trên thiết bị khác/,
    );
    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    assert.equal(parseDriveBackup(JSON.parse(await manifest.blob.text())).sheetContents.sheet.body, "device one");
  } finally {
    await firstDevice.close();
    await secondDevice.close();
  }
});

test("disconnect revokes OAuth without deleting local data", async () => {
  const context = await harness();
  try {
    context.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["local"]) });
    await context.service.disconnect("token-1");
    assert.deepEqual(context.remote.revoked, ["token-1"]);
    assert.equal(await context.pdfs.get("doc-harrison")?.blob.text(), "local");
    assert.equal((await context.repository.loadSheetContent("sheet"))?.body, "eGFR slope");
  } finally { await context.close(); }
});

test("page delegates Drive algorithms and web/desktop request the same cross-platform scopes", async () => {
  const [page, service, browserDrive, desktopMain] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/drive-sync-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/google-drive.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /driveSyncService\.connect/);
  assert.match(page, /driveSyncService\.sync/);
  assert.match(page, /driveSyncService\.restore/);
  assert.match(page, /driveSyncService\.disconnect/);
  for (const forbidden of ["listDriveAppFiles", "downloadDriveFile", "upsertDriveFile", "createDriveBackup", "stageDriveBackup", "requestDriveToken", "getDriveUser", "revokeDriveToken"]) {
    assert.equal(page.includes(forbidden), false, `page.tsx still knows ${forbidden}`);
    assert.equal(service.includes(forbidden), true, `DriveSyncService must own ${forbidden}`);
  }
  for (const scope of ["https://www.googleapis.com/auth/drive.appdata", "https://www.googleapis.com/auth/drive"]) {
    assert.equal(browserDrive.includes(scope), true);
    assert.equal(desktopMain.includes(scope), true);
  }
  assert.match(desktopMain, /credential\.driveScope === DRIVE_SCOPE/);
  assert.match(browserDrive, /MEDNOTE_SHARED_ROOT_ID/);
  assert.match(browserDrive, /properties:\s*\{\s*mednoteId/);
  assert.match(service, /sourceVersion:\s*"v2"/);
  assert.match(service, /sourceVersion:\s*"v1"/);
});


test("P6.5 preserves five notebooks and canonical hashes across web to desktop v2 restore", async () => {
  const seed = library({ body: "seed" });
  seed.notes.notebooks = Array.from({ length: 5 }, (_, index) => ({ id: `nb-${index + 1}`, title: `Notebook ${index + 1}`, order: index }));
  seed.notes.sections = seed.notes.notebooks.map((notebook, index) => ({ id: `sec-${index + 1}`, notebookId: notebook.id, title: `Section ${index + 1}`, order: 0 }));
  seed.notes.pages = seed.notes.sections.map((section, index) => ({ id: `page-${index + 1}`, sectionId: section.id, title: `Page ${index + 1}`, order: 0 }));
  seed.notes.sheets = seed.notes.pages.map((page, index) => ({ id: `sheet-${index + 1}`, pageId: page.id, order: 0 }));
  seed.notes.active = { activeNotebookId: "nb-5", activeSectionId: "sec-5", activePageId: "page-5", activeSheetId: "sheet-5" };
  seed.sheetContents = Object.fromEntries(seed.notes.sheets.map((sheet, index) => [sheet.id, { body: `content-${index + 1}` }]));
  seed.documents.documents = [
    { id: "doc-one", name: "One.pdf", size: 3, lastModified: 1, available: true, payload: { reader: { ...DEFAULT_READER, page: 11 } } },
    { id: "doc-two", name: "Two.pdf", size: 3, lastModified: 2, available: true, payload: { reader: { ...DEFAULT_READER, page: 22 } } },
  ];
  seed.documents.contexts = [
    { id: "ctx-one", kind: "document", name: "One", documentIds: ["doc-one"], activeDocumentId: "doc-one", sourcePage: 11 },
    { id: "ctx-two", kind: "document", name: "Two", documentIds: ["doc-two"], activeDocumentId: "doc-two", sourcePage: 22 },
  ];
  seed.documents.groups = [];
  seed.documents.links = [
    { id: "link-one", documentId: "doc-one", targetType: "page", targetId: "page-1" },
    { id: "link-two", documentId: "doc-two", targetType: "sheet", targetId: "sheet-2" },
  ];
  seed.documents.linkRelations = [
    { id: "relation-one", linkIds: ["link-one"], kind: "workspace", sourceType: "document", sourceId: "doc-one", createdAt: 1, updatedAt: 1 },
    { id: "relation-two", linkIds: ["link-two"], kind: "workspace", sourceType: "document", sourceId: "doc-two", createdAt: 1, updatedAt: 1 },
  ];
  seed.preferences.activeDocumentContextId = "ctx-one";

  const expected = createDriveBackup(seed);
  const remote = new MemoryDrive();
  const web = await harness(seed, remote);
  const desktop = await harness(library({ body: "old desktop" }), remote);
  try {
    web.pdfs.set("doc-one", { name: "One.pdf", blob: new Blob(["one"], { type: "application/pdf" }) });
    web.pdfs.set("doc-two", { name: "Two.pdf", blob: new Blob(["two"], { type: "application/pdf" }) });
    await web.service.sync("web-token", web.snapshot);
    const restored = await desktop.service.restore("desktop-token");
    const actual = await desktop.notes.exportLibrary();
    const actualBackup = createDriveBackup(actual);
    assert.equal(restored.sourceVersion, "v2");
    assert.equal(actual.notes.notebooks.length, 5);
    assert.deepEqual(actual.notes.notebooks.map((item) => item.id).sort(), seed.notes.notebooks.map((item) => item.id).sort());
    assert.deepEqual(actual.documents.documents.map((item) => item.id).sort(), ["doc-one", "doc-two"]);
    assert.deepEqual(actual.documents.links.map((item) => item.id).sort(), ["link-one", "link-two"]);
    assert.deepEqual(actualBackup.sheetContentHashes, expected.sheetContentHashes);
    assert.equal(restored.snapshot.workspaces.filter((workspace) => workspace.id === "note-runtime-v6").length, 1);
  } finally {
    await web.close();
    await desktop.close();
  }
});

test("Drive v2 preserves the note runtime as active even when documents exist", async () => {
  const remote = new MemoryDrive();
  const web = await harness(library({ body: "note runtime", withAsset: false }), remote);
  const desktop = await harness(library({ body: "old desktop", withAsset: false, documentName: "Old.pdf" }), remote);
  try {
    web.pdfs.set("doc-harrison", { name: "Harrison.pdf", blob: new Blob(["shared-pdf"], { type: "application/pdf" }) });
    await web.service.sync("web-token", {
      ...web.snapshot,
      activeWorkspaceId: NOTE_RUNTIME_WORKSPACE_ID,
      workspaceMode: "note",
    });
    const manifest = remote.shared.get(DRIVE_MANIFEST_ID);
    assert.ok(manifest);
    const canonical = parseDriveBackup(JSON.parse(await manifest.blob.text()));
    assert.equal(canonical.preferences.activeDocumentContextId, "");

    const restored = await desktop.service.restore("desktop-token");
    assert.equal(restored.snapshot.activeWorkspaceId, NOTE_RUNTIME_WORKSPACE_ID);
    assert.equal(restored.snapshot.workspaceMode, "note");
    const local = await desktop.repository.loadLibrary();
    assert.equal(local?.notes.notebooks.length, 1);
    assert.equal(local?.documents.contexts.length, 1);
    assert.equal(local?.documents.links.length, 1);
  } finally {
    await web.close();
    await desktop.close();
  }
});

test("Drive auto-sync watches canonical NoteStore content and hierarchy changes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(
    page,
    /\[activeWorkspaceId, driveAutoSync, driveReady, driveToken, noteZoom, readerShare, ready, workspaceMode, workspaces, noteState\.activeSheetContent, noteState\.structure\]/,
  );
});
