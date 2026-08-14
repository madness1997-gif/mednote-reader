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
    await expect(page.locator('.fa-block-editor')).toBeVisible();
    await expect(page.locator('.fa-block')).toHaveCount(0);
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
    process.stdout.write('Electron startup smoke test passed\n');
  } finally {
    try { await application?.close(); } catch { /* already closed after a failed assertion */ }
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
