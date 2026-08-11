export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive",
] as const;

const DRIVE_SCOPE = GOOGLE_DRIVE_SCOPES.join(" ");
const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const MEDNOTE_SHARED_ROOT_ID = "root:shared:v1";
const MEDNOTE_SHARED_ROOT_NAME = "MedNote Reader";

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    mednoteDesktop?: {
      isDesktop: true;
      authorizeDrive: (clientId: string, clientSecret?: string) => Promise<string>;
      revokeDrive: (token: string) => Promise<void>;
      onFlushRequested: (listener: (requestId: string) => void) => () => void;
      completeFlush: (requestId: string, success: boolean, error?: string) => void;
    };
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

export type DriveAppFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
};

export type DriveUser = {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
};

export type DriveSharedFiles = {
  folder: DriveAppFile | null;
  files: DriveAppFile[];
};

let gisPromise: Promise<void> | null = null;

function loadGoogleIdentityServices() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => window.google?.accounts.oauth2 ? resolve() : reject(new Error("Google Identity Services không khởi động được"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Không tải được dịch vụ đăng nhập Google")), { once: true });
    if (!existing) {
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return gisPromise;
}

export async function requestDriveToken(clientId: string, clientSecret = "") {
  if (!clientId) throw new Error("Ứng dụng chưa được cấu hình Google Client ID");
  if (window.mednoteDesktop?.isDesktop) return window.mednoteDesktop.authorizeDrive(clientId, clientSecret);
  await loadGoogleIdentityServices();
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || response.error || "Không thể đăng nhập Google Drive"));
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export function revokeDriveToken(token: string) {
  if (window.mednoteDesktop?.isDesktop) {
    void window.mednoteDesktop.revokeDrive(token);
    return;
  }
  window.google?.accounts.oauth2.revoke(token);
}

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `Google Drive trả về lỗi ${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch { /* use the status message */ }
    throw new Error(message);
  }
  return response;
}

export async function getDriveUser(token: string): Promise<DriveUser> {
  const response = await driveFetch(token, `${DRIVE_API}/about?fields=user(displayName,emailAddress,photoLink)`);
  const payload = await response.json() as { user: DriveUser };
  return payload.user;
}

async function listDriveFiles(token: string, input: { spaces?: string; q: string }) {
  const files: DriveAppFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: input.q,
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,properties,appProperties)",
    });
    if (input.spaces) params.set("spaces", input.spaces);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveFetch(token, `${DRIVE_API}/files?${params}`);
    const payload = await response.json() as { files?: DriveAppFile[]; nextPageToken?: string };
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return files;
}

/** Legacy, application-specific storage. New canonical backups use the shared folder below. */
export function listDriveAppFiles(token: string): Promise<DriveAppFile[]> {
  return listDriveFiles(token, {
    spaces: "appDataFolder",
    q: "'appDataFolder' in parents and trashed = false",
  });
}

function newestFile(files: DriveAppFile[]) {
  return [...files].sort((left, right) => {
    const modified = Date.parse(right.modifiedTime || "") - Date.parse(left.modifiedTime || "");
    return modified || right.id.localeCompare(left.id);
  })[0] || null;
}

async function listSharedRootFolders(token: string) {
  return listDriveFiles(token, {
    q: `mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false and properties has { key='mednoteId' and value='${MEDNOTE_SHARED_ROOT_ID}' }`,
  });
}

export async function listDriveSharedFiles(token: string): Promise<DriveSharedFiles> {
  const folder = newestFile(await listSharedRootFolders(token));
  if (!folder) return { folder: null, files: [] };
  return {
    folder,
    files: await listDriveFiles(token, { q: `'${folder.id}' in parents and trashed = false` }),
  };
}

export async function ensureDriveSharedFolder(token: string) {
  const existing = newestFile(await listSharedRootFolders(token));
  if (existing) return existing;
  const response = await driveFetch(token, `${DRIVE_API}/files?fields=id,name,mimeType,modifiedTime,size,properties,appProperties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: MEDNOTE_SHARED_ROOT_NAME,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      properties: { mednoteId: MEDNOTE_SHARED_ROOT_ID },
    }),
  });
  return response.json() as Promise<DriveAppFile>;
}

export async function downloadDriveFile(token: string, fileId: string) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.blob();
}

export async function upsertDriveFile(
  token: string,
  options: { name: string; mimeType: string; mednoteId: string; blob: Blob; existingId?: string; parentId?: string },
) {
  const metadata = {
    name: options.name,
    mimeType: options.mimeType,
    ...(options.parentId
      ? { properties: { mednoteId: options.mednoteId } }
      : { appProperties: { mednoteId: options.mednoteId } }),
    ...(options.existingId ? {} : { parents: [options.parentId || "appDataFolder"] }),
  };
  const boundary = `mednote_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${options.mimeType}\r\n\r\n`,
    options.blob,
    `\r\n--${boundary}--`,
  ]);
  const url = options.existingId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(options.existingId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,properties,appProperties`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,properties,appProperties`;
  const response = await driveFetch(token, url, {
    method: options.existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<DriveAppFile>;
}
