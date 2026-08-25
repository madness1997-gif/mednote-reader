"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  DriveSyncConflictError,
  driveSyncService,
  type DriveAccount,
  type DriveRestoreResult,
  type DriveSyncSnapshot,
} from "./drive-sync-service";
import { cancelDriveAuthorization, prepareDriveAuthorization } from "./google-drive";
import type { WorkspaceItem, WorkspaceMode } from "./document-runtime-adapter";

const GOOGLE_CLIENT_ID = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const DESKTOP_GOOGLE_CLIENT_ID_KEY = "mednote-google-desktop-client-id";
const DRIVE_REMOTE_REVISION_KEY_PREFIX = "mednote-drive-remote-revision-v1:";
const IS_DESKTOP_APP = typeof window !== "undefined" && Boolean(window.mednoteDesktop?.isDesktop);

export type DriveStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

type DriveControllerIntegration = {
  ready: boolean;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string;
  readerShare: number;
  workspaceMode: WorkspaceMode;
  noteZoom: number;
  activeSheetContent: unknown;
  noteStructure: unknown;
  createSnapshot: () => DriveSyncSnapshot;
  applyRestore: (result: DriveRestoreResult) => void;
  hasMeaningfulLocalData: () => boolean;
  onSnapshotSaved: (savedAt: number) => void;
  notify: (message: string) => void;
};

export type DriveController = {
  isDesktopApp: boolean;
  panelOpen: boolean;
  desktopClientId: string;
  desktopClientSecret: string;
  token: string | null;
  user: DriveAccount | null;
  status: DriveStatus;
  ready: boolean;
  autoSync: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  authorizationReady: boolean;
  preparingAuthorization: boolean;
  togglePanel: () => void;
  closePanel: () => void;
  setDesktopClientId: (value: string) => void;
  setDesktopClientSecret: (value: string) => void;
  setAutoSync: (enabled: boolean) => void;
  importDesktopOAuth: (file?: File) => Promise<void>;
  retryAuthorizationPreparation: () => Promise<void>;
  connect: () => Promise<void>;
  cancelConnection: () => Promise<void>;
  disconnect: () => void;
  changeClient: () => void;
  sync: () => Promise<boolean>;
  restore: () => Promise<boolean>;
};

function storedDriveRevision(emailAddress: string) {
  try { return localStorage.getItem(`${DRIVE_REMOTE_REVISION_KEY_PREFIX}${emailAddress.trim().toLowerCase()}`); } catch { return null; }
}

function persistDriveRevision(emailAddress: string, revision: string) {
  try { localStorage.setItem(`${DRIVE_REMOTE_REVISION_KEY_PREFIX}${emailAddress.trim().toLowerCase()}`, revision); } catch { /* revision persistence is best effort */ }
}

export function parseDesktopOAuthConfig(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("Tệp không chứa cấu hình OAuth Desktop (installed).");
  const record = payload as { installed?: { client_id?: unknown; client_secret?: unknown }; web?: unknown };
  if (!record.installed) {
    throw new Error(record.web
      ? "Đây là OAuth Web application. Hãy tải JSON của OAuth Client loại Desktop app."
      : "Tệp không chứa cấu hình OAuth Desktop (installed).");
  }
  const clientId = typeof record.installed.client_id === "string" ? record.installed.client_id.trim() : "";
  const clientSecret = typeof record.installed.client_secret === "string" ? record.installed.client_secret.trim() : "";
  if (!clientId.endsWith(".apps.googleusercontent.com")) throw new Error("OAuth Client ID trong tệp không hợp lệ.");
  return { clientId, clientSecret };
}

