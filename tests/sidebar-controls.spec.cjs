const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Headless Chromium does not expose a native select popup. Replace showPicker
    // with an observable user-gesture-safe stub so the N button can be verified.
    HTMLSelectElement.prototype.showPicker = function showPicker() {
      this.dataset.e2ePickerOpened = '1';
      this.focus();
    };
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });
});

test('all note sidebar topbar controls are live on mobile', async ({ page }) => {
  const nav = page.locator('.mednote-page-sheet-nav');
  const bookbar = nav.locator('.mps-bookbar');

  const pickerButton = bookbar.locator('[data-page-sheet-notebook-picker]');
  const notebookSelect = bookbar.locator('[data-notebook-select]');
  const addNotebook = bookbar.locator('[data-new-notebook]');
  const search = bookbar.locator('[data-native-note-search]');
  const more = bookbar.locator('[data-page-sheet-notebook-more]');
  const close = bookbar.locator('[data-note-navigation-close]');

  await expect(pickerButton).toBeVisible();
  await expect(notebookSelect).toBeVisible();
  await expect(addNotebook).toBeVisible();
  await expect(search).toBeVisible();
  await expect(more).toBeVisible();
  await expect(close).toBeVisible();

  // N: open/focus notebook picker.
  await pickerButton.click();
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();

  // +: invoke the real create-notebook prompt.
  const addDialogPromise = page.waitForEvent('dialog');
  await addNotebook.click();
  const addDialog = await addDialogPromise;
  expect(addDialog.type()).toBe('prompt');
  expect(addDialog.message()).toContain('Notebook');
  await addDialog.dismiss();

  // Search: open the real panel, type an existing Section name and get a result.
  await search.click();
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'search');
  const searchInput = nav.locator('.mps-search-input');
  await expect(searchInput).toBeVisible();
  const firstSectionName = (await nav.locator('.mps-section strong').first().textContent()) || '';
  expect(firstSectionName.trim().length).toBeGreaterThan(0);
  await searchInput.fill(firstSectionName.trim().slice(0, Math.min(4, firstSectionName.trim().length)));
  await expect(nav.locator('[data-native-note-search-open]').first()).toBeVisible();
  await nav.locator('[data-native-note-search-close]').click();
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'navigation');
  await expect(nav.locator('.mps-search-input')).toHaveCount(0);

  // ...: menu opens and both real destructive/non-destructive actions invoke dialogs.
  await more.click();
  const menu = bookbar.locator('.mps-notebook-menu');
  await expect(menu).toHaveClass(/open/);
  await expect(menu.locator('[data-page-sheet-notebook-rename]')).toBeVisible();
  await expect(menu.locator('[data-page-sheet-notebook-delete]')).toBeVisible();

  const renameDialogPromise = page.waitForEvent('dialog');
  await menu.locator('[data-page-sheet-notebook-rename]').click();
  const renameDialog = await renameDialogPromise;
  expect(renameDialog.type()).toBe('prompt');
  expect(renameDialog.message()).toContain('Notebook');
  await renameDialog.dismiss();

  await more.click();
  await expect(menu).toHaveClass(/open/);
  const deleteDialogPromise = page.waitForEvent('dialog');
  await menu.locator('[data-page-sheet-notebook-delete]').click();
  const deleteDialog = await deleteDialogPromise;
  expect(deleteDialog.type()).toBe('confirm');
  expect(deleteDialog.message()).toContain('Notebook');
  await deleteDialog.dismiss();

  // X: actually hides the sidebar and writes the persisted hidden state.
  await close.click();
  await expect(page.locator('.workspace')).toHaveClass(/onenote-note-navigation-hidden/);
  await expect(page.locator('.note-thumbnails')).toBeHidden();
  const hiddenState = await page.evaluate(() => localStorage.getItem('mednote-note-navigation-hidden'));
  expect(hiddenState).toBe('1');
});
