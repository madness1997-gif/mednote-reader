import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const { installPdfFileLinks } = createRequire(import.meta.url)("../electron/pdf-file-links.cjs");

test("desktop PDF links persist tokens, read source changes and report moved files without deleting originals", async () => {
  const root = await mkdtemp(join(tmpdir(), "mednote-pdf-links-"));
  try {
    const original = join(root, "original.pdf");
    await writeFile(original, "%PDF-original");
    const sender = { mainFrame: {} };
    const event = { sender, senderFrame: sender.mainFrame };
    const makeHandlers = () => {
      const handlers = new Map<string, (...args: any[]) => Promise<any>>();
      installPdfFileLinks({
        app: { getPath: () => root },
        dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [original] }) },
        ipcMain: { handle: (name: string, callback: (...args: any[]) => Promise<any>) => handlers.set(name, callback) },
        getWindow: () => ({ webContents: sender }),
      });
      return handlers;
    };
    const handlers = makeHandlers();
    const [selected] = await handlers.get("pdf:pick")!(event, true);
    assert.equal(selected.name, "original.pdf");
    assert.equal(String(await handlers.get("pdf:read-linked")!(event, selected.token)), "%PDF-original");
    await writeFile(original, "%PDF-updated");
    const restarted = makeHandlers();
    assert.equal(String(await restarted.get("pdf:read-linked")!(event, selected.token)), "%PDF-updated");
    await assert.rejects(restarted.get("pdf:read-linked")!(event, original), /Không tìm thấy/);
    await assert.rejects(restarted.get("pdf:read-linked")!({ sender: {}, senderFrame: {} }, selected.token), /Unauthorized/);
    await rename(original, join(root, "moved.pdf"));
    await assert.rejects(restarted.get("pdf:read-linked")!(event, selected.token), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
