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
        const request = db.transaction('documents', 'readonly').objectStore('documents').get('library:v5:meta');
        request.onsuccess = () => resolve(request.result?.activeDocumentContextId || '');
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }), { timeout: 12_000 }).toBe('persisted-workspace-1');

  // Force the exact persisted shape observed on the user's phone: IndexedDB owns
  // the full state and localStorage contains only the tiny marker.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => {
      localStorage.setItem('mednote-library-v2', JSON.stringify({ storage: 'indexeddb-v5', savedAt: Date.now() }));
      window.location.reload();
    }),
  ]);
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

test('opening a lazy page renders its hydrated body without a React update loop', async ({ page }) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push({ text: message.text(), location: message.location() });
  });
  page.on('pageerror', (error) => browserErrors.push({ text: error.message, stack: error.stack }));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(async () => {
      const now = Date.now();
      const paper = { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' };
      const text = { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' };
      const notePage = {
        id: 'lazy-render-page-1', title: 'Trang đang mở', titleHtml: 'Trang đang mở',
        body: 'ACTIVE_RENDER_CONTENT', bodyHtml: '<p>ACTIVE_RENDER_CONTENT</p>',
        citationPage: null, strokes: [], excerpts: [], paper, text,
      };
      const lazyPage = {
        id: 'lazy-render-page-2', title: 'Trang lazy', titleHtml: 'Trang lazy',
        body: 'LAZY_RENDER_CONTENT', bodyHtml: '<p>LAZY_RENDER_CONTENT</p>',
        citationPage: null, strokes: [], excerpts: [], paper, text,
      };
      const summary = (item) => {
        const { body, bodyHtml, strokes, excerpts, ...rest } = item;
        return rest;
      };
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('mednote-local', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('documents', 'readwrite');
        const store = transaction.objectStore('documents');
        store.clear();
        store.put({
          version: 4, workspaceIds: ['lazy-render-workspace'],
          activeWorkspaceId: 'lazy-render-workspace', readerShare: 50,
          workspaceMode: 'note', noteZoom: 1, savedAt: now,
        }, 'library:v3:meta');
        store.put({
          id: 'lazy-render-workspace', kind: 'empty', name: 'Sổ lazy render',
          documents: [], activeDocumentId: null, activeNotebookId: 'lazy-render-notebook',
          sourcePage: 1, notebookIds: ['lazy-render-notebook'],
        }, 'library:v3:workspace:lazy-render-workspace');
        store.put({
          id: 'lazy-render-notebook', title: 'Sổ lazy render',
          activePageId: 'lazy-render-page-1', createdAt: now,
          pageIds: ['lazy-render-page-1', 'lazy-render-page-2'],
          pages: [summary(notePage), summary(lazyPage)],
        }, 'library:v3:notebook:lazy-render-notebook');
        store.put(notePage, 'library:v3:page:lazy-render-page-1');
        store.put(lazyPage, 'library:v3:page:lazy-render-page-2');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      db.close();
      localStorage.setItem('mednote-library-v2', JSON.stringify({ storage: 'indexeddb-v4', savedAt: now }));
      window.setTimeout(() => window.location.reload(), 0);
    }),
  ]);

  await expect.poll(() => page.evaluate(() => {
    const state = window.__MEDNOTE_LIVE_STATE__;
    const notebook = state?.workspaces?.find((item) => item.id === 'lazy-render-workspace')
      ?.notebooks?.find((item) => item.id === 'lazy-render-notebook');
    const page2 = notebook?.pages?.find((item) => item.id === 'lazy-render-page-2');
    return { activePageId: notebook?.activePageId, page2Lazy: page2?.__mednoteLazyPage === true, page2Body: page2?.body };
  }), { timeout: 12_000 }).toEqual({
    activePageId: 'lazy-render-page-1',
    page2Lazy: true,
    page2Body: '',
  });

  // Let the autosave run while page 2 is still a lazy shell. Its empty render
  // fields must not replace the full normalized Sheet.content in IndexedDB.
  await page.waitForTimeout(700);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('mednote-local', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const body = await new Promise((resolve, reject) => { const request = db.transaction('documents', 'readonly').objectStore('documents').get('library:v5:sheet:lazy-render-page-2'); request.onsuccess = () => resolve(request.result?.content?.body || ''); request.onerror = () => reject(request.error); });
    db.close();
    return body;
  }), { timeout: 12_000 }).toBe('LAZY_RENDER_CONTENT');

  await page.evaluate(() => {
    const next = structuredClone(window.__MEDNOTE_LIVE_STATE__);
    const target = next.workspaces.find((item) => item.id === 'lazy-render-workspace')
      ?.notebooks?.find((item) => item.id === 'lazy-render-notebook');
    target.activePageId = 'lazy-render-page-2';
    window.__MEDNOTE_LIVE_STATE__ = next;
    window.dispatchEvent(new CustomEvent('mednote-live-state-changed', { detail: { origin: 'navigation' } }));
  });
  await expect.poll(() => page.evaluate(() => {
    const state = window.__MEDNOTE_LIVE_STATE__;
    const notebook = state?.workspaces?.find((item) => item.id === 'lazy-render-workspace')
      ?.notebooks?.find((item) => item.id === 'lazy-render-notebook');
    const active = notebook?.pages?.find((item) => item.id === 'lazy-render-page-2');
    return {
      activePageId: notebook?.activePageId,
      lazy: active?.__mednoteLazyPage === true,
      body: active?.body,
      bodyHtml: active?.bodyHtml,
    };
  }), { timeout: 12_000 }).toEqual({
    activePageId: 'lazy-render-page-2',
    lazy: false,
    body: 'LAZY_RENDER_CONTENT',
    bodyHtml: '<p>LAZY_RENDER_CONTENT</p>',
  });
  await expect(page.locator('[data-note-page-id="lazy-render-page-2"] .note-editor')).toContainText('LAZY_RENDER_CONTENT');
  await page.waitForTimeout(2_000);
  expect(browserErrors).toEqual([]);
});
