const { _electron: electron, expect } = require('@playwright/test');

async function submitName(page, locator, value) {
  await locator.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
}

(async () => {
  const app = await electron.launch({
    args: ['--no-sandbox', '--headless', '--disable-gpu', '--no-zygote', '--single-process', '--user-data-dir=/tmp/mednote-electron-profile', '.'],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(async () => {
      localStorage.clear();
      indexedDB.deleteDatabase('mednote-local');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    let nav = page.locator('.mednote-page-sheet-nav');
    await expect(nav).toBeVisible({ timeout: 15_000 });
    await submitName(page, nav.locator('[data-new-notebook]'), 'Electron Nội tiết');
    await expect(page.locator('.mednote-page-sheet-nav [data-notebook-select] option:checked')).toHaveText('Electron Nội tiết');

    nav = page.locator('.mednote-page-sheet-nav');
    await submitName(page, nav.locator('[data-add-section]').first(), 'Chuyển hóa');
    await expect(page.locator('.mednote-page-sheet-nav .mps-section strong', { hasText: 'Chuyển hóa' })).toBeVisible();

    nav = page.locator('.mednote-page-sheet-nav');
    await submitName(page, nav.locator('[data-add-page]').first(), 'Đái tháo đường');
    await expect(page.locator('.mednote-page-sheet-nav .mps-page-card', { hasText: 'Đái tháo đường' })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    nav = page.locator('.mednote-page-sheet-nav');
    await expect(nav.locator('[data-notebook-select] option:checked')).toHaveText('Electron Nội tiết');
    await expect(nav.locator('.mps-section strong', { hasText: 'Chuyển hóa' })).toBeVisible();
    await expect(nav.locator('.mps-page-card', { hasText: 'Đái tháo đường' })).toBeVisible();
    process.stdout.write('Electron hierarchy test passed\n');
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
