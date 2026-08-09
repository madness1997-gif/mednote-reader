const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1280, height: 900 } });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function promptAndReload(page, locator, answer) {
  page.once('dialog', (dialog) => dialog.accept(answer));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    locator.click(),
  ]);
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });
}

test('add and rename Notebook, Section, Page, and add Sheet survive every reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('hierarchy-actions-seeded') === '1') return;
    localStorage.clear();
    sessionStorage.setItem('hierarchy-actions-seeded', '1');
    const now = Date.now();
    const notePage = {
      id: 'hierarchy-page-1',
      title: 'Trang khởi đầu',
      titleHtml: 'Trang khởi đầu',
      body: 'Nội dung kiểm thử cấu trúc ghi chú',
      bodyHtml: '<p>Nội dung kiểm thử cấu trúc ghi chú</p>',
      citationPage: null,
      strokes: [],
      excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = {
      id: 'hierarchy-notebook-1',
      title: 'Sổ lâm sàng',
      pages: [notePage],
      activePageId: notePage.id,
      createdAt: now,
    };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'hierarchy-workspace-1',
        kind: 'empty',
        name: notebook.title,
        documents: [],
        activeDocumentId: null,
        notebooks: [notebook],
        activeNotebookId: notebook.id,
        sourcePage: 1,
      }],
      activeWorkspaceId: 'hierarchy-workspace-1',
      readerShare: 50,
      workspaceMode: 'note',
      noteZoom: 1,
      savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  let nav = page.locator('.mednote-page-sheet-nav');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await expect(nav.locator('.mps-section strong', { hasText: 'Phần 1' })).toBeVisible();

  await promptAndReload(page, nav.locator('[data-add-section]').first(), 'Nội tiết');
  nav = page.locator('.mednote-page-sheet-nav');
  await expect(nav.locator('.mps-section strong', { hasText: 'Nội tiết' })).toBeVisible();

  await promptAndReload(page, nav.locator('[data-add-page]').first(), 'Đái tháo đường');
  nav = page.locator('.mednote-page-sheet-nav');
  const pageCard = nav.locator('.mps-page-card', { hasText: 'Đái tháo đường' });
  await expect(pageCard).toBeVisible();

  await pageCard.locator(':scope > .mps-page-head > .mps-sidebar-more').click();
  await promptAndReload(page, pageCard.locator('[data-rename-page]'), 'ĐTĐ type 2');
  nav = page.locator('.mednote-page-sheet-nav');
  await expect(nav.locator('.mps-page-card', { hasText: 'ĐTĐ type 2' })).toBeVisible();

  const sectionRow = nav.locator('.mps-section', { hasText: 'Nội tiết' });
  await sectionRow.locator(':scope > .mps-sidebar-more').click();
  await promptAndReload(page, sectionRow.locator('[data-rename-section]'), 'Chuyển hóa');
  nav = page.locator('.mednote-page-sheet-nav');
  await expect(nav.locator('.mps-section strong', { hasText: 'Chuyển hóa' })).toBeVisible();

  await nav.locator('[data-page-sheet-notebook-more]').click();
  await promptAndReload(page, nav.locator('[data-page-sheet-notebook-rename]'), 'Nội tiết học');
  nav = page.locator('.mednote-page-sheet-nav');
  await expect(nav.locator('[data-notebook-select]')).toHaveValue('hierarchy-notebook-1');
  await expect(nav.locator('[data-notebook-select] option:checked')).toHaveText('Nội tiết học');

  await page.locator('[data-page-sheet-add-sheet]').click();
  await expect(page.locator('.mednote-page-sheet-nav')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.mednote-page-sheet-nav .mps-page-card.active')).toContainText('2 tờ');
});
