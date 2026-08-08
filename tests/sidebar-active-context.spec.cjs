const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 980, height: 1500 },
  hasTouch: true,
  isMobile: false,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('OneNote sidebar survives reload after the app migrates its state to IndexedDB v3', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed only the first navigation. On reload the app must restore from
    // IndexedDB while localStorage contains only the indexeddb-v3 marker.
    if (sessionStorage.getItem('sidebar-indexeddb-seeded') === '1') return;
    localStorage.clear();
    sessionStorage.setItem('sidebar-indexeddb-seeded', '1');

    const now = Date.now();
    const notePage = {
      id: 'persisted-page-1',
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
      id: 'persisted-notebook-1',
      title: 'Sổ 2 — Ghi chú — dc260043',
      pages: [notePage],
      activePageId: notePage.id,
      createdAt: now,
    };
    const document = {
      id: 'persisted-document-1',
      name: 'dc260043.pdf',
      size: 123456,
      lastModified: now,
      reader: { page: 1, zoom: 1, fitMode: 'page', rotation: 0, viewMode: 'single', bookmarks: [], annotations: [] },
    };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'persisted-workspace-1',
        kind: 'document',
        name: 'Sổ 2 — Ghi chú — dc260043',
        documents: [document],
        activeDocumentId: document.id,
        notebooks: [notebook],
        activeNotebookId: notebook.id,
        sourcePage: 1,
      }],
      activeWorkspaceId: 'persisted-workspace-1',
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

  // Wait for incremental persistence to finish and deliberately replace the
  // legacy full snapshot with the small marker used on real devices.
  await expect.poll(async () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('mednote-library-v2') || '{}').storage || ''; }
    catch { return ''; }
  }), { timeout: 12_000 }).toBe('indexeddb-v3');

  // This is the important load: no full app state exists in localStorage now.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 12_000 });
  await expect(page.locator('.notes-pane')).toBeVisible({ timeout: 12_000 });
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await expect(nav.locator('[data-notebook-select]')).toHaveValue('persisted-notebook-1');

  // Keep it on screen across several navigator maintenance cycles.
  await page.waitForTimeout(4_000);
  await expect(nav).toBeVisible();

  const marker = await page.evaluate(() => JSON.parse(localStorage.getItem('mednote-library-v2') || '{}'));
  expect(marker.storage).toBe('indexeddb-v3');
  expect(marker.workspaces).toBeUndefined();

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(190);
  expect(box.x).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThanOrEqual(981);
});
