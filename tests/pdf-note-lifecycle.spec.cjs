const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

test.use({ viewport: { width: 1280, height: 900 } });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function indexedRecord(page, key) {
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

test('preview, PDF persistence, note creation, and PDF deletion remain independent', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = await pdf.save();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'independent.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes),
  });
  const destinationDialog = page.locator('.mednote-note-destination');
  await expect(destinationDialog).toBeVisible();
  await destinationDialog.locator('input[name="mode"][value="none"]').check();
  await destinationDialog.locator('button[type="submit"]').click();

  await expect(page.locator('.save-session-button', { hasText: 'Lưu vào thư viện' })).toBeVisible();
  await expect(page.locator('.autosave-status')).toContainText('không lưu, không tạo note');
  expect(await pdfKeys(page)).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('mednote-document-runtime-v1') || 'null');
    return snapshot?.workspaces?.some((workspace) => workspace.kind === 'temporary') || false;
  })).toBe(false);

  await page.locator('.save-session-button', { hasText: 'Lưu vào thư viện' }).click();
  await expect(page.locator('.save-session-button', { hasText: 'Tạo note' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pdfKeys(page)).toHaveLength(1);

  await page.locator('.save-session-button', { hasText: 'Tạo note' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  const nav = page.locator('.note-sidebar-v6');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Ghi chú — independent');
  const linkedNotebookId = await nav.locator('select[aria-label="Notebook"]').inputValue();
  await expect.poll(() => indexedRecord(page, `library:v6:notebook:${linkedNotebookId}`)).toMatchObject({ title: 'Ghi chú — independent' });
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('mednote-document-runtime-v1') || 'null');
    return snapshot?.workspaces?.find((workspace) => workspace.documents?.some((document) => document.name === 'independent.pdf'))?.noteNotebookId || null;
  })).toBe(linkedNotebookId);

  await page.getByRole('button', { name: 'Mở thư viện' }).click();
  const pdfRow = page.locator('.library-row', { hasText: 'independent' }).first();
  page.once('dialog', (dialog) => dialog.accept());
  await pdfRow.locator('.library-delete').click();

  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 10_000 });
  await expect(page.locator('.note-sidebar-v6')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pdfKeys(page)).toEqual([]);
  await expect.poll(() => indexedRecord(page, `library:v6:notebook:${linkedNotebookId}`)).toMatchObject({ title: 'Ghi chú — independent' });
});

test('temporary PDF can create a persistent v6 Notebook without saving the PDF', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = await pdf.save();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'temporary-study.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes),
  });

  const dialog = page.locator('.mednote-note-destination');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="mode"][value="notebook"]').check();
  await dialog.locator('[data-title]').fill('Sổ từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();

  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/, { timeout: 10_000 });
  const selector = page.locator('.note-sidebar-v6 select[aria-label="Notebook"]');
  await expect(selector.locator('option:checked')).toHaveText('Sổ từ PDF tạm');
  const notebookId = await selector.inputValue();
  expect(await pdfKeys(page)).toEqual([]);
  await expect.poll(() => indexedRecord(page, `library:v6:notebook:${notebookId}`)).toMatchObject({ title: 'Sổ từ PDF tạm' });
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('mednote-document-runtime-v1') || 'null');
    return snapshot?.workspaces?.some((workspace) => workspace.kind === 'temporary') || false;
  })).toBe(false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/, { timeout: 10_000 });
  await expect(page.locator('.note-sidebar-v6 select[aria-label="Notebook"] option:checked')).toHaveText('Sổ từ PDF tạm');
  expect(await pdfKeys(page)).toEqual([]);
});

test('temporary PDF can create a v6 Page or Section in an existing Notebook', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'destination-page-1', title: 'Trang nền', titleHtml: 'Trang nền', body: '', bodyHtml: '',
      citationPage: null, strokes: [], excerpts: [],
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
  await expect(page.locator('.note-sidebar-v6 select[aria-label="Notebook"] option:checked')).toHaveText('Sổ nền');

  await page.locator('input[data-pdf-input="preview"]').setInputFiles({ name: 'page-target.pdf', mimeType: 'application/pdf', buffer: bytes });
  let dialog = page.locator('.mednote-note-destination');
  await dialog.locator('input[name="mode"][value="page"]').check();
  await dialog.locator('[data-notebook]').selectOption('destination-notebook-1');
  await dialog.locator('[data-title]').fill('Page từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  await expect(page.locator('.note-sidebar-page', { hasText: 'Page từ PDF tạm' })).toBeVisible();
  expect(await pdfKeys(page)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(page.locator('.note-sidebar-page', { hasText: 'Page từ PDF tạm' })).toBeVisible();

  await page.locator('input[data-pdf-input="preview"]').setInputFiles({ name: 'section-target.pdf', mimeType: 'application/pdf', buffer: bytes });
  dialog = page.locator('.mednote-note-destination');
  await dialog.locator('input[name="mode"][value="section"]').check();
  await dialog.locator('[data-notebook]').selectOption('destination-notebook-1');
  await dialog.locator('[data-title]').fill('Section từ PDF tạm');
  await dialog.locator('button[type="submit"]').click();
  await expect(page.locator('.note-sidebar-section.active', { hasText: 'Section từ PDF tạm' })).toBeVisible();
  await expect(page.locator('.note-sidebar-page', { hasText: 'section-target' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.note-sidebar-section.active', { hasText: 'Section từ PDF tạm' })).toBeVisible();
  await expect(page.locator('.note-sidebar-page', { hasText: 'section-target' })).toBeVisible();
  expect(await pdfKeys(page)).toEqual([]);
});
