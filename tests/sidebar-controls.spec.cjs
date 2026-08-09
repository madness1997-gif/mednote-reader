const { test, expect } = require('@playwright/test');

test.use({
  // Android Chrome "Desktop site" uses a desktop-width layout viewport and then
  // scales it onto the physical phone screen. This is the mode shown in the user's screenshot.
  viewport: { width: 980, height: 1500 },
  hasTouch: true,
  isMobile: false,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();

    const notePage = {
      id: 'e2e-page-1',
      title: 'TÊN CHỦ ĐỀ',
      titleHtml: 'TÊN CHỦ ĐỀ',
      body: 'TỔNG QUAN YẾU TỐ NGUY CƠ CƠ CHẾ LÂM SÀNG CHẨN ĐOÁN ĐIỀU TRỊ',
      bodyHtml: '<p>TỔNG QUAN</p><p>YẾU TỐ NGUY CƠ</p><p>CƠ CHẾ</p><p>LÂM SÀNG</p><p>CHẨN ĐOÁN</p><p>ĐIỀU TRỊ</p>',
      citationPage: null,
      strokes: [],
      excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = {
      id: 'e2e-notebook-1',
      title: 'Ghi chú — dc260043',
      pages: [notePage],
      activePageId: notePage.id,
      createdAt: Date.now(),
    };
    const document = {
      id: 'e2e-document-1',
      name: 'dc260043.pdf',
      size: 123456,
      lastModified: Date.now(),
      reader: { page: 1, zoom: 1, fitMode: 'page', rotation: 0, viewMode: 'single', bookmarks: [], annotations: [] },
    };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'e2e-workspace-1',
        kind: 'document',
        name: 'dc260043.pdf',
        documents: [document],
        activeDocumentId: document.id,
        notebooks: [notebook],
        activeNotebookId: notebook.id,
        sourcePage: 1,
      }],
      activeWorkspaceId: 'e2e-workspace-1',
      readerShare: 50,
      workspaceMode: 'note',
      noteZoom: 100,
      savedAt: Date.now(),
    }));

    HTMLSelectElement.prototype.showPicker = function showPicker() {
      this.dataset.e2ePickerOpened = '1';
      this.focus();
    };
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const host = page.locator('.note-navigation-host');
  const nav = host.locator(':scope > .mednote-page-sheet-nav');
  const workspace = page.locator('.workspace');

  await expect(host).toHaveCount(1);
  await expect(workspace).toHaveClass(/workspace-mode-note/);
  await expect(nav).toHaveCount(1, { timeout: 10_000 });
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await expect(host.locator(':scope > :not(.mednote-page-sheet-nav)')).toHaveCount(0);
  await expect(page.locator('aside[aria-label="Trang ghi chú"]')).toHaveCount(0);
  await expect(workspace).toHaveClass(/onenote-right-navigation-layout/);

  // A "visible" element can still be off-screen. Assert the sidebar actually
  // occupies the right side of the viewport, which is what the screenshot lacked.
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeGreaterThanOrEqual(190);
  expect(box.x + box.width).toBeLessThanOrEqual(981);
  expect(box.x).toBeGreaterThan(600);
});

test('all note sidebar topbar controls are live in desktop-site mode', async ({ page }) => {
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

  await pickerButton.click();
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();

  await addNotebook.click();
  await expect(page.locator('.mednote-native-dialog')).toBeVisible();
  await page.locator('.mednote-native-dialog [data-cancel]').click();
  await expect(page.locator('.mednote-native-dialog')).toBeHidden();

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

  await more.click();
  const menu = bookbar.locator('.mps-notebook-menu');
  await expect(menu).toHaveClass(/open/);
  await expect(menu.locator('[data-page-sheet-notebook-rename]')).toBeVisible();
  await expect(menu.locator('[data-page-sheet-notebook-delete]')).toBeVisible();

  await menu.locator('[data-page-sheet-notebook-rename]').click();
  await expect(page.locator('.mednote-native-dialog')).toBeVisible();
  await page.locator('.mednote-native-dialog [data-cancel]').click();
  await expect(page.locator('.mednote-native-dialog')).toBeHidden();

  await close.click();
  await expect(page.locator('.workspace')).toHaveClass(/onenote-note-navigation-hidden/);
  await expect(page.locator('.note-navigation-host')).toBeHidden();
  const hiddenState = await page.evaluate(() => sessionStorage.getItem('mednote-note-navigation-hidden'));
  expect(hiddenState).toBe('1');
});

test('search, notebook list and more menu remain stable', async ({ page }) => {
  test.setTimeout(45_000);
  const nav = page.locator('.mednote-page-sheet-nav');
  const bookbar = nav.locator('.mps-bookbar');
  const search = bookbar.locator('[data-native-note-search]');
  const more = bookbar.locator('[data-page-sheet-notebook-more]');
  const pickerButton = bookbar.locator('[data-page-sheet-notebook-picker]');
  const notebookSelect = bookbar.locator('[data-notebook-select]');

  await search.click();
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'search');
  await expect(nav.locator('.mps-search-input')).toBeVisible();
  await page.waitForTimeout(4_000);
  await expect(nav).toHaveAttribute('data-sidebar-mode', 'search');
  await expect(nav.locator('.mps-search-input')).toBeVisible();
  await nav.locator('[data-native-note-search-close]').click();

  await more.click();
  const menu = bookbar.locator('.mps-notebook-menu');
  await expect(menu).toHaveClass(/open/);
  await page.waitForTimeout(4_000);
  await expect(menu).toHaveClass(/open/);
  await more.click();
  await expect(menu).not.toHaveClass(/open/);

  await pickerButton.click();
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();
  await page.waitForTimeout(4_000);
  await expect(notebookSelect).toHaveAttribute('data-e2e-picker-opened', '1');
  await expect(notebookSelect).toBeFocused();
});