export function useDriveController(integration: DriveControllerIntegration): DriveController {
  const integrationRef = useRef(integration);
  integrationRef.current = integration;
  const [panelOpen, setPanelOpen] = useState(false);
  const [desktopClientId, setDesktopClientIdState] = useState(() => {
    if (!IS_DESKTOP_APP) return "";
    try { return localStorage.getItem(DESKTOP_GOOGLE_CLIENT_ID_KEY)?.trim() ?? ""; } catch { return ""; }
  });
  const [desktopClientSecret, setDesktopClientSecretState] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DriveAccount | null>(null);
  const [status, setStatus] = useState<DriveStatus>("disconnected");
  const [ready, setReady] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorizationReady, setAuthorizationReady] = useState(IS_DESKTOP_APP);
  const [preparingAuthorization, setPreparingAuthorization] = useState(!IS_DESKTOP_APP);
  const desktopResumeClientRef = useRef<string | null>(null);
  const remoteRevisionRef = useRef<string | null>(null);
  const userRef = useRef<DriveAccount | null>(null);

  const notify = useCallback((message: string) => integrationRef.current.notify(message), []);

  const prepareAuthorization = useCallback(async (announceError = false) => {
    if (IS_DESKTOP_APP) {
      setAuthorizationReady(true);
      setPreparingAuthorization(false);
      return true;
    }
    setPreparingAuthorization(true);
    try {
      await prepareDriveAuthorization();
      setAuthorizationReady(true);
      setError(null);
      setStatus((current) => current === "error" ? "disconnected" : current);
      return true;
    } catch (preparationError) {
      const message = preparationError instanceof Error ? preparationError.message : "Không tải được dịch vụ đăng nhập Google";
      setAuthorizationReady(false);
      setError(message);
      setStatus("error");
      if (announceError) notify(`Lỗi Drive: ${message}`);
      return false;
    } finally {
      setPreparingAuthorization(false);
    }
  }, [notify]);

  const recordRevision = useCallback((revision: string) => {
    remoteRevisionRef.current = revision;
    const account = userRef.current;
    if (account) persistDriveRevision(account.emailAddress, revision);
  }, []);

  const syncToDrive = useCallback(async (nextToken = token, silent = false) => {
    if (!nextToken) return false;
    setStatus("syncing");
    setError(null);
    if (!silent) notify("Đang lưu toàn bộ dữ liệu lên Google Drive…");
    try {
      let expectedRemoteRevision = remoteRevisionRef.current;
      if (!silent) {
        const inspection = await driveSyncService.inspectRemote(nextToken);
        if (inspection.remoteRevision !== remoteRevisionRef.current
          && !window.confirm("Bản lưu Drive đã thay đổi kể từ lần đồng bộ gần nhất. Lưu bản trên thiết bị này sẽ ghi đè thay đổi đó. Tiếp tục?")) {
          setStatus("connected");
          notify("Đã giữ nguyên bản lưu hiện có trên Google Drive");
          return false;
        }
        expectedRemoteRevision = inspection.remoteRevision;
      }
      const result = await driveSyncService.sync(nextToken, integrationRef.current.createSnapshot(), { expectedRemoteRevision });
      integrationRef.current.onSnapshotSaved(result.snapshot.savedAt);
      recordRevision(result.remoteRevision);
      setReady(true);
      setLastSyncedAt(result.snapshot.savedAt);
      setStatus("connected");
      if (!silent) notify("Đã đồng bộ đầy đủ lên Google Drive");
      return true;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Không thể đồng bộ Google Drive";
      if (syncError instanceof DriveSyncConflictError) setReady(false);
      setError(message);
      setStatus("error");
      notify(`Lỗi Drive: ${message}`);
      return false;
    }
  }, [notify, recordRevision, token]);

  const restoreFromDrive = useCallback(async (nextToken = token, askBeforeReplace = true) => {
    if (!nextToken || driveSyncService.isBusy()) return false;
    if (askBeforeReplace && integrationRef.current.hasMeaningfulLocalData()
      && !window.confirm("Tải dữ liệu từ Google Drive sẽ thay thế workspace đang có trên thiết bị này. Tiếp tục?")) return false;
    setStatus("syncing");
    setError(null);
    notify("Đang tải dữ liệu từ Google Drive…");
    try {
      const result = await driveSyncService.restore(nextToken);
      integrationRef.current.applyRestore(result);
      integrationRef.current.onSnapshotSaved(result.snapshot.savedAt);
      recordRevision(result.remoteRevision);
      setReady(true);
      setLastSyncedAt(result.snapshot.savedAt);
      setStatus("connected");
      const source = result.sourceVersion === "v2" ? "thư viện v2" : "bản lưu v1";
      notify(result.missingFiles
        ? `Đã khôi phục ${source}; thiếu ${result.missingFiles} tệp trên Drive`
        : `Đã khôi phục đầy đủ ${source} từ Google Drive`);
      return true;
    } catch (restoreError) {
      const message = restoreError instanceof Error ? restoreError.message : "Không thể tải dữ liệu từ Google Drive";
      setError(message);
      setStatus("error");
      notify(`Lỗi Drive: ${message}`);
      return false;
    }
  }, [notify, recordRevision, token]);

  const resumeDesktopDrive = useCallback(async (announce = false) => {
    const clientId = desktopClientId.trim();
    if (!IS_DESKTOP_APP || !clientId.endsWith(".apps.googleusercontent.com") || driveSyncService.isBusy()) return false;
    setStatus("connecting");
    setError(null);
    try {
      const connection = await driveSyncService.resume({ clientId });
      if (!connection) {
        setStatus("disconnected");
        return false;
      }
      const storedRevision = storedDriveRevision(connection.user.emailAddress);
      userRef.current = connection.user;
      remoteRevisionRef.current = storedRevision;
      setToken(connection.token);
      setUser(connection.user);
      const revisionMatches = storedRevision === connection.remote.remoteRevision
        && (storedRevision !== null || !connection.remote.hasBackup);
      setReady(revisionMatches);
      setStatus("connected");
      if (!revisionMatches) {
        notify("Drive đã thay đổi hoặc chưa có mốc đồng bộ — chọn tải lên hoặc khôi phục trước khi bật tự động đồng bộ");
      } else if (announce) notify("Đã khôi phục kết nối Google Drive");
      return true;
    } catch (resumeError) {
      const message = resumeError instanceof Error ? resumeError.message : "Không thể duy trì kết nối Google Drive";
      setError(message);
      setStatus("error");
      if (announce) notify(`Lỗi Drive: ${message}`);
      return false;
    }
  }, [desktopClientId, notify]);

  const connect = useCallback(async () => {
    setPanelOpen(true);
    if (!IS_DESKTOP_APP && !authorizationReady) {
      const message = preparingAuthorization
        ? "Dịch vụ đăng nhập Google đang được tải. Hãy chờ vài giây rồi thử lại."
        : "Dịch vụ đăng nhập Google chưa sẵn sàng. Hãy tải lại đăng nhập rồi thử lại.";
      setStatus("error");
      setError(message);
      notify(message);
      return;
    }
    const clientId = IS_DESKTOP_APP ? desktopClientId.trim() : GOOGLE_CLIENT_ID;
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
      setStatus("error");
      setError(IS_DESKTOP_APP ? "Nhập OAuth Client ID loại Desktop app để kết nối Drive" : "Bản triển khai chưa có Google Client ID");
      notify("Cần cấu hình Google Client ID để bật Drive");
      return;
    }
    if (IS_DESKTOP_APP) {
      try { localStorage.setItem(DESKTOP_GOOGLE_CLIENT_ID_KEY, clientId); } catch { /* keep the public client ID in memory */ }
      desktopResumeClientRef.current = clientId;
    }
    setStatus("connecting");
    setError(null);
    try {
      const connection = await driveSyncService.connect({
        clientId,
        clientSecret: IS_DESKTOP_APP ? desktopClientSecret.trim() : "",
      });
      if (IS_DESKTOP_APP) setDesktopClientSecretState("");
      userRef.current = connection.user;
      remoteRevisionRef.current = storedDriveRevision(connection.user.emailAddress);
      setToken(connection.token);
      setUser(connection.user);
      setStatus("connected");
      if (connection.remote.hasBackup && !integrationRef.current.hasMeaningfulLocalData()) {
        await restoreFromDrive(connection.token, false);
      } else if (!connection.remote.hasBackup) {
        await syncToDrive(connection.token);
      } else {
        setReady(false);
        notify("Drive đã có dữ liệu — chọn tải lên hoặc khôi phục");
      }
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : "Không thể kết nối Google Drive";
      if (message === "Đã hủy kết nối Google Drive") {
        setStatus("disconnected");
        setError(null);
        notify(message);
        return;
      }
      setError(message);
      setStatus("error");
      notify(`Không thể kết nối Drive: ${message}`);
    }
  }, [authorizationReady, desktopClientId, desktopClientSecret, notify, preparingAuthorization, restoreFromDrive, syncToDrive]);

  const cancelConnection = useCallback(async () => {
    if (IS_DESKTOP_APP) await cancelDriveAuthorization();
    setStatus("disconnected");
    setError(null);
    notify("Đã hủy kết nối Google Drive");
  }, [notify]);

  const disconnect = useCallback(() => {
    const currentToken = token;
    userRef.current = null;
    remoteRevisionRef.current = null;
    setToken(null);
    setUser(null);
    setReady(false);
    setStatus("disconnected");
    setError(null);
    setPanelOpen(false);
    notify("Đã ngắt Google Drive; dữ liệu cục bộ vẫn được giữ");
    void driveSyncService.disconnect(currentToken).catch(() => undefined);
  }, [notify, token]);

  const changeClient = useCallback(() => {
    const currentToken = token;
    userRef.current = null;
    remoteRevisionRef.current = null;
    desktopResumeClientRef.current = desktopClientId.trim();
    setToken(null);
    setUser(null);
    setReady(false);
    setStatus("disconnected");
    setError(null);
    setPanelOpen(true);
    notify("Có thể nhập OAuth client khác rồi kết nối lại");
    void driveSyncService.disconnect(currentToken).catch(() => undefined);
  }, [desktopClientId, notify, token]);

  const importDesktopOAuth = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const config = parseDesktopOAuthConfig(JSON.parse(await file.text()));
      setDesktopClientIdState(config.clientId);
      setDesktopClientSecretState(config.clientSecret);
      setError(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Không đọc được tệp OAuth Desktop JSON.");
    }
  }, []);

  const setDesktopClientId = useCallback((value: string) => {
    setDesktopClientIdState(value.trim());
    setError(null);
  }, []);
  const setDesktopClientSecret = useCallback((value: string) => {
    setDesktopClientSecretState(value.trim());
    setError(null);
  }, []);

  useEffect(() => {
    void prepareAuthorization();
  }, [prepareAuthorization]);

  useEffect(() => {
    const clientId = desktopClientId.trim();
    if (!integration.ready || !IS_DESKTOP_APP || token || !clientId.endsWith(".apps.googleusercontent.com")) return;
    if (desktopResumeClientRef.current === clientId) return;
    desktopResumeClientRef.current = clientId;
    void resumeDesktopDrive();
  }, [desktopClientId, integration.ready, resumeDesktopDrive, token]);

  useEffect(() => {
    if (!IS_DESKTOP_APP || !token || !desktopClientId.trim()) return;
    const refresh = () => { void resumeDesktopDrive(); };
    const timer = window.setInterval(refresh, 45 * 60 * 1000);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [desktopClientId, resumeDesktopDrive, token]);

  useEffect(() => {
    if (!integration.ready || !token || !ready || !autoSync) return;
    const timer = window.setTimeout(() => { void syncToDrive(token, true); }, 2200);
    return () => window.clearTimeout(timer);
  }, [
    autoSync,
    integration.activeSheetContent,
    integration.activeWorkspaceId,
    integration.noteStructure,
    integration.noteZoom,
    integration.readerShare,
    integration.ready,
    integration.workspaceMode,
    integration.workspaces,
    ready,
    syncToDrive,
    token,
  ]);

  return {
    isDesktopApp: IS_DESKTOP_APP,
    panelOpen,
    desktopClientId,
    desktopClientSecret,
    token,
    user,
    status,
    ready,
    autoSync,
    lastSyncedAt,
    error,
    authorizationReady,
    preparingAuthorization,
    togglePanel: () => setPanelOpen((open) => !open),
    closePanel: () => setPanelOpen(false),
    setDesktopClientId,
    setDesktopClientSecret,
    setAutoSync,
    importDesktopOAuth,
    retryAuthorizationPreparation: async () => { await prepareAuthorization(true); },
    connect,
    cancelConnection,
    disconnect,
    changeClient,
    sync: () => syncToDrive(),
    restore: () => restoreFromDrive(),
  };
}

const DriveControllerContext = createContext<DriveController | null>(null);

export function DriveControllerProvider({ controller, children }: PropsWithChildren<{ controller: DriveController }>) {
  return <DriveControllerContext.Provider value={controller}>{children}</DriveControllerContext.Provider>;
}

export function useActiveDriveController() {
  const controller = useContext(DriveControllerContext);
  if (!controller) throw new Error("DriveControllerProvider is missing");
  return controller;
}
