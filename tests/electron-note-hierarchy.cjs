const { _electron: electron, expect } = require('@playwright/test');

async function submitName(page, locator, value) {
  await locator.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
}

const profile = `/tmp/mednote-electron-wave3-${Date.now()}`;

async function launch() {
  const application = await electron.launch({
    // xvfb supplies the display in CI. Keeping Electron in its normal
    // multi-process lifecycle is required for BrowserWindow close events.
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  return application;
}

(async () => {
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    let nav = page.locator('.note-sidebar-v6');
    await expect(nav).toBeVisible({ timeout: 15_000 });
    await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Electron Nội tiết');
    await expect(page.locator('.note-sidebar-v6 select[aria-label="Notebook"] option:checked')).toHaveText('Electron Nội tiết');

    nav = page.locator('.note-sidebar-v6');
    await submitName(page, nav.getByRole('button', { name: 'Thêm Section' }), 'Chuyển hóa');
    await expect(page.locator('.note-sidebar-section.active', { hasText: 'Chuyển hóa' })).toBeVisible();

    nav = page.locator('.note-sidebar-v6');
    await submitName(page, nav.getByRole('button', { name: 'Thêm Page' }), 'Đái tháo đường');
    await expect(page.locator('.note-sidebar-page', { hasText: 'Đái tháo đường' })).toBeVisible();

    // Close without a reload or an explicit save. Electron must wait for the
    // renderer's v6 queue and IndexedDB transaction to flush.
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    nav = page.locator('.note-sidebar-v6');
    await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Electron Nội tiết');
    await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Chuyển hóa' })).toBeVisible();
    await expect(nav.locator('.note-sidebar-page', { hasText: 'Đái tháo đường' })).toBeVisible();
    process.stdout.write('Electron hierarchy test passed\n');
  } finally {
    try { await app.close(); } catch { /* already closed after a failed assertion */ }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
