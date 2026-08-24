import { createDriveBackup, stageDriveBackup } from "./drive-backup";
import {
  downloadDriveFile,
  ensureDriveSharedFolder,
  getDriveUser,
  listDriveAppFiles,
  listDriveSharedFiles,
  requestDriveToken,
  resumeDriveToken,
  revokeDriveToken,
  upsertDriveFile,
  type DriveAppFile,
  type DriveSharedFiles,
  type DriveUser,
} from "./google-drive";
import { localBinaryStorage } from "./local-binary-storage";
import { noteStore, type NoteStore } from "./note-store";
import {
  NOTE_RUNTIME_WORKSPACE_ID,
  documentWorkspaceInput,
  normalizeWorkspace,
  workspacesFromLibraryV6,
  type PersistedLibrary,
  type WorkspaceItem,
  type WorkspaceMode,
} from "./document-runtime-adapter";
import { persistentDocumentWorkspaces } from "./document-runtime-storage";

export const DRIVE_MANIFEST_ID = "manifest:v2";
export const DRIVE_LEGACY_MANIFEST_ID = "manifest:v1";

export type DriveSyncSnapshot = {
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode: WorkspaceMode;
  noteZoom: number;
  savedAt: number;
};

export type DriveRestoreResult = {
  snapshot: DriveSyncSnapshot;
  missingFiles: number;
  sourceVersion: "v2" | "v1";
  remoteRevision: string;
};

export type DriveSyncResult = {
  snapshot: DriveSyncSnapshot;
  uploadedFiles: number;
  remoteRevision: string;
};

export type DriveRemoteInspection = {
  hasBackup: boolean;
  sourceVersion: "v2" | "v1" | null;
  storage: "shared" | "legacy-appdata" | null;
  remoteRevision: string | null;
};

export type DriveConnectionResult = {
  token: string;
  user: DriveUser;
  remote: DriveRemoteInspection;
};

export type DriveAccount = DriveUser;

type BinaryStorage = Pick<typeof localBinaryStorage, "savePdf" | "readPdf" | "deletePdf" | "saveAsset" | "readAsset" | "deleteAsset">;

export type DriveRemoteGateway = {
  requestToken: (clientId: string, clientSecret?: string) => Promise<string>;
  resumeToken: (clientId: string) => Promise<string | null>;
  revokeToken: (token: string) => void | Promise<void>;
  getUser: (token: string) => Promise<DriveUser>;
  listSharedFiles: (token: string) => Promise<DriveSharedFiles>;
  listLegacyAppDataFiles: (token: string) => Promise<DriveAppFile[]>;
  ensureSharedFolder: (token: string) => Promise<DriveAppFile>;
  downloadFile: (token: string, fileId: string) => Promise<Blob>;
  upsertFile: typeof upsertDriveFile;
};

export type DriveSyncServiceDependencies = {
  notes?: NoteStore;
  binaries?: BinaryStorage;
  remote?: DriveRemoteGateway;
  now?: () => number;
};

type IndexedRemote = {
  inspection: DriveRemoteInspection;
  manifest: DriveAppFile | null;
  filesByMednoteId: Map<string, DriveAppFile>;
};

type PendingSync = {
  token: string;
  snapshot: DriveSyncSnapshot;
  expectedRemoteRevision: string | null | undefined;
  waiters: {
    resolve: (result: DriveSyncResult) => void;
    reject: (error: unknown) => void;
  }[];
};

const defaultRemote: DriveRemoteGateway = {
  requestToken: requestDriveToken,
  resumeToken: resumeDriveToken,
  revokeToken: revokeDriveToken,
  getUser: getDriveUser,
  listSharedFiles: listDriveSharedFiles,
  listLegacyAppDataFiles: listDriveAppFiles,
  ensureSharedFolder: ensureDriveSharedFolder,
  downloadFile: downloadDriveFile,
  upsertFile: upsertDriveFile,
};

