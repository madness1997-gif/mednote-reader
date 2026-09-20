const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// Only files selected in the native dialog receive a capability token.
// The renderer cannot supply arbitrary filesystem paths to the read endpoint.
function installPdfFileLinks({ app, dialog, ipcMain, getWindow }) {
  let registryPromise;
  let writeQueue = Promise.resolve();
  const registryPath = () => path.join(app.getPath("userData"), "pdf-file-links.json");
  const registry = () => registryPromise ||= fs.readFile(registryPath(), "utf8")
    .then((text) => JSON.parse(text)).catch((error) => {
      if (error.code === "ENOENT") return {};
      throw error;
    });
  const checkSender = (event) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Unauthorized PDF request");
    }
  };
  ipcMain.handle("pdf:pick", async (event, multiple = true) => {
    checkSender(event);
    const result = await dialog.showOpenDialog(getWindow(), {
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    });
    if (result.canceled) return [];
    const entries = await registry();
    const selected = [];
    for (const filePath of result.filePaths) {
      if (path.extname(filePath).toLowerCase() !== ".pdf") continue;
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      const token = Object.keys(entries).find((key) => entries[key] === filePath) || crypto.randomUUID();
      entries[token] = filePath;
      selected.push({ token, name: path.basename(filePath), lastModified: stat.mtimeMs });
    }
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const target = registryPath();
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target + ".tmp", JSON.stringify(entries));
      await fs.rename(target + ".tmp", target);
    });
    await writeQueue;
    return selected;
  });
  ipcMain.handle("pdf:read-linked", async (event, token) => {
    checkSender(event);
    const entries = await registry();
    if (typeof token !== "string" || !Object.hasOwn(entries, token)) throw new Error("Không tìm thấy liên kết PDF");
    return fs.readFile(entries[token]);
  });
}
module.exports = { installPdfFileLinks };
