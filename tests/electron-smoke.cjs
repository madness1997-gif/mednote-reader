const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron, expect } = require('@playwright/test');

const profile = path.join(os.tmpdir(), `mednote-electron-smoke-${Date.now()}`);

(async () => {
  let application;
  const runtimeErrors = [];
  try {
    application = await electron.launch({
      args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`],
      env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    });
    application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));

    const page = await application.firstWindow();
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.stack || error.message}`));

    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.note-sidebar')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Kết nối Google Drive' }).click();
    const drivePanel = page.locator('.drive-panel');
    await expect(drivePanel.getByRole('button', { name: 'Nhập tệp OAuth JSON' })).toBeVisible();
    await drivePanel.locator('input[type="file"]').setInputFiles({
      name: 'oauth-desktop.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ installed: {
        client_id: 'smoke-desktop.apps.googleusercontent.com',
        client_secret: 'GOCSPX-smoke-secret',
      } })),
    });
    await expect(drivePanel.locator('.drive-client-id input').first()).toHaveValue('smoke-desktop.apps.googleusercontent.com');
    await expect(drivePanel.locator('input[type="password"]')).toHaveValue('GOCSPX-smoke-secret');
    await page.waitForTimeout(500);
    expect(runtimeErrors).toEqual([]);
    process.stdout.write('Electron startup smoke test passed\n');
  } finally {
    try { await application?.close(); } catch { /* already closed after a failed assertion */ }
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
