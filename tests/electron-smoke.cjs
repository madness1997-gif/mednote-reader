const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { _electron: electron, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const profile = path.join(os.tmpdir(), `mednote-electron-smoke-${Date.now()}`);

async function launch() {
  const application = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  return application;
}

async function submitName(page, trigger, value) {
  await trigger.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
}

function captureRuntimeErrors(page, runtimeErrors) {
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.stack || error.message}`));
}

(async () => {
  let application;
  const runtimeErrors = [];
  try {
    application = await launch();

    let page = await application.firstWindow();
    captureRuntimeErrors(page, runtimeErrors);

    await page.waitForLoadState('domcontentloaded');
    // Decode every bundled cover in the real file:// desktop renderer. Empty
    // source images can otherwise build successfully as empty data URLs.
    const coverSources = (await fs.readdir(path.join(__dirname, '../app/assets/covers')))
      .filter((name) => name.endsWith('.webp'));
    const assetRoot = path.join(__dirname, '../dist-electron/assets');
    const builtAssets = await fs.readdir(assetRoot);
    for (const source of coverSources) {
      const stem = source.slice(0, -5);
      const built = builtAssets.find((name) => name.startsWith(`${stem}-`) &&
        !name.startsWith(`${stem}-thumb-`) && name.endsWith('.webp'));
      expect(built, `Missing bundled cover: ${source}`).toBeTruthy();
      const dimensions = await page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, pathToFileURL(path.join(assetRoot, built)).href);
      expect(dimensions, source).toEqual(source.endsWith('-thumb.webp')
        ? { width: 180, height: 240 } : { width: 900, height: 1200 });
    }
    // Exercise the on-demand fallback in the real file:// renderer. The worker
    // must receive WASM bytes, render a nonblank page, and end on document close.
    const rendererAsset = builtAssets.find((name) => /^pdfium-renderer-.*\.js$/.test(name));
    expect(rendererAsset, 'Missing PDFium renderer chunk').toBeTruthy();
    const fixture = await PDFDocument.create();
    fixture.addPage([200, 300]).drawText('Desktop worker', { x: 20, y: 200, size: 16 });
    const fixtureBytes = Array.from(await fixture.save());
    const fallbackWorkers = new Set();
    let fallbackWorkerCount = 0;
    const observeWorker = (worker) => {
      fallbackWorkerCount++;
      fallbackWorkers.add(worker);
      worker.on('close', () => fallbackWorkers.delete(worker));
    };
    page.on('worker', observeWorker);
    for (let attempt = 0; attempt < 2; attempt++) {
      const rendered = await page.evaluate(async ({ rendererUrl, bytes }) => {
        const module = await import(rendererUrl);
        const [loadPdfiumDocument] = Object.values(module).filter((value) => typeof value === 'function');
        const document = await loadPdfiumDocument(new Uint8Array(bytes));
        try {
          const bitmap = await (await document.getPage(0)).render({ width: 200, height: 300 });
          return {
            width: bitmap.width,
            height: bitmap.height,
            nonblank: bitmap.data.some((value, index) => index % 4 !== 3 && value < 200),
          };
        } finally {
          await Promise.all([document.destroy(), document.destroy()]);
        }
      }, { rendererUrl: pathToFileURL(path.join(assetRoot, rendererAsset)).href, bytes: fixtureBytes });
      expect(rendered).toEqual({ width: 200, height: 300, nonblank: true });
      await expect.poll(() => fallbackWorkers.size).toBe(0);
    }
    expect(fallbackWorkerCount).toBe(2);
    page.off('worker', observeWorker);
    let sidebar = page.locator('.note-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.fa-block-editor')).toBeVisible();
    await expect(page.locator('.fa-block')).toHaveCount(0);

    await page.getByRole('button', { name: 'Thêm block đầu trang' }).click();
    await page.getByRole('button', { name: /Hình \+ nội dung/ }).click();
    const figureTextBlock = page.locator('.fa-block-figure-text');
    const figureColumn = figureTextBlock.locator('.fa-figure-block');
    await expect(figureTextBlock).toBeVisible();
    await figureTextBlock.getByRole('textbox', { name: 'Nội dung cạnh hình' }).click();
    const initialFigureWidth = (await figureColumn.boundingBox()).width;
    const figureResizer = figureTextBlock.getByRole('button', { name: /Đổi độ rộng vùng hình/ });
    const figureResizerBox = await figureResizer.boundingBox();
    await page.mouse.move(figureResizerBox.x + figureResizerBox.width / 2, figureResizerBox.y + figureResizerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(figureResizerBox.x + figureResizerBox.width / 2 + 80, figureResizerBox.y + figureResizerBox.height / 2, { steps: 6 });
    await page.mouse.up();
    expect((await figureColumn.boundingBox()).width).toBeGreaterThan(initialFigureWidth + 50);
    await expect(figureResizer).toHaveAttribute('aria-label', /hiện 5[0-9]%/);

    // Exercise the real First Aid renderer in Electron. Its computed styles
    // contain CSS Color 4 color()/color-mix() values that the legacy capture
    // library could not parse on Windows.
    await page.getByRole('button', { name: 'Xuất note thành PDF' }).click();
    await page.locator('[data-export-scope="sheet"]').click();
    await expect(page.getByText('PDF đã tạo xong')).toBeVisible({ timeout: 30_000 });
    const exportedPdf = await page.locator('[data-pdf-download="1"]').evaluate(async (link) => {
      const response = await fetch(link.href);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { header: new TextDecoder().decode(bytes.slice(0, 5)), size: bytes.length };
    });
    expect(exportedPdf.header).toBe('%PDF-');
    expect(exportedPdf.size).toBeGreaterThan(1000);
    await page.getByRole('button', { name: 'Đóng' }).click();

    await figureTextBlock.getByRole('button', { name: 'Xóa block' }).click();
    await expect(page.locator('.fa-block')).toHaveCount(0);

    const workspace = page.locator('.workspace');
    const readerPane = page.locator('.reader-pane');
    const notePane = page.locator('.notes-pane');
    await page.locator('.workspace-mode-switcher').getByRole('button', { name: 'Cả hai' }).click();
    await expect(workspace).toHaveClass(/workspace-mode-split/);
    await page.locator('.document-stage').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('F6');
    await expect.poll(() => notePane.evaluate((pane) => pane.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('F6');
    await expect.poll(() => readerPane.evaluate((pane) => pane.contains(document.activeElement))).toBe(true);

    await page.locator('.workspace-mode-switcher').getByRole('button', { name: 'Reader' }).click();
    await page.keyboard.press('F6');
    await expect(workspace).toHaveClass(/workspace-mode-note/);
    await page.keyboard.press('F6');
    await expect(workspace).toHaveClass(/workspace-mode-reader/);
    await page.keyboard.press('Escape');
    await expect(workspace).toHaveClass(/workspace-mode-split/);

    // Keep the F6 focus/mode smoke scenario isolated from the persistence and
    // Drive scenario below. Reloading preserves the same Electron profile while
    // clearing transient focus/layout state created by the shortcut checks.
    await page.reload({ waitUntil: 'domcontentloaded' });
    sidebar = page.locator('.note-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.fa-block-editor')).toBeVisible();

    await submitName(page, sidebar.getByRole('button', { name: 'Tạo Notebook' }), 'Electron Nội tiết');
    await submitName(page, sidebar.getByRole('button', { name: 'Thêm Section' }), 'Chuyển hóa');
    await submitName(page, sidebar.getByRole('button', { name: 'Thêm Page' }), 'Đái tháo đường');

    // Closing immediately must still flush the renderer queue and IndexedDB transaction.
    await application.close();
    application = await launch();
    page = await application.firstWindow();
    captureRuntimeErrors(page, runtimeErrors);
    await page.waitForLoadState('domcontentloaded');
    sidebar = page.locator('.note-sidebar');
    await expect(sidebar.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Electron Nội tiết');
    await expect(sidebar.locator('.note-sidebar-section.active', { hasText: 'Chuyển hóa' })).toBeVisible();
    await expect(sidebar.locator('.note-sidebar-page', { hasText: 'Đái tháo đường' })).toBeVisible();

    await page.getByRole('button', { name: 'Kết nối Google Drive' }).click();
    const drivePanel = page.locator('.drive-panel');
    const clientId = drivePanel.locator('.drive-client-id input').first();
    const clientSecret = drivePanel.locator('input[type="password"]');
    await expect(clientId).toBeVisible();
    await expect(clientSecret).toBeVisible();
    const oauthJson = drivePanel.locator('input[type="file"]');
    await expect(oauthJson).toHaveCount(1);
    await oauthJson.setInputFiles({
      name: 'web-oauth.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ web: { client_id: 'wrong-client.apps.googleusercontent.com' } })),
    });
    await expect(drivePanel).toContainText('Đây là OAuth Web application');
    await oauthJson.setInputFiles({
      name: 'desktop-oauth.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ installed: {
        client_id: 'smoke-desktop.apps.googleusercontent.com',
        client_secret: 'GOCSPX-smoke-secret',
      } })),
    });
    await expect(clientId).toHaveValue('smoke-desktop.apps.googleusercontent.com');
    await expect(clientSecret).toHaveValue('GOCSPX-smoke-secret');
    await page.waitForTimeout(500);
    expect(runtimeErrors).toEqual([]);
    process.stdout.write('Electron startup, persistence, and Drive OAuth smoke test passed\n');
  } finally {
    try { await application?.close(); } catch { /* already closed after a failed assertion */ }
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