function modifiedAt(file: DriveAppFile) {
  const parsed = Date.parse(file.modifiedTime || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function remoteRevision(file: DriveAppFile | null | undefined) {
  if (!file) return null;
  return `${file.id}:${file.version || file.modifiedTime || "unknown"}`;
}

export class DriveSyncConflictError extends Error {
  constructor() {
    super("Bản lưu Google Drive đã thay đổi trên thiết bị khác. Hãy khôi phục bản Drive hoặc xác nhận ghi đè thủ công.");
    this.name = "DriveSyncConflictError";
  }
}

function indexFiles(files: DriveAppFile[]) {
  const index = new Map<string, DriveAppFile>();
  files.forEach((file) => {
    const mednoteId = file.properties?.mednoteId || file.appProperties?.mednoteId;
    if (!mednoteId) return;
    const existing = index.get(mednoteId);
    if (!existing || modifiedAt(file) > modifiedAt(existing) || (modifiedAt(file) === modifiedAt(existing) && file.id > existing.id)) {
      index.set(mednoteId, file);
    }
  });
  return index;
}

function assetIdsFromContents(contents: Record<string, unknown>) {
  const assetIds = new Set<string>();
  Object.values(contents).forEach((content) => {
    if (!content || typeof content !== "object") return;
    const excerpts = (content as { excerpts?: unknown }).excerpts;
    if (!Array.isArray(excerpts)) return;
    excerpts.forEach((excerpt) => {
      if (!excerpt || typeof excerpt !== "object") return;
      const record = excerpt as { kind?: unknown; assetId?: unknown };
      if (record.kind === "image" && typeof record.assetId === "string" && record.assetId) assetIds.add(record.assetId);
    });
  });
  return assetIds;
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : fallback));
}

function parseJsonBlob(blob: Blob, invalidMessage: string) {
  return blob.text().then((text) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(invalidMessage);
    }
  });
}

function restoreRuntime(library: Awaited<ReturnType<NoteStore["exportLibrary"]>>, preferredContextId: string | null | undefined) {
  const workspaces = workspacesFromLibraryV6(library);
  const activeWorkspaceId = preferredContextId && workspaces.some((workspace) => workspace.id === preferredContextId && workspace.documents.length > 0)
    ? preferredContextId
    : NOTE_RUNTIME_WORKSPACE_ID;
  return { workspaces, activeWorkspaceId };
}

export class DriveSyncService {
  private readonly notes: NoteStore;
  private readonly binaries: BinaryStorage;
  private readonly remote: DriveRemoteGateway;
  private readonly now: () => number;
  private activeMutation: "sync" | "restore" | null = null;
  private readonly observedRemoteRevisions = new Map<string, string | null>();
  private pendingSync: PendingSync | null = null;
  private syncDrain: Promise<void> | null = null;

  constructor(dependencies: DriveSyncServiceDependencies = {}) {
    this.notes = dependencies.notes || noteStore;
    this.binaries = dependencies.binaries || localBinaryStorage;
    this.remote = dependencies.remote || defaultRemote;
    this.now = dependencies.now || Date.now;
  }

  private async inspectIndexed(token: string): Promise<IndexedRemote> {
    const shared = await this.remote.listSharedFiles(token);
    // appDataFolder is import-only compatibility storage. A stale OAuth grant
    // or organization policy may deny it; that must not block login or the
    // canonical shared-folder backup.
    const legacyFiles = await this.remote.listLegacyAppDataFiles(token).catch(() => []);
    const sharedIndex = indexFiles(shared.files);
    const legacyIndex = indexFiles(legacyFiles);
    const candidates = [
      { version: "v2" as const, storage: "shared" as const, file: sharedIndex.get(DRIVE_MANIFEST_ID), index: sharedIndex },
      { version: "v2" as const, storage: "legacy-appdata" as const, file: legacyIndex.get(DRIVE_MANIFEST_ID), index: legacyIndex },
      { version: "v1" as const, storage: "shared" as const, file: sharedIndex.get(DRIVE_LEGACY_MANIFEST_ID), index: sharedIndex },
      { version: "v1" as const, storage: "legacy-appdata" as const, file: legacyIndex.get(DRIVE_LEGACY_MANIFEST_ID), index: legacyIndex },
    ];
    const selected = candidates.find((candidate) => Boolean(candidate.file));
    return selected ? {
      inspection: { hasBackup: true, sourceVersion: selected.version, storage: selected.storage, remoteRevision: remoteRevision(selected.file) },
      manifest: selected.file || null,
      filesByMednoteId: selected.index,
    } : {
      inspection: { hasBackup: false, sourceVersion: null, storage: null, remoteRevision: null },
      manifest: null,
      filesByMednoteId: sharedIndex,
    };
  }

  private rememberRemoteRevision(token: string, revision: string | null) {
    this.observedRemoteRevisions.set(token, revision);
  }

  private assertRemoteRevision(token: string, current: string | null, expected?: string | null) {
    const baseline = expected !== undefined
      ? expected
      : this.observedRemoteRevisions.has(token)
        ? this.observedRemoteRevisions.get(token)
        : current;
    if (baseline !== current) throw new DriveSyncConflictError();
    this.rememberRemoteRevision(token, current);
  }

