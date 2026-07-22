const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;

let mainWindow = null;
let activeAuthorization = null;

function credentialPath() {
  return path.join(app.getPath("userData"), "google-drive-token.bin");
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readCredential() {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(credentialPath());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

async function saveCredential(credential) {
  if (!safeStorage.isEncryptionAvailable()) return;
  const target = credentialPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, safeStorage.encryptString(JSON.stringify(credential)));
}

async function clearCredential() {
  try { await fs.unlink(credentialPath()); } catch { /* already signed out */ }
}

async function tokenRequest(parameters) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google không cấp quyền truy cập Drive");
  }
  return payload;
}

async function refreshAccessToken(clientId, refreshToken) {
  const payload = await tokenRequest({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return payload.access_token;
}

async function authorizeWithSystemBrowser(clientId) {
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error); else resolve(token);
    };
    const server = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/oauth2/callback") {
        response.writeHead(404).end();
        return;
      }
      const error = requestUrl.searchParams.get("error");
      const returnedState = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      if (error || returnedState !== state || !code) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<h2>MedNote chưa được cấp quyền.</h2><p>Bạn có thể đóng cửa sổ này và thử lại trong ứng dụng.</p>");
        finish(new Error(error || "Phản hồi đăng nhập Google không hợp lệ"));
        return;
      }
      try {
        const address = server.address();
        const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
        const payload = await tokenRequest({
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        });
        if (payload.refresh_token) await saveCredential({ clientId, refreshToken: payload.refresh_token });
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<h2>Đã kết nối MedNote với Google Drive.</h2><p>Bạn có thể đóng cửa sổ này và quay lại MedNote.</p>");
        finish(null, payload.access_token);
      } catch (exchangeError) {
        response.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<h2>Không thể hoàn tất đăng nhập.</h2><p>Hãy đóng cửa sổ này và thử lại trong MedNote.</p>");
        finish(exchangeError);
      }
    });

    const timeout = setTimeout(() => finish(new Error("Đăng nhập Google đã hết thời gian chờ")), OAUTH_TIMEOUT_MS);
    server.on("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
      const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: DRIVE_SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        prompt: "consent",
      });
      try {
        await shell.openExternal(`${GOOGLE_AUTHORIZE_URL}?${parameters}`);
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function authorizeDrive(clientId) {
  const normalizedClientId = String(clientId || "").trim();
  if (!CLIENT_ID_PATTERN.test(normalizedClientId)) throw new Error("OAuth Client ID không hợp lệ");
  const credential = await readCredential();
  if (credential?.clientId === normalizedClientId && credential.refreshToken) {
    try {
      return await refreshAccessToken(normalizedClientId, credential.refreshToken);
    } catch {
      await clearCredential();
    }
  }
  return authorizeWithSystemBrowser(normalizedClientId);
}

async function revokeDrive(token) {
  await clearCredential();
  if (!token) return;
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch { /* local sign-out still succeeds when offline */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#edf2f3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || "";
    if (url !== currentUrl && /^https?:\/\//i.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  const devUrl = process.env.MEDNOTE_DEV_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, "..", "dist-electron", "index.html"));
}

ipcMain.handle("drive:authorize", async (_event, clientId) => {
  if (activeAuthorization) return activeAuthorization;
  activeAuthorization = authorizeDrive(clientId).finally(() => { activeAuthorization = null; });
  return activeAuthorization;
});
ipcMain.handle("drive:revoke", (_event, token) => revokeDrive(token));

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
