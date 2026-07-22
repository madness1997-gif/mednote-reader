const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

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
  appProperties?: Record<string, string>;
};

export type DriveUser = {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
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

export async function requestDriveToken(clientId: string) {
  if (!clientId) throw new Error("Ứng dụng chưa được cấu hình Google Client ID");
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

export async function listDriveAppFiles(token: string): Promise<DriveAppFile[]> {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: "'appDataFolder' in parents and trashed = false",
    pageSize: "1000",
    fields: "files(id,name,mimeType,modifiedTime,size,appProperties)",
  });
  const response = await driveFetch(token, `${DRIVE_API}/files?${params}`);
  const payload = await response.json() as { files?: DriveAppFile[] };
  return payload.files ?? [];
}

export async function downloadDriveFile(token: string, fileId: string) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.blob();
}

export async function upsertDriveFile(
  token: string,
  options: { name: string; mimeType: string; mednoteId: string; blob: Blob; existingId?: string },
) {
  const metadata = {
    name: options.name,
    mimeType: options.mimeType,
    appProperties: { mednoteId: options.mednoteId },
    ...(options.existingId ? {} : { parents: ["appDataFolder"] }),
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
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(options.existingId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,appProperties`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,appProperties`;
  const response = await driveFetch(token, url, {
    method: options.existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<DriveAppFile>;
}
