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
  const destinationDialog = page.locator('.mednote-note-destination');
  await expect(destinationDialog).toBeVisible();
  await destinationDialog.locator('input[name="mode"][value="none"]').check();
  await destinationDialog.locator('button[type="submit"]').click();
  await expect(destinationDialog).toBeHidden();

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
  await expect.poll(() => page.evaluate(() => {
    const workspace = window.__MEDNOTE_LIVE_STATE__.workspaces.find((item) => item.documents?.length === 0
      && item.notebooks?.some((notebook) => notebook.title === 'Ghi chú — independent'));
    const notebook = workspace?.notebooks.find((item) => item.title === 'Ghi chú — independent');
    return workspace && notebook
      ? { documents: workspace.documents.length, detached: notebook.pages.every((notePage) => notePage.citationPage === null) }
      : null;
  })).toEqual({ documents: 0, detached: true });
});

test('temporary PDF can create a persistent notebook without saving the PDF', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = await pdf.save();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'temporary-study.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });

  const dialog = page.locator('.mednote-note-destination');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="mode"][value="notebook"]').check();
  await dialog.locator('[data-title]').fill('Sổ từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();

  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/, { timeout: 10_000 });
  await expect(page.locator('.mednote-page-sheet-nav [data-notebook-select] option:checked')).toHaveText('Sổ từ PDF tạm');
  expect(await pdfKeys(page)).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const state = window.__MEDNOTE_LIVE_STATE__;
    return !state.workspaces.some((workspace) => workspace.kind === 'temporary')
      && state.workspaces.some((workspace) => workspace.documents.length === 0
        && workspace.notebooks.some((notebook) => notebook.title === 'Sổ từ PDF tạm'));
  })).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 10_000 });
  await expect(page.locator('.mednote-page-sheet-nav [data-notebook-select] option:checked')).toHaveText('Sổ từ PDF tạm');
  expect(await pdfKeys(page)).toEqual([]);
});

test('temporary PDF can create a Page or Section in an existing notebook', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('pdf-destination-seeded') === '1') return;
    localStorage.clear();
    sessionStorage.setItem('pdf-destination-seeded', '1');
    const now = Date.now();
    const notePage = {
      id: 'destination-page-1',
      title: 'Trang nền',
      titleHtml: 'Trang nền',
      body: '',
      bodyHtml: '',
      citationPage: null,
      strokes: [],
      excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'destination-notebook-1', title: 'Sổ nền', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'destination-workspace-1', kind: 'empty', name: notebook.title, documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'destination-workspace-1', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });

  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = Buffer.from(await pdf.save());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mednote-page-sheet-nav [data-notebook-select] option:checked')).toHaveText('Sổ nền');

  await page.locator('input[data-pdf-input="preview"]').setInputFiles({ name: 'page-target.pdf', mimeType: 'application/pdf', buffer: bytes });
  let dialog = page.locator('.mednote-note-destination');
  await dialog.locator('input[name="mode"][value="page"]').check();
  await dialog.locator('[data-notebook]').selectOption('destination-notebook-1');
  await dialog.locator('[data-title]').fill('Page từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  await expect(page.locator('.mednote-page-sheet-nav .mps-page-card', { hasText: 'Page từ PDF tạm' })).toBeVisible();
  expect(await pdfKeys(page)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(page.locator('.mednote-page-sheet-nav .mps-page-card', { hasText: 'Page từ PDF tạm' })).toBeVisible();

  await page.locator('input[data-pdf-input="preview"]').setInputFiles({ name: 'section-target.pdf', mimeType: 'application/pdf', buffer: bytes });
  dialog = page.locator('.mednote-note-destination');
  await dialog.locator('input[name="mode"][value="section"]').check();
  await dialog.locator('[data-notebook]').selectOption('destination-notebook-1');
  await dialog.locator('[data-title]').fill('Section từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();
  await expect(page.locator('.mednote-page-sheet-nav .mps-section strong', { hasText: 'Section từ PDF tạm' })).toBeVisible();
  await expect(page.locator('.mednote-page-sheet-nav .mps-page-card', { hasText: 'section-target' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mednote-page-sheet-nav .mps-section strong', { hasText: 'Section từ PDF tạm' })).toBeVisible();
  await expect(page.locator('.mednote-page-sheet-nav .mps-page-card', { hasText: 'section-target' })).toBeVisible();
  expect(await pdfKeys(page)).toEqual([]);
});
