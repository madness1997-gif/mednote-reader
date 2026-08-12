const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function submitName(page, trigger, value) {
  await trigger.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.note-sidebar')).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
}

async function acceptConfirm(page, action) {
  page.once('dialog', async (dialog) => dialog.accept());
  await action();
  await expect(page.locator('.note-sidebar')).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
}

test('deleting the active Sheet stays in the same Page and survives reload', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const nav = page.locator('.note-sidebar');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Web Delete Sheet');
  await submitName(page, nav.getByRole('button', { name: 'Thêm Section' }), 'Web Section');
  await submitName(page, nav.getByRole('button', { name: 'Thêm Page' }), 'Web Page');

  let pageRow = nav.locator('.note-sidebar-page.active', { hasText: 'Web Page' });
  await expect(pageRow).toBeVisible();
  await nav.getByRole('button', { name: 'Thêm tờ vào Web Page' }).click();
  await expect(pageRow).toContainText('2 tờ');

  const activeSheet = pageRow.locator('.note-sidebar-sheet.active');
  await expect(activeSheet).toHaveCount(1);
  await acceptConfirm(page, () => activeSheet.getByRole('button', { name: /Xóa tờ/ }).click());

  pageRow = nav.locator('.note-sidebar-page.active', { hasText: 'Web Page' });
  await expect(pageRow).toContainText('1 tờ');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedNav = page.locator('.note-sidebar');
  await expect(reloadedNav).toBeVisible({ timeout: 10_000 });
  await expect(reloadedNav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Sheet');
  await expect(reloadedNav.locator('.note-sidebar-section.active', { hasText: 'Web Section' })).toBeVisible();
  await expect(reloadedNav.locator('.note-sidebar-page.active', { hasText: 'Web Page' })).toContainText('1 tờ');
});
