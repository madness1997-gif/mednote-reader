const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1440, height: 1000 } });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('same-Page Sheets switch between single and continuous views without duplicate toolbar CRUD', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'mednote-wave4-seeded') return;
    window.name = 'mednote-wave4-seeded';
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'wave4-sheet-1', title: 'Page đa tờ', titleHtml: 'Page đa tờ',
      body: 'Nội dung tờ đầu', bodyHtml: '<p>Nội dung tờ đầu</p>',
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'wave4-notebook', title: 'Wave 4', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'wave4-workspace', kind: 'empty', name: 'Wave 4', documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'wave4-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const toolbar = page.getByRole('toolbar', { name: 'Công cụ ghi chú' });
  const nav = page.locator('.note-sidebar-v6');
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await expect(toolbar.getByRole('button', { name: 'Thêm trang' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Xóa trang note' })).toHaveCount(0);
  await expect(toolbar.getByText('Sổ mới', { exact: true })).toHaveCount(0);
  await expect(toolbar.getByText('Xóa sổ', { exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Xuất note', exact: true })).toBeVisible();

  const firstSheetId = await page.locator('.note-paper.interactive').getAttribute('data-note-page-id');
  expect(firstSheetId).toBe('wave4-sheet-1');
  await nav.getByRole('button', { name: 'Thêm tờ vào Page đa tờ' }).click();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'Page đa tờ' })).toContainText('2 tờ');
  const secondSheetId = await page.locator('.note-paper.interactive').getAttribute('data-note-page-id');
  expect(secondSheetId).not.toBe(firstSheetId);

  await toolbar.getByRole('button', { name: 'Liên tục' }).click();
  const stage = page.locator('.note-stage-continuous');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.note-paper')).toHaveCount(2);
  await expect(stage.getByRole('button', { name: 'Chỉnh sửa tờ 1' })).toBeVisible();

  const beforeScroll = await stage.evaluate((element) => { element.scrollTop = 180; return element.scrollTop; });
  await stage.getByRole('button', { name: 'Chỉnh sửa tờ 1' }).evaluate((button) => button.click());
  await expect(page.locator(`.note-paper.interactive[data-note-page-id="${firstSheetId}"]`)).toBeVisible();
  await expect(stage.locator('.note-paper')).toHaveCount(2);
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(Math.max(0, beforeScroll - 2));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.note-stage-continuous')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.note-stage-continuous .note-paper')).toHaveCount(2);

  await page.getByRole('toolbar', { name: 'Công cụ ghi chú' }).getByRole('button', { name: 'Từng trang' }).click();
  await expect(page.locator('.note-stage-single .note-paper')).toHaveCount(1);
});
