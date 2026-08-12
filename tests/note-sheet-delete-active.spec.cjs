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

test('hierarchy deletes keep the nearest local active context and survive reload', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  let nav = page.locator('.note-sidebar');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Web Delete Hierarchy');
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
  nav = page.locator('.note-sidebar');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Hierarchy');
  await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Web Section' })).toBeVisible();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'Web Page' })).toContainText('1 tờ');

  // Delete the active Page; stay in the same Section on its sibling Page.
  await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Web Page' }).click());
  await expect(nav.locator('.note-sidebar-page', { hasText: 'Web Page' })).toHaveCount(0);
  await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Web Section' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  nav = page.locator('.note-sidebar');
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Hierarchy');
  await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Web Section' })).toBeVisible();
  await expect(nav.locator('.note-sidebar-page', { hasText: 'Web Page' })).toHaveCount(0);

  // Delete the active Section; stay in this Notebook on the neighboring Section.
  await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Web Section' }).click());
  await expect(nav.locator('.note-sidebar-section', { hasText: 'Web Section' })).toHaveCount(0);
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Hierarchy');
  await page.reload({ waitUntil: 'domcontentloaded' });
  nav = page.locator('.note-sidebar');
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Hierarchy');
  await expect(nav.locator('.note-sidebar-section', { hasText: 'Web Section' })).toHaveCount(0);

  // Delete the active Notebook; use another Notebook as the deterministic local fallback.
  await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Web Notebook Keep');
  await nav.locator('select[aria-label="Notebook"]').selectOption({ label: 'Web Delete Hierarchy' });
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Delete Hierarchy');
  await nav.getByRole('button', { name: 'Thao tác Notebook' }).click();
  await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Notebook' }).click());
  await expect(nav.locator('select[aria-label="Notebook"] option', { hasText: 'Web Delete Hierarchy' })).toHaveCount(0);
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Notebook Keep');

  await page.reload({ waitUntil: 'domcontentloaded' });
  nav = page.locator('.note-sidebar');
  await expect(nav.locator('select[aria-label="Notebook"] option', { hasText: 'Web Delete Hierarchy' })).toHaveCount(0);
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Web Notebook Keep');
});
