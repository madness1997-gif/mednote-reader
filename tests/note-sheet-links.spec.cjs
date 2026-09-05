const { test, expect } = require('@playwright/test');
const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';
test.use({ viewport: { width: 1440, height: 1050 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name === 'mednote-wave4-seeded') return;
    window.name = 'mednote-wave4-seeded';
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'wave4-sheet-1', title: 'Page đa tờ', titleHtml: 'Page đa tờ',
      body: 'Nội dung tờ đầu', bodyHtml: '<p>Nội dung tờ đầu</p>',
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'wave4-notebook', title: 'Wave 4', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'wave4-workspace', kind: 'empty', name: 'Wave 4', documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'wave4-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
 });

for (const selected of [false, true]) {
  test(`sheet link opens and inserts with ${selected ? 'selected text' : 'no prior caret'}`, async ({ page }) => {
    const editor = page.locator('.note-paper.interactive .note-editor');
    await expect(editor).toContainText('Nội dung tờ đầu');
    if (selected) {
      await editor.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      });
    }
    await page.getByRole('button', { name: 'Liên kết đến sheet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Liên kết đến sheet', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Sheet đích', { exact: true }).selectOption('wave4-sheet-1');
    const label = selected ? 'Nội dung tờ đầu' : 'Page đa tờ · Tờ 1';
    await expect(dialog.getByLabel('Chữ hiển thị')).toHaveValue(label);
    await dialog.getByRole('button', { name: 'Chèn liên kết', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editor.locator('a')).toHaveText(label);
    await expect(editor.locator('a')).toHaveAttribute('href', '#mednote-sheet=wave4-sheet-1');
    if (!selected) await expect(editor).toContainText('Nội dung tờ đầu');
    await expect.poll(() => page.evaluate(async () => {
      const { IndexedDbNoteRepository } = await import('/mednote-reader/app/indexeddb-note-repository.ts');
      return (await new IndexedDbNoteRepository().loadSheetContent('wave4-sheet-1'))?.bodyHtml;
    })).toContain('#mednote-sheet=wave4-sheet-1');
    await page.reload();
    await expect(page.locator('.note-paper.interactive .note-editor a')).toHaveText(label);
  });
}
