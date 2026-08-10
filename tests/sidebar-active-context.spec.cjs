const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 980, height: 1500 }, hasTouch: true, isMobile: false });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

function legacySnapshot() {
  const now = Date.now();
  const paper = { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' };
  const text = { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' };
  const pages = [
    {
      id: 'lazy-render-page-1', title: 'Trang đang mở', titleHtml: 'Trang đang mở',
      body: 'ACTIVE_RENDER_CONTENT', bodyHtml: '<p>ACTIVE_RENDER_CONTENT</p>',
      citationPage: null, strokes: [], excerpts: [], paper, text,
    },
    {
      id: 'lazy-render-page-2', title: 'Trang lazy', titleHtml: 'Trang lazy',
      body: 'LAZY_RENDER_CONTENT', bodyHtml: '<p>LAZY_RENDER_CONTENT</p>',
      citationPage: null, strokes: [], excerpts: [], paper, text,
    },
  ];
  const notebook = { id: 'lazy-render-notebook', title: 'Sổ lazy render', pages, activePageId: pages[0].id, createdAt: now };
  return {
    workspaces: [{
      id: 'lazy-render-workspace', kind: 'empty', name: notebook.title, documents: [], activeDocumentId: null,
      notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
    }],
    activeWorkspaceId: 'lazy-render-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
  };
}

async function readV6(page, key) {
  return page.evaluate(async (recordKey) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mednote-local', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('documents', 'readonly').objectStore('documents').get(recordKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, key);
}

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];
  page.__mednoteRuntimeErrors = runtimeErrors;
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('pageerror', (error) => runtimeErrors.push(error.stack || error.message));
  const snapshot = legacySnapshot();
  await page.addInitScript((seed) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('mednote-library-v2', JSON.stringify(seed));
  }, snapshot);
});

test.afterEach(async ({ page }) => {
  expect(page.__mednoteRuntimeErrors).toEqual([]);
});

test('v6 NoteStore survives reload with only the active Sheet hydrated', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const nav = page.locator('.note-sidebar-v6');
  await expect(nav).toBeVisible({ timeout: 12_000 });
  await expect(nav.locator('select[aria-label="Notebook"]')).toHaveValue('lazy-render-notebook');

  await expect.poll(() => readV6(page, 'library:v6:meta'), { timeout: 12_000 }).toMatchObject({
    version: 6,
    active: { activeNotebookId: 'lazy-render-notebook', activeSheetId: 'lazy-render-page-1' },
  });
  await expect.poll(() => readV6(page, 'library:v6:sheet-content:lazy-render-page-2')).toMatchObject({ body: 'LAZY_RENDER_CONTENT' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 12_000 });
  await expect(page.locator('.note-sidebar-v6')).toBeVisible();
  await expect(page.locator('[data-note-page-id="lazy-render-page-1"] .note-editor')).toContainText('ACTIVE_RENDER_CONTENT');
  await expect(page.locator('[data-note-page-id="lazy-render-page-2"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__MEDNOTE_LIVE_STATE__)).toBeUndefined();

  const documentRuntime = await page.evaluate(() => JSON.parse(localStorage.getItem('mednote-document-runtime-v1') || 'null'));
  expect(JSON.stringify(documentRuntime)).not.toContain('ACTIVE_RENDER_CONTENT');
  expect(JSON.stringify(documentRuntime)).not.toContain('LAZY_RENDER_CONTENT');
});

test('opening a lazy Sheet hydrates it without reload or React update loop', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.note-sidebar-v6')).toBeVisible({ timeout: 12_000 });
  const token = await page.evaluate(() => {
    window.__wave2NavigationToken = crypto.randomUUID();
    return window.__wave2NavigationToken;
  });

  await page.locator('.note-sidebar-page-open', { hasText: 'Trang lazy' }).click();
  await expect(page.locator('[data-note-page-id="lazy-render-page-2"] .note-editor')).toContainText('LAZY_RENDER_CONTENT', { timeout: 12_000 });
  expect(await page.evaluate(() => window.__wave2NavigationToken)).toBe(token);
  await expect.poll(() => readV6(page, 'library:v6:meta')).toMatchObject({
    version: 6,
    active: { activePageId: 'lazy-render-page-2', activeSheetId: 'lazy-render-page-2' },
  });
  await page.waitForTimeout(2_000);
});