  async connect(input: { clientId: string; clientSecret?: string }): Promise<DriveConnectionResult> {
    const clientId = input.clientId.trim();
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) throw new Error("OAuth Client ID không hợp lệ");
    const token = await this.remote.requestToken(clientId, input.clientSecret?.trim() || "");
    const [user, indexed] = await Promise.all([this.remote.getUser(token), this.inspectIndexed(token)]);
    this.rememberRemoteRevision(token, indexed.inspection.remoteRevision);
    return { token, user, remote: indexed.inspection };
  }

  async resume(input: { clientId: string }): Promise<DriveConnectionResult | null> {
    const clientId = input.clientId.trim();
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) return null;
    const token = await this.remote.resumeToken(clientId);
    if (!token) return null;
    const [user, indexed] = await Promise.all([this.remote.getUser(token), this.inspectIndexed(token)]);
    this.rememberRemoteRevision(token, indexed.inspection.remoteRevision);
    return { token, user, remote: indexed.inspection };
  }

  async disconnect(token: string | null | undefined) {
    if (token) await this.remote.revokeToken(token);
  }

  async inspectRemote(token: string): Promise<DriveRemoteInspection> {
    const inspection = (await this.inspectIndexed(token)).inspection;
    this.rememberRemoteRevision(token, inspection.remoteRevision);
    return inspection;
  }

  isBusy() {
    return this.activeMutation !== null || this.syncDrain !== null || this.pendingSync !== null;
  }

  private async mutate<T>(kind: "sync" | "restore", operation: () => Promise<T>) {
    if (this.activeMutation) throw new Error("Google Drive đang thực hiện một tác vụ khác");
    this.activeMutation = kind;
    try {
      return await operation();
    } finally {
      this.activeMutation = null;
    }
  }

  private async commitRestore(
    pdfs: { id: string; name: string; blob: Blob }[],
    assets: { id: string; blob: Blob }[],
    replaceNotes: () => Promise<void>,
  ) {
    const [previousLibrary, previousPdfs, previousAssets] = await Promise.all([
      this.notes.exportLibrary(),
      Promise.all(pdfs.map(async (pdf) => [pdf.id, await this.binaries.readPdf(pdf.id)] as const)),
      Promise.all(assets.map(async (asset) => [asset.id, await this.binaries.readAsset(asset.id)] as const)),
    ]);
    try {
      for (const pdf of pdfs) await this.binaries.savePdf(pdf.id, pdf.name, pdf.blob);
      for (const asset of assets) await this.binaries.saveAsset(asset.id, asset.blob);
      await replaceNotes();
    } catch (error) {
      await Promise.allSettled(previousPdfs.map(([id, stored]) => stored
        ? this.binaries.savePdf(id, stored.name, stored.blob)
        : this.binaries.deletePdf(id)));
      await Promise.allSettled(previousAssets.map(([id, blob]) => blob
        ? this.binaries.saveAsset(id, blob)
        : this.binaries.deleteAsset(id)));
      await this.notes.replaceFromLibrary(previousLibrary).catch(() => undefined);
      throw error;
    }
  }

  sync(
    token: string,
    snapshot: DriveSyncSnapshot,
    options: { expectedRemoteRevision?: string | null } = {},
  ): Promise<DriveSyncResult> {
    return new Promise((resolve, reject) => {
      if (this.pendingSync) {
        this.pendingSync.token = token;
        this.pendingSync.snapshot = snapshot;
        this.pendingSync.expectedRemoteRevision = options.expectedRemoteRevision;
        this.pendingSync.waiters.push({ resolve, reject });
      } else {
        this.pendingSync = {
          token,
          snapshot,
          expectedRemoteRevision: options.expectedRemoteRevision,
          waiters: [{ resolve, reject }],
        };
      }
      this.ensureSyncDrain();
    });
  }

  private ensureSyncDrain() {
    if (this.syncDrain) return;
    this.syncDrain = this.drainSyncQueue().finally(() => {
      this.syncDrain = null;
      // A caller resolved by the previous drain can immediately enqueue a new
      // snapshot before this finally callback runs. Do not strand that request.
      if (this.pendingSync) this.ensureSyncDrain();
    });
  }

  private async drainSyncQueue() {
    while (this.pendingSync) {
      const pending = this.pendingSync;
      this.pendingSync = null;
      try {
        const result = await this.performSync(pending.token, pending.snapshot, pending.expectedRemoteRevision);
        const nextPending = this.pendingSync as PendingSync | null;
        if (nextPending
          && nextPending.token === pending.token
          && nextPending.expectedRemoteRevision === pending.expectedRemoteRevision) {
          nextPending.expectedRemoteRevision = result.remoteRevision;
        }
        pending.waiters.forEach((waiter) => waiter.resolve(result));
      } catch (error) {
        pending.waiters.forEach((waiter) => waiter.reject(error));
      }
    }
  }

  private performSync(token: string, snapshot: DriveSyncSnapshot, expectedRemoteRevision?: string | null): Promise<DriveSyncResult> {
    return this.mutate("sync", async () => {
      const persistentWorkspaces = persistentDocumentWorkspaces(snapshot.workspaces);
      const documentWorkspaces = persistentWorkspaces.filter((workspace) => workspace.documents.length > 0);
      for (const workspace of documentWorkspaces) {
        await this.notes.saveDocumentWorkspace(documentWorkspaceInput(workspace, null, {
          workspaceMode: snapshot.workspaceMode,
          readerShare: snapshot.readerShare,
          noteZoom: snapshot.noteZoom,
        }));
      }
      const activeDocumentContextId = snapshot.activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID
        ? ""
        : documentWorkspaces.some((workspace) => workspace.id === snapshot.activeWorkspaceId)
          ? snapshot.activeWorkspaceId
          : "";
      await this.notes.setPreferences({
        activeDocumentContextId,
        readerShare: snapshot.readerShare,
        workspaceMode: snapshot.workspaceMode,
        noteZoom: snapshot.noteZoom,
      });
      const library = await this.notes.exportLibrary();
      const indexedAtStart = await this.inspectIndexed(token);
      this.assertRemoteRevision(token, indexedAtStart.inspection.remoteRevision, expectedRemoteRevision);
      const shared = await this.remote.listSharedFiles(token);
      const folder = shared.folder || await this.remote.ensureSharedFolder(token);
      const remoteByMednoteId = indexFiles(shared.files);
      let uploadedFiles = 0;

      for (const document of library.documents.documents) {
        const mednoteId = `pdf:${document.id}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const stored = await this.binaries.readPdf(document.id);
        if (!stored) continue;
        const uploaded = await this.remote.upsertFile(token, {
          name: `${document.id}__${document.name}`,
          mimeType: "application/pdf",
          mednoteId,
          blob: stored.blob,
          parentId: folder.id,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
        uploadedFiles += 1;
      }

      for (const assetId of assetIdsFromContents(library.sheetContents)) {
        const mednoteId = `asset:${assetId}`;
        if (remoteByMednoteId.has(mednoteId)) continue;
        const blob = await this.binaries.readAsset(assetId);
        if (!blob) continue;
        const uploaded = await this.remote.upsertFile(token, {
          name: `${assetId}.png`,
          mimeType: blob.type || "image/png",
          mednoteId,
          blob,
          parentId: folder.id,
        });
        remoteByMednoteId.set(mednoteId, uploaded);
        uploadedFiles += 1;
      }

      const backup = createDriveBackup(library);
      // Re-read the manifest after potentially slow binary uploads. This closes
      // the normal multi-device race window before replacing the canonical JSON.
      const indexedBeforeCommit = await this.inspectIndexed(token);
      this.assertRemoteRevision(token, indexedBeforeCommit.inspection.remoteRevision, expectedRemoteRevision);
      const existingManifest = indexedBeforeCommit.inspection.storage === "shared"
        ? indexedBeforeCommit.manifest
        : undefined;
      const uploadedManifest = await this.remote.upsertFile(token, {
        name: "MedNote Library v2.json",
        mimeType: "application/json",
        mednoteId: DRIVE_MANIFEST_ID,
        blob: new Blob([JSON.stringify(backup)], { type: "application/json" }),
        existingId: existingManifest?.id,
        parentId: folder.id,
      });
      const uploadedRevision = remoteRevision(uploadedManifest);
      if (!uploadedRevision) throw new Error("Google Drive không trả về revision của manifest");
      this.rememberRemoteRevision(token, uploadedRevision);
      uploadedFiles += 1;
      return {
        snapshot: { ...snapshot, savedAt: library.savedAt },
        uploadedFiles,
        remoteRevision: uploadedRevision,
      };
    });
  }

  restore(token: string): Promise<DriveRestoreResult> {
    return this.mutate("restore", async () => {
      const indexed = await this.inspectIndexed(token);
      if (!indexed.manifest || !indexed.inspection.sourceVersion) throw new Error("Google Drive chưa có bản lưu MedNote");
      const restoredRemoteRevision = indexed.inspection.remoteRevision;
      if (!restoredRemoteRevision) throw new Error("Google Drive không trả về revision của manifest");
      this.rememberRemoteRevision(token, restoredRemoteRevision);
      const manifestPayload = await parseJsonBlob(
        await this.remote.downloadFile(token, indexed.manifest.id),
        "Bản lưu Drive không hợp lệ",
      );
      if (indexed.inspection.sourceVersion === "v2") {
        const staged = await stageDriveBackup(manifestPayload);
        const pdfs: { id: string; name: string; blob: Blob }[] = [];
        const assets: { id: string; blob: Blob }[] = [];
        let missingFiles = 0;
        for (const document of staged.documents.documents) {
          const remote = indexed.filesByMednoteId.get(`pdf:${document.id}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          pdfs.push({ id: document.id, name: document.name, blob: await this.remote.downloadFile(token, remote.id) });
        }
        for (const assetId of assetIdsFromContents(staged.sheetContents)) {
          const remote = indexed.filesByMednoteId.get(`asset:${assetId}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          assets.push({ id: assetId, blob: await this.remote.downloadFile(token, remote.id) });
        }
        await this.commitRestore(pdfs, assets, () => this.notes.replaceFromLibrary(staged));
        const runtime = restoreRuntime(staged, staged.preferences.activeDocumentContextId);
        const restoredWorkspaceMode = runtime.activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID && staged.preferences.workspaceMode === "reader"
          ? "note"
          : staged.preferences.workspaceMode || "split";
        return {
          snapshot: {
            workspaces: runtime.workspaces,
            activeWorkspaceId: runtime.activeWorkspaceId,
            readerShare: clamp(staged.preferences.readerShare, 20, 80, 50),
            workspaceMode: restoredWorkspaceMode,
            noteZoom: clamp(staged.preferences.noteZoom || 1, .5, 2, 1),
            savedAt: staged.savedAt,
          },
          missingFiles,
          sourceVersion: "v2",
          remoteRevision: restoredRemoteRevision,
        };
      }

      // v1 remains import-only: restore never writes or mutates the legacy manifest.
      const parsed = manifestPayload as PersistedLibrary;
      if (!Array.isArray(parsed.workspaces) || !parsed.workspaces.length) throw new Error("Bản lưu Drive không hợp lệ");
      const normalized = parsed.workspaces.map(normalizeWorkspace);
      const pdfs: { id: string; name: string; blob: Blob }[] = [];
      const assets: { id: string; blob: Blob }[] = [];
      let missingFiles = 0;
      for (const workspace of normalized) {
        for (const document of workspace.documents) {
          const remote = indexed.filesByMednoteId.get(`pdf:${document.id}`);
          if (!remote) {
            missingFiles += 1;
            continue;
          }
          pdfs.push({ id: document.id, name: document.name, blob: await this.remote.downloadFile(token, remote.id) });
        }
      }
      const legacyContents = Object.fromEntries(normalized.flatMap((workspace) => workspace.notebooks.flatMap((notebook) => notebook.pages.map((page) => [page.id, page]))));
      for (const assetId of assetIdsFromContents(legacyContents)) {
        const remote = indexed.filesByMednoteId.get(`asset:${assetId}`);
        if (!remote) {
          missingFiles += 1;
          continue;
        }
        assets.push({ id: assetId, blob: await this.remote.downloadFile(token, remote.id) });
      }
      await this.commitRestore(pdfs, assets, () => this.notes.replaceFromLegacySnapshot(parsed));
      const importedLibrary = await this.notes.exportLibrary();
      const preferredDocumentContextId = persistentDocumentWorkspaces(normalized)
        .find((workspace) => workspace.id === parsed.activeWorkspaceId && workspace.documents.length > 0)?.id || null;
      const runtime = restoreRuntime(importedLibrary, preferredDocumentContextId);
      const savedAt = parsed.savedAt || (indexed.manifest.modifiedTime ? Date.parse(indexed.manifest.modifiedTime) : this.now());
      const requestedMode = parsed.workspaceMode === "reader" || parsed.workspaceMode === "note" ? parsed.workspaceMode : "split";
      return {
        snapshot: {
          workspaces: runtime.workspaces,
          activeWorkspaceId: runtime.activeWorkspaceId,
          readerShare: parsed.readerShare || 50,
          workspaceMode: runtime.activeWorkspaceId === NOTE_RUNTIME_WORKSPACE_ID && requestedMode === "reader" ? "note" : requestedMode,
          noteZoom: clamp(parsed.noteZoom || 1, .5, 2, 1),
          savedAt: Number.isFinite(savedAt) ? savedAt : this.now(),
        },
        missingFiles,
        sourceVersion: "v1",
        remoteRevision: restoredRemoteRevision,
      };
    });
  }
}

export const driveSyncService = new DriveSyncService();
