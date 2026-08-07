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
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.message()).toContain('Notebook');
    await dialog.dismiss();
  });
  await addNotebook.click();

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

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.message()).toContain('Notebook');
    await dialog.dismiss();
  });
  await menu.locator('[data-page-sheet-notebook-rename]').click();

  await more.click();
  await expect(menu).toHaveClass(/open/);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Notebook');
    await dialog.dismiss();
  });
  await menu.locator('[data-page-sheet-notebook-delete]').click();

  // X: actually hides the sidebar and writes the persisted hidden state.
  await close.click();
  await expect(page.locator('.workspace')).toHaveClass(/onenote-note-navigation-hidden/);
  await expect(page.locator('.note-thumbnails')).toBeHidden();
  const hiddenState = await page.evaluate(() => localStorage.getItem('mednote-note-navigation-hidden'));
  expect(hiddenState).toBe('1');
});

test('search, recent notes and notebook picker stay open across background maintenance', async ({ page }) => {
  test.setTimeout(40_000);
  const nav = page.locator('.mednote-page-sheet-nav');

  // Rail search must remain mounted for longer than several 900/1200 ms maintenance cycles.
  const railSearch = nav.locator('[data-sidebar-mode-button="search"]');
  await expect(railSearch).toBeVisible({ timeout: 5_000 });
  await railSearch.click();
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'search');
  await expect(nav.locator('.mps-search-input')).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'search');
  await expect(nav.locator('.mps-search-input')).toBeVisible();

  // Recent Notes is the other utility panel users reported disappearing.
  const railRecent = nav.locator('[data-sidebar-mode-button="recent"]');
  await railRecent.click();
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'recent');
  await expect(nav.locator('.mps-sidebar-utility')).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'recent');
  await expect(nav.locator('.mps-sidebar-utility')).toBeVisible();

  // Return to navigation then verify the notebook picker element is not replaced.
  await nav.locator('[data-sidebar-mode-button="navigation"]').click();
  const pickerButton = nav.locator('[data-page-sheet-notebook-picker]');
  const notebookSelect = nav.locator('[data-notebook-select]');
  await pickerButton.click();
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();
  await page.waitForTimeout(3_500);
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();
});
