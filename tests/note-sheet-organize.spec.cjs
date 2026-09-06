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
    const notebook = { id: 'wave4-notebook', title: 'Wave 4', pages: [notePage, { ...notePage, id: "sheet-dest", title: "Page đích", titleHtml: "Page đích" }], activePageId: notePage.id, createdAt: now };
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

test('rename a sheet and move its last source sheet through the destination picker', async ({ page }) => {
  const sidebar = page.locator('.note-sidebar');
  await sidebar.getByRole('button', { name: 'Đổi tên sheet Tờ 1', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tên sheet', exact: true }).fill('Phác đồ insulin');
  await page.locator('.mednote-native-dialog button.primary').click();
  await expect(sidebar.getByRole('button', { name: 'Phác đồ insulin', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Di chuyển sheet Phác đồ insulin', exact: true }).click();
  await page.locator('.mednote-native-dialog button.primary').click();
  await page.locator('.mednote-native-dialog button.primary').click();
  await expect(page.locator('.mednote-native-dialog select')).toBeVisible();
  await page.locator('.mednote-native-dialog button.primary').click();
  await expect(sidebar.locator('.note-sidebar-page.active')).toContainText('Page đích');
  await expect(sidebar.locator('.note-sidebar-sheet.active')).toContainText('Phác đồ insulin');
  await expect(page.locator('.note-paper.interactive')).toHaveAttribute('data-note-page-id', 'wave4-sheet-1');
  await page.reload();
  await expect(sidebar.locator('.note-sidebar-sheet.active')).toContainText('Phác đồ insulin');
});
