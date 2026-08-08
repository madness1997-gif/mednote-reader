const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 980, height: 1500 },
  hasTouch: true,
  isMobile: false,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('OneNote sidebar survives an IndexedDB-only reload like the real phone session', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed only the first navigation. The second navigation must use IndexedDB.
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

  // Wait until the real incremental store contains this workspace.
  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mednote-local', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('documents', 'readonly').objectStore('documents').get('library:v3:meta');
        request.onsuccess = () => resolve(request.result?.activeWorkspaceId || '');
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }), { timeout: 12_000 }).toBe('persisted-workspace-1');

  // Force the exact persisted shape observed on the user's phone: IndexedDB owns
  // the full state and localStorage contains only the tiny marker.
  await page.evaluate(() => {
    localStorage.setItem('mednote-library-v2', JSON.stringify({ storage: 'indexeddb-v3', savedAt: Date.now() }));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 12_000 });
  await expect(page.locator('.notes-pane')).toBeVisible({ timeout: 12_000 });
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await expect(nav.locator('[data-notebook-select]')).toHaveValue('persisted-notebook-1');

  // Keep it on screen across several navigator maintenance cycles so a late
  // relation sync cannot turn it back into the blank right-hand strip.
  await page.waitForTimeout(4_000);
  await expect(nav).toBeVisible();

  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(190);
  expect(box.x).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThanOrEqual(981);
});
