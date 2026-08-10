const { test, expect } = require('@playwright/test');

test.use({
  // Android Chrome "Desktop site" keeps a desktop layout viewport on the phone.
  viewport: { width: 980, height: 1500 },
  hasTouch: true,
  isMobile: false,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];
  page.__mednoteRuntimeErrors = runtimeErrors;
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.stack || error.message}`));

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const paper = { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' };
    const text = { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' };
    const notePage = {
      id: 'e2e-page-1', title: 'TÊN CHỦ ĐỀ', titleHtml: 'TÊN CHỦ ĐỀ',
      body: 'TỔNG QUAN YẾU TỐ NGUY CƠ CƠ CHẾ LÂM SÀNG CHẨN ĐOÁN ĐIỀU TRỊ',
      bodyHtml: '<p>TỔNG QUAN</p><p>YẾU TỐ NGUY CƠ</p><p>CƠ CHẾ</p><p>LÂM SÀNG</p><p>CHẨN ĐOÁN</p><p>ĐIỀU TRỊ</p>',
      citationPage: null, strokes: [], excerpts: [], paper, text,
    };
    const notebook = { id: 'e2e-notebook-1', title: 'Ghi chú — dc260043', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'e2e-workspace-1', kind: 'empty', name: notebook.title, documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'e2e-workspace-1', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const host = page.locator('.note-navigation-host');
  const nav = host.locator(':scope > .note-sidebar-v6');
  const workspace = page.locator('.workspace');

  await expect(host).toHaveCount(1);
  await expect(workspace).toHaveClass(/workspace-mode-note/);
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await expect(host.locator(':scope > :not(.note-sidebar-v6)')).toHaveCount(0);
  await expect(page.locator('.mednote-page-sheet-nav')).toHaveCount(0);

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(290);
  expect(box.x).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThanOrEqual(981);
});

test.afterEach(async ({ page }) => {
  expect(page.__mednoteRuntimeErrors).toEqual([]);
});

test('React note sidebar controls are live in desktop-site mode', async ({ page }) => {
  const nav = page.locator('.note-sidebar-v6');
  const bookbar = nav.locator('.note-sidebar-bookbar');
  const notebookSelect = bookbar.locator('select[aria-label="Notebook"]');
  const addNotebook = bookbar.getByRole('button', { name: 'Tạo Notebook' });
  const more = bookbar.getByRole('button', { name: 'Thao tác Notebook' });
  const close = bookbar.getByRole('button', { name: 'Thu gọn điều hướng' });
  const search = nav.getByRole('textbox', { name: 'Tìm ghi chú' });

  await expect(notebookSelect).toHaveValue('e2e-notebook-1');
  await expect(addNotebook).toBeVisible();
  await expect(search).toBeVisible();
  await expect(more).toBeVisible();
  await expect(close).toBeVisible();

  await addNotebook.click();
  await expect(page.locator('.mednote-native-dialog')).toBeVisible();
  await page.locator('.mednote-native-dialog [data-cancel]').click();
  await expect(page.locator('.mednote-native-dialog')).toBeHidden();

  await search.fill('TÊN');
  await expect(nav.locator('.note-sidebar-page-open', { hasText: 'TÊN CHỦ ĐỀ' })).toBeVisible();
  await search.fill('không tồn tại');
  await expect(nav.locator('.note-sidebar-empty')).toContainText('Không tìm thấy');
  await nav.getByRole('button', { name: 'Xóa tìm kiếm' }).click();

  await more.click();
  const menu = bookbar.locator('.note-sidebar-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Đổi tên Notebook' }).click();
  await expect(page.locator('.mednote-native-dialog')).toBeVisible();
  await page.locator('.mednote-native-dialog [data-cancel]').click();

  await close.click();
  const collapsed = page.locator('.note-sidebar-v6-collapsed');
  await expect(collapsed).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mednote-note-sidebar-v6-hidden'))).toBe('1');
  await collapsed.getByRole('button', { name: 'Mở điều hướng ghi chú' }).click();
  await expect(page.locator('.note-sidebar-bookbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mednote-note-sidebar-v6-hidden'))).toBe('0');
});

test('search and Notebook menu remain stable without DOM maintenance loops', async ({ page }) => {
  test.setTimeout(30_000);
  const nav = page.locator('.note-sidebar-v6');
  const search = nav.getByRole('textbox', { name: 'Tìm ghi chú' });
  const more = nav.getByRole('button', { name: 'Thao tác Notebook' });

  await search.fill('TÊN');
  await more.click();
  await expect(nav.locator('.note-sidebar-menu')).toBeVisible();
  await page.waitForTimeout(4_000);
  await expect(search).toHaveValue('TÊN');
  await expect(nav.locator('.note-sidebar-menu')).toBeVisible();
  await expect(nav.locator('.note-sidebar-page-open', { hasText: 'TÊN CHỦ ĐỀ' })).toBeVisible();
});
