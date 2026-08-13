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
        id: 'table-block', type: 'table', rows: [['', ''], ['', '']], rowsHtml: [['', ''], ['', '']],
        columnWidths: [.5, .5], rowHeights: [26, 26],
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

test('First Aid table cells stay empty and row/column separators are draggable', async ({ page }) => {
  const block = page.locator('.fa-block-table');
  const grid = block.locator('.fa-table-grid');
  await expect(grid).toBeVisible({ timeout: 12_000 });
  await grid.getByRole('textbox', { name: 'Ô 1, 1' }).click();
  await expect(block).toHaveClass(/selected/);
  await block.hover();

  await block.getByRole('button', { name: 'Thêm hàng' }).click();
  await block.hover();
  await block.getByRole('button', { name: 'Thêm cột' }).click();
  await expect(grid.locator('.fa-table-cell-wrap')).toHaveCount(9);
  await expect(grid.locator('.fa-rich-editor')).toHaveText(['', '', '', '', '', '', '', '', '']);

  const cells = grid.locator('.fa-table-cell-wrap');
  const firstWidth = (await cells.nth(0).boundingBox()).width;
  const columnHandle = grid.getByRole('button', { name: 'Đổi độ rộng cột 1' });
  const columnBox = await columnHandle.boundingBox();
  const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className || '', {
    x: columnBox.x + columnBox.width / 2,
    y: columnBox.y + 12,
  });
  expect(hitTarget).toContain('fa-table-column-resizer');
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2 + 55, columnBox.y + 12, { steps: 5 });
  await page.mouse.up();
  expect((await cells.nth(0).boundingBox()).width).toBeGreaterThan(firstWidth + 30);

  const firstHeight = (await cells.nth(0).boundingBox()).height;
  const rowHandle = grid.getByRole('button', { name: 'Đổi chiều cao hàng 1' });
  const rowBox = await rowHandle.boundingBox();
  await page.mouse.move(rowBox.x + 18, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox.x + 18, rowBox.y + rowBox.height / 2 + 32, { steps: 5 });
  await page.mouse.up();
  expect((await cells.nth(0).boundingBox()).height).toBeGreaterThan(firstHeight + 20);
});
