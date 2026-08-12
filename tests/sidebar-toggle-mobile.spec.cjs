const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'mobile-page', title: 'Trang kiểm tra', titleHtml: 'Trang kiểm tra', body: 'Nội dung', bodyHtml: '<p>Nội dung</p>',
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'mobile-notebook', title: 'Sổ kiểm tra', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'mobile-workspace', kind: 'empty', name: notebook.title, documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'mobile-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });
  await page.goto('http://127.0.0.1:4173/mednote-reader/', { waitUntil: 'domcontentloaded' });
});

test('Note sidebar toggle stays in the same thumb area on mobile', async ({ page }) => {
  const close = page.getByRole('button', { name: 'Ẩn thanh điều hướng Note' });
  await expect(close).toBeVisible({ timeout: 12_000 });
  const closeBox = await close.boundingBox();
  expect(closeBox).not.toBeNull();

  await close.click();
  const show = page.getByRole('button', { name: 'Hiện thanh điều hướng Note' });
  await expect(show).toBeVisible();
  const showBox = await show.boundingBox();
  expect(showBox).not.toBeNull();
  expect(showBox.x).toBeGreaterThanOrEqual(0);
  expect(showBox.x + showBox.width).toBeLessThanOrEqual(390);
  expect(Math.abs((showBox.x + showBox.width / 2) - (closeBox.x + closeBox.width / 2))).toBeLessThan(70);
  expect(Math.abs((showBox.y + showBox.height / 2) - (closeBox.y + closeBox.height / 2))).toBeLessThan(20);
});
