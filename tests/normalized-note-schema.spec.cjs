const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('v5 migrates old logical pages into normalized Page and Sheet records', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    const now = Date.now();
    const base = {
      body: '', bodyHtml: '', citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const sheet1 = {
      ...base, id: 'schema-sheet-1', title: 'Đái tháo đường', titleHtml: 'Đái tháo đường',
      body: 'Nội dung sheet 1', bodyHtml: '<p>Nội dung sheet 1</p>',
      logicalPageId: 'schema-page-1', logicalPageTitle: 'Đái tháo đường', sheetTitle: 'Tờ 1', sheetOrder: 0,
    };
    const sheet2 = {
      ...base, id: 'schema-sheet-2', title: 'Đái tháo đường', titleHtml: 'Đái tháo đường',
      body: 'Nội dung sheet 2', bodyHtml: '<p>Nội dung sheet 2</p>',
      logicalPageId: 'schema-page-1', logicalPageTitle: 'Đái tháo đường', sheetTitle: 'Tờ 2', sheetOrder: 1,
    };
    const notebook = { id: 'schema-notebook-1', title: 'Nội tiết', pages: [sheet1, sheet2], activePageId: sheet2.id, createdAt: now };
    const document = {
      id: 'schema-document-1', name: 'ADA.pdf', size: 1024, lastModified: now,
      reader: { page: 1, zoom: 1, fitMode: 'page', rotation: 0, viewMode: 'single', bookmarks: [], annotations: [] },
    };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'schema-context-1', kind: 'document', name: 'ADA', documents: [document], activeDocumentId: document.id,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'schema-context-1', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
    localStorage.setItem('mednote-relations-v2', JSON.stringify({
      version: 2,
      documents: [{ id: document.id, name: document.name, size: document.size, lastModified: now, available: true }],
      groups: [],
      notebooks: [{
        id: notebook.id, title: notebook.title, workspaceId: 'relation-note:schema-notebook-1',
        sections: [{ id: 'schema-section-1', title: 'Chuyển hóa', pageIds: [sheet1.id, sheet2.id], createdAt: now, updatedAt: now }],
        activeSectionId: 'schema-section-1', available: true, updatedAt: now,
      }],
      relations: [{
        id: 'old-link', kind: 'workspace', source: { type: 'document', id: document.id },
        target: { type: 'page', id: 'schema-page-1', notebookId: notebook.id, sectionId: 'schema-section-1', pageId: sheet1.id, logicalPageId: 'schema-page-1', scope: 'page' },
        isDefault: true, createdAt: now, updatedAt: now,
      }],
      updatedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 12_000 });

  await expect.poll(async () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mednote-local', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (key) => new Promise((resolve, reject) => {
      const request = db.transaction('documents', 'readonly').objectStore('documents').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    const result = {
      meta: await read('library:v5:meta'),
      notebook: await read('library:v5:notebook:schema-notebook-1'),
      section: await read('library:v5:section:schema-section-1'),
      page: await read('library:v5:page:schema-page-1'),
      sheet1: await read('library:v5:sheet:schema-sheet-1'),
      sheet2: await read('library:v5:sheet:schema-sheet-2'),
      legacyMeta: await read('library:v3:meta'),
    };
    db.close();
    return result;
  }), { timeout: 12_000 }).toMatchObject({
    meta: {
      version: 5,
      activeNotebookId: 'schema-notebook-1', activeSectionId: 'schema-section-1',
      activePageId: 'schema-page-1', activeSheetId: 'schema-sheet-2',
    },
    notebook: { id: 'schema-notebook-1', title: 'Nội tiết' },
    section: { id: 'schema-section-1', notebookId: 'schema-notebook-1', title: 'Chuyển hóa', order: 0 },
    page: { id: 'schema-page-1', sectionId: 'schema-section-1', title: 'Đái tháo đường', order: 0 },
    sheet1: { id: 'schema-sheet-1', pageId: 'schema-page-1', order: 0, content: { body: 'Nội dung sheet 1' } },
    sheet2: { id: 'schema-sheet-2', pageId: 'schema-page-1', order: 1, content: { body: 'Nội dung sheet 2' } },
    legacyMeta: null,
  });

  const records = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('mednote-local', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const read = (key) => new Promise((resolve, reject) => { const request = db.transaction('documents', 'readonly').objectStore('documents').get(key); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
    const result = {
      meta: await read('library:v5:meta'),
      sheet1: await read('library:v5:sheet:schema-sheet-1'),
      sheet2: await read('library:v5:sheet:schema-sheet-2'),
    };
    db.close();
    return result;
  });

  const normalized = records;
  for (const sheet of [normalized.sheet1, normalized.sheet2]) {
    expect(sheet.content).not.toHaveProperty('logicalPageId');
    expect(sheet.content).not.toHaveProperty('logicalPageTitle');
    expect(sheet.content).not.toHaveProperty('title');
    expect(sheet.content).not.toHaveProperty('sheetOrder');
  }

  const meta = normalized.meta;
  expect(meta.linkIds).toHaveLength(1);
  const link = await page.evaluate(async (key) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('mednote-local', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = await new Promise((resolve, reject) => { const request = db.transaction('documents', 'readonly').objectStore('documents').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return result;
  }, `library:v5:note-document-link:${meta.linkIds[0]}`);
  expect(link).toMatchObject({ documentId: 'schema-document-1', targetType: 'page', targetId: 'schema-page-1' });
});
