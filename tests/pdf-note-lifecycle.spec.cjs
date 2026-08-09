const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

test.use({ viewport: { width: 1280, height: 900 } });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function pdfKeys(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mednote-local', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('documents', 'readonly').objectStore('documents').getAllKeys();
        request.onsuccess = () => resolve(request.result.filter((key) => String(key).startsWith('pdf:')));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test('preview stays temporary; saving, creating a note, and deleting the PDF are independent', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = await pdf.save();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'independent.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });

  await expect(page.locator('.save-session-button', { hasText: 'Lưu vào thư viện' })).toBeVisible();
  await expect(page.locator('.autosave-status')).toContainText('không lưu, không tạo note');
  await page.waitForTimeout(500);
  expect(await pdfKeys(page)).toEqual([]);
  const persistedWhilePreviewing = await page.evaluate(() => window.__MEDNOTE_LIVE_STATE__);
  expect(persistedWhilePreviewing.workspaces.some((workspace) => workspace.kind === 'temporary')).toBe(false);

  await page.locator('.save-session-button', { hasText: 'Lưu vào thư viện' }).click();
  await expect(page.locator('.save-session-button', { hasText: 'Tạo note' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pdfKeys(page)).toHaveLength(1);

  await page.locator('.save-session-button', { hasText: 'Tạo note' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const stateWithNote = await page.evaluate(() => window.__MEDNOTE_LIVE_STATE__);
  const savedWorkspace = stateWithNote.workspaces.find((workspace) => workspace.documents.some((document) => document.name === 'independent.pdf'));
  expect(savedWorkspace).toBeTruthy();
  expect(savedWorkspace.notebooks.some((notebook) => !notebook.id.startsWith('__mednote_reader_placeholder__:'))).toBe(true);

  await page.getByRole('button', { name: 'Mở thư viện' }).click();
  const pdfRow = page.locator('.library-row', { hasText: 'independent' }).first();
  await pdfRow.locator('.native-library-more').click();
  const deletePdf = pdfRow.locator('.library-delete');
  await expect(deletePdf).toBeVisible({ timeout: 10_000 });
  page.once('dialog', (dialog) => dialog.accept());
  await deletePdf.click();

  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 10_000 });
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pdfKeys(page)).toEqual([]);
  const independentState = await page.evaluate(() => window.__MEDNOTE_LIVE_STATE__);
  const independentNotebook = independentState.workspaces
    .find((workspace) => workspace.notebooks.some((notebook) => !notebook.id.startsWith('__mednote_reader_placeholder__:')));
  expect(independentNotebook.documents).toEqual([]);
  const realNotebook = independentNotebook.notebooks.find((notebook) => !notebook.id.startsWith('__mednote_reader_placeholder__:'));
  expect(realNotebook.pages.every((notePage) => notePage.citationPage === null)).toBe(true);
});
