const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1440, height: 1050 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'figure-sheet', title: 'LIPOPROTEIN', titleHtml: 'LIPOPROTEIN', body: '', bodyHtml: '',
      firstAid: { version: 1, blocks: [{
        id: 'figure-text-block', type: 'figure-text', text: 'Chức năng vận chuyển cholesterol',
        textHtml: '<div>Chức năng vận chuyển cholesterol</div>', caption: 'VLDL và LDL', imageSide: 'left', imageWidthRatio: .4,
      }] },
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'figure-notebook', title: 'Lipid', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'figure-workspace', kind: 'empty', name: 'Lipid', documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'figure-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
});

test('First Aid figure-text width is directly draggable and retained by the block', async ({ page }) => {
  const block = page.locator('.fa-block-figure-text');
  const figure = block.locator('.fa-figure-block');
  const text = block.getByRole('textbox', { name: 'Nội dung cạnh hình' });
  await expect(block).toBeVisible({ timeout: 12_000 });
  await text.click();
  await expect(block).toHaveClass(/selected/);

  const initialWidth = (await figure.boundingBox()).width;
  const handle = block.getByRole('button', { name: /Đổi độ rộng vùng hình/ });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2, { steps: 6 });
  await page.mouse.up();

  expect((await figure.boundingBox()).width).toBeGreaterThan(initialWidth + 60);
  await expect(handle).toHaveAttribute('aria-label', /hiện 5[0-9]%/);

  const labelBeforeKeyboard = await handle.getAttribute('aria-label');
  await handle.press('ArrowRight');
  await expect(handle).not.toHaveAttribute('aria-label', labelBeforeKeyboard);
});
