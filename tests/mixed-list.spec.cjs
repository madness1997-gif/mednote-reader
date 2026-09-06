const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1440, height: 1050 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'table-sheet', title: 'BẢNG FIRST AID', titleHtml: 'BẢNG FIRST AID', body: '', bodyHtml: '',
      firstAid: { version: 1, blocks: [{
        id: 'text-block', type: 'text', textStyle: 'numbered', text: 'Cha\nCon\nTiếp',
        textHtml: '<ol><li><b>Cha</b><ol><li><i>Con</i></li></ol></li><li>Tiếp</li></ol>',
      }] },
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'table-notebook', title: 'Bảng', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'table-workspace', kind: 'empty', name: 'Bảng', documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'table-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
});

test('First Aid keeps mixed list levels and inline formatting when changing the selected level', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Đoạn hoặc danh sách', exact: true });
  await expect(editor).toBeVisible();
  await editor.locator('i').click();
  await page.getByRole('button', { name: '• Danh sách', exact: true }).click();
  await expect(editor.locator(':scope > ol')).toHaveCount(1);
  await expect(editor.locator('ol ul i')).toHaveText('Con');
  await expect(editor.locator('b')).toHaveText('Cha');
  await editor.locator('i').click();
  await page.getByRole('button', { name: '1. Đánh số', exact: true }).click();
  await expect(editor.locator('ol ol i')).toHaveText('Con');
  await editor.locator('i').click();
  await page.getByRole('button', { name: '• Danh sách', exact: true }).click();
  await editor.blur();
  await expect.poll(() => page.evaluate(async () => {
    const { IndexedDbNoteRepository } = await import('/mednote-reader/app/indexeddb-note-repository.ts');
    return JSON.stringify((await new IndexedDbNoteRepository().loadSheetContent('table-sheet'))?.firstAid);
  })).toContain('<ul>');
});

test('toolbar changes only the nested list kind and numbering style', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Đoạn hoặc danh sách', exact: true });
  await editor.locator('i').click();
  await page.getByRole('button', { name: '• Danh sách', exact: true }).click();
  await editor.locator('i').click();
  await page.getByRole('button', { name: 'Mở thư viện đánh số', exact: true }).click();
  await page.getByRole('button', { name: 'La Mã thường', exact: true }).click();
  await expect(editor.locator('ol ol')).toHaveCSS('list-style-type', 'lower-roman');
  await expect(editor.locator(':scope > ol')).toHaveCSS('list-style-type', 'decimal');
  await expect(editor.locator('ol ol i')).toHaveText('Con');
  await expect(editor.locator('b')).toHaveText('Cha');
});

test('outdent returns a bullet item to its numbered parent', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Đoạn hoặc danh sách', exact: true });
  await editor.locator('i').click();
  await page.getByRole('button', { name: '• Danh sách', exact: true }).click();
  await page.getByRole('button', { name: 'Giảm một cấp danh sách', exact: true }).click();
  await expect(editor.locator(':scope > ol > li > i')).toHaveText('Con');
});

for (const parentKind of ['ol', 'ul']) {
  for (const key of ['Shift+Tab', 'Enter']) {
    test(`return to ${parentKind} parent using ${key}`, async ({ page }) => {
      const editor = page.getByRole('textbox', { name: 'Đoạn hoặc danh sách', exact: true });
      await editor.locator('i').click();
      await editor.evaluate((element, parentKind) => {
        const child = parentKind === 'ol' ? 'ul' : 'ol';
        element.innerHTML = `<${parentKind} style="list-style-type:${parentKind === 'ol' ? 'upper-roman' : 'square'}"><li>Cha<${child}><li><i>Con</i></li></${child}></li><li>Tiếp</li></${parentKind}>`;
        element.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, parentKind);
      await editor.locator('i').click();
      await page.keyboard.press('End');
      if (key === 'Enter') await page.keyboard.press('Enter');
      await page.keyboard.press(key);
      await page.keyboard.type('Returned');
      const item = editor.locator(`:scope > ${parentKind} > li`).filter({ hasText: key === 'Enter' ? /^Returned$/ : /^ConReturned$/ });
      await expect(item).toHaveCount(1);
      await expect(item).toHaveCSS('list-style-type', parentKind === 'ol' ? 'upper-roman' : 'square');
      await expect(editor.locator('li > li')).toHaveCount(0);
    });
  }
}
