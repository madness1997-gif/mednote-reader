const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } = require("electron");
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

protocol.registerSchemesAsPrivileged([{
  scheme: "mednote-assets",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

let mainWindow = null;
let activeAuthorization = null;

function credentialPath() {
  return path.join(app.getPath("userData"), "google-drive-token.bin");
}

function assetContentType(filePath) {
  if (filePath.endsWith(".ttf")) return "font/ttf";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function registerAssetProtocol() {
  const publicRoot = path.resolve(__dirname, "..", "dist-electron");
  protocol.handle("mednote-assets", async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const target = path.resolve(publicRoot, relativePath);
      if (target !== publicRoot && !target.startsWith(`${publicRoot}${path.sep}`)) {
        return new Response("Not found", { status: 404 });
      }
      const data = await fs.readFile(target);
      return new Response(data, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": assetContentType(target),
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function oauthErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Lỗi không xác định");
  if (/fetch failed|network|certificate|socket|connect|proxy/i.test(message)) {
    return "MedNote không kết nối được tới máy chủ Google. Hãy kiểm tra mạng, VPN, proxy hoặc tường lửa rồi thử lại.";
  }
  if (/invalid_client/i.test(message)) {
    return "OAuth Client ID không đúng loại Desktop app. Hãy tạo Client ID loại Desktop app trong Google Cloud rồi dán lại vào MedNote.";
  }
  if (/client_secret.*missing|missing.*client_secret/i.test(message)) {
    return "Google yêu cầu Client Secret của OAuth Desktop này. Hãy quay lại MedNote, nhập Client Secret được cấp cùng Client ID rồi kết nối lại.";
  }
  if (/redirect_uri_mismatch/i.test(message)) {
    return "OAuth Client ID không hỗ trợ địa chỉ callback của ứng dụng desktop. Hãy dùng Client ID loại Desktop app.";
  }
  if (/invalid_grant|code verifier/i.test(message)) {
    return "Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Hãy quay lại MedNote và kết nối lại.";
  }
  return message;
}

function callbackPage(title, message, success = false) {
  const color = success ? "#0f766e" : "#b42318";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f4f7f7;color:#17252a}main{max-width:560px;margin:10vh auto;padding:28px;border:1px solid #d8e1e3;border-radius:16px;background:white;box-shadow:0 10px 30px #17343d14}h1{margin:0 0 12px;font-size:24px;color:${color}}p{margin:0;line-height:1.55}.hint{margin-top:16px;color:#52656b;font-size:14px}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p class="hint">Bạn có thể đóng cửa sổ này và quay lại MedNote.</p></main></body></html>`;
}

async function tokenRequest(parameters) {
  // Electron's network stack respects the Windows proxy and certificate store.
  // That is more reliable for an installed app than Node's standalone fetch.
  const response = await net.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`Google trả về phản hồi không hợp lệ (HTTP ${response.status})`);
  }
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google không cấp quyền truy cập Drive");
  }
  return payload;
}

async function refreshAccessToken(clientId, refreshToken, clientSecret = "") {
  const parameters = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };
  if (clientSecret) parameters.client_secret = clientSecret;
  const payload = await tokenRequest(parameters);
  return payload.access_token;
}

async function authorizeWithSystemBrowser(clientId, clientSecret = "") {
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
        const authorizationError = new Error(error || "Phản hồi đăng nhập Google không hợp lệ");
        response.end(callbackPage("MedNote chưa được cấp quyền", oauthErrorMessage(authorizationError)));
        finish(authorizationError);
        return;
      }
      try {
        const address = server.address();
        const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
        const tokenParameters = {
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        };
        if (clientSecret) tokenParameters.client_secret = clientSecret;
        const payload = await tokenRequest(tokenParameters);
        if (payload.refresh_token) await saveCredential({ clientId, clientSecret, refreshToken: payload.refresh_token });
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(callbackPage("Đã kết nối Google Drive", "MedNote đã nhận quyền truy cập và lưu phiên đăng nhập an toàn trên máy.", true));
        finish(null, payload.access_token);
      } catch (exchangeError) {
        const friendlyMessage = oauthErrorMessage(exchangeError);
        response.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        response.end(callbackPage("Không thể hoàn tất đăng nhập", friendlyMessage));
        finish(new Error(friendlyMessage));
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

async function authorizeDrive(clientId, clientSecret = "") {
  const normalizedClientId = String(clientId || "").trim();
  const normalizedClientSecret = String(clientSecret || "").trim();
  if (!CLIENT_ID_PATTERN.test(normalizedClientId)) throw new Error("OAuth Client ID không hợp lệ");
  if (normalizedClientSecret.length > 512) throw new Error("OAuth Client Secret không hợp lệ");
  const credential = await readCredential();
  let effectiveClientSecret = normalizedClientSecret;
  if (credential?.clientId === normalizedClientId && credential.refreshToken) {
    effectiveClientSecret ||= String(credential.clientSecret || "").trim();
    try {
      const accessToken = await refreshAccessToken(normalizedClientId, credential.refreshToken, effectiveClientSecret);
      if (effectiveClientSecret !== credential.clientSecret) {
        await saveCredential({ ...credential, clientSecret: effectiveClientSecret });
      }
      return accessToken;
    } catch {
      await clearCredential();
    }
  }
  return authorizeWithSystemBrowser(normalizedClientId, effectiveClientSecret);
}

async function revokeDrive(token) {
  await clearCredential();
  if (!token) return;
  try {
    await net.fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
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

ipcMain.handle("drive:authorize", async (_event, credentials = {}) => {
  if (activeAuthorization) return activeAuthorization;
  activeAuthorization = authorizeDrive(credentials.clientId, credentials.clientSecret).finally(() => { activeAuthorization = null; });
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
    registerAssetProtocol();
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
