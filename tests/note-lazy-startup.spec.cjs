const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';
test.use({ viewport: { width: 1440, height: 1000 } });

for (const viewMode of ['single', 'continuous']) {
  test(`Reader startup and library browsing defer note content (${viewMode})`, async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator('.topbar').getByRole('button', { name: 'Mở PDF', exact: true })).toBeEnabled();
    await page.evaluate(async (viewMode) => {
      const { IndexedDbNoteRepository } = await import('/mednote-reader/app/indexeddb-note-repository.ts');
      const notebooks = ['a', 'b'].map((id, order) => ({ id, title: `Notebook ${id}`, order }));
      const sections = notebooks.map(({ id }) => ({ id: `section-${id}`, notebookId: id, title: 'Section', order: 0 }));
      const pages = notebooks.map(({ id }) => ({ id: `page-${id}`, sectionId: `section-${id}`, title: `Page ${id}`, order: 0 }));
      const sheets = notebooks.flatMap(({ id }) => [0, 1].map((order) => ({ id: `${id}-${order}`, pageId: `page-${id}`, order })));
      const sheetContents = Object.fromEntries(sheets.map(({ id }) => [id, {
        body: `Content ${id}`, bodyHtml: `<p>Content ${id}</p>`, strokes: [], excerpts: [],
        paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      }]));
      const repository = new IndexedDbNoteRepository();
      await repository.replaceLibrary({
        version: 6,
        notes: { workspace: { id: 'workspace', title: 'MedNote' }, notebooks, sections, pages, sheets,
          active: { activeNotebookId: 'a', activeSectionId: 'section-a', activePageId: 'page-a', activeSheetId: 'a-0' } },
        sheetContents,
        documents: {
          documents: [{ id: 'pdf', name: 'Example.pdf', size: 1, lastModified: 1, available: false, payload: {} }],
          contexts: [{ id: 'context', kind: 'document', name: 'Example', documentIds: ['pdf'], activeDocumentId: 'pdf', sourcePage: 1 }],
          groups: [], links: [], linkRelations: [],
        },
        preferences: { activeDocumentContextId: 'context', readerShare: 50, workspaceMode: 'reader', noteZoom: 1 },
        savedAt: 1,
      });
      localStorage.clear();
      localStorage.setItem('mednote-note-sheet-view-v1', viewMode);
    }, viewMode);
    await page.addInitScript(() => {
      window.noteContentReads = [];
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        if (String(key).startsWith('library:v6:sheet-content:')) window.noteContentReads.push(String(key));
        return get.call(this, key);
      };
    });
    await page.reload();
    await expect(page.locator('.topbar').getByRole('button', { name: 'Mở PDF', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reader', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Mở thư viện', exact: true }).click();
    const library = page.getByRole('complementary', { name: 'Thư viện tài liệu và ghi chú' });
    await expect(library.locator('.notebook-card')).toHaveCount(2);
    expect(await page.evaluate(() => window.noteContentReads)).toEqual([]);

    await library.locator('.library-item', { hasText: 'Notebook b' }).click();
    await expect(page.getByRole('button', { name: 'Vào nội dung', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.noteContentReads)).toEqual(['library:v6:sheet-content:b-0']);
    await page.getByRole('button', { name: 'Vào nội dung', exact: true }).click();
    await expect(page.locator('.note-paper.interactive .note-editor')).toHaveText('Content b-0');
    if (viewMode === 'continuous') {
      await expect(page.locator('.note-paper-preview')).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => [...new Set(window.noteContentReads)])).toEqual([
        'library:v6:sheet-content:b-0', 'library:v6:sheet-content:b-1',
      ]);
    } else {
      expect(await page.evaluate(() => window.noteContentReads)).toEqual(['library:v6:sheet-content:b-0']);
    }
    expect(await page.evaluate(() => window.noteContentReads.some((key) => key.includes(':a-')))).toBe(false);
  });
}
