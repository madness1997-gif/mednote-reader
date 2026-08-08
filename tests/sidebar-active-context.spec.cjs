const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 980, height: 1500 },
  hasTouch: true,
  isMobile: false,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('OneNote sidebar follows React fallbacks when active workspace and notebook ids are stale', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'stale-page-1',
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
      id: 'real-notebook-1',
      title: 'Sổ 2 — Ghi chú — dc260043',
      pages: [notePage],
      activePageId: notePage.id,
      createdAt: now,
    };
    const document = {
      id: 'document-1',
      name: 'dc260043.pdf',
      size: 123456,
      lastModified: now,
      reader: { page: 1, zoom: 1, fitMode: 'page', rotation: 0, viewMode: 'single', bookmarks: [], annotations: [] },
    };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'workspace-1',
        kind: 'document',
        name: 'Sổ 2 — Ghi chú — dc260043',
        documents: [document],
        activeDocumentId: document.id,
        notebooks: [notebook],
        // Both IDs are deliberately stale. React renders workspaces[0] and
        // notebooks[0]; the OneNote navigator must use the same fallbacks.
        activeNotebookId: 'stale-missing-notebook-id',
        sourcePage: 1,
      }],
      activeWorkspaceId: 'stale-missing-workspace-id',
      readerShare: 50,
      workspaceMode: 'note',
      noteZoom: 1,
      savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const host = page.locator('.note-navigation-host');
  const nav = host.locator(':scope > .mednote-page-sheet-nav');

  await expect(page.locator('.notes-pane')).toBeVisible({ timeout: 12_000 });
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await page.waitForTimeout(4_000);
  await expect(nav).toBeVisible();
  await expect(nav.locator('[data-notebook-select]')).toHaveValue('real-notebook-1');

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(190);
  expect(box.x).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThanOrEqual(981);
});
