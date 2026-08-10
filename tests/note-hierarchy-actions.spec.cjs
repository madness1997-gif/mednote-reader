const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 1280, height: 900 } });

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function submitName(page, trigger, answer) {
  await trigger.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(answer);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.note-sidebar-v6')).toBeVisible({ timeout: 10_000 });
}

async function reloadAndFindNavigator(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const nav = page.locator('.note-sidebar-v6');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  return nav;
}

test('v6 CRUD for Notebook, Section, Page, and Sheet survives reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notePage = {
      id: 'hierarchy-page-1', title: 'Trang khởi đầu', titleHtml: 'Trang khởi đầu',
      body: 'Nội dung kiểm thử cấu trúc ghi chú', bodyHtml: '<p>Nội dung kiểm thử cấu trúc ghi chú</p>',
      citationPage: null, strokes: [], excerpts: [],
      paper: { size: 'a4', orientation: 'portrait', template: 'blank', color: 'white' },
      text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
    };
    const notebook = { id: 'hierarchy-notebook-1', title: 'Sổ lâm sàng', pages: [notePage], activePageId: notePage.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'hierarchy-workspace-1', kind: 'empty', name: notebook.title, documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'hierarchy-workspace-1', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  let nav = page.locator('.note-sidebar-v6');
  await expect(nav).toBeVisible({ timeout: 10_000 });
  await expect(nav.locator('.note-sidebar-section-open', { hasText: 'Phần 1' })).toBeVisible();

  await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Sổ Nội tiết');
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Sổ Nội tiết');
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Sổ Nội tiết');

  await submitName(page, nav.getByRole('button', { name: 'Thêm Section' }), 'Nội tiết');
  await expect(nav.locator('.note-sidebar-section-open', { hasText: 'Nội tiết' })).toBeVisible();
  await nav.locator('.note-sidebar-section-open', { hasText: 'Nội tiết' }).click();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Nội tiết' })).toBeVisible();

  await submitName(page, nav.getByRole('button', { name: 'Thêm Page' }), 'Đái tháo đường');
  await expect(nav.locator('.note-sidebar-page', { hasText: 'Đái tháo đường' })).toBeVisible();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page', { hasText: 'Đái tháo đường' })).toBeVisible();

  await submitName(page, nav.getByRole('button', { name: 'Đổi tên Đái tháo đường' }), 'ĐTĐ type 2');
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');

  let titleEditor = page.locator('[data-page-title-editor]');
  await titleEditor.evaluate((element) => element.setAttribute('contenteditable', 'true'));
  await titleEditor.fill('ĐTĐ canvas');
  await titleEditor.blur();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toBeVisible();

  await nav.getByRole('button', { name: 'Thêm tờ vào ĐTĐ canvas' }).click();
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toContainText('2 tờ');
  await nav.locator('.note-sidebar-sheet-open', { hasText: 'Tờ 2' }).click();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ canvas');

  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ canvas' })).toContainText('2 tờ');
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ canvas');

  await submitName(page, nav.getByRole('button', { name: 'Đổi tên ĐTĐ canvas' }), 'ĐTĐ type 2');
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toBeVisible();
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');

  await submitName(page, nav.getByRole('button', { name: 'Đổi tên Nội tiết' }), 'Chuyển hóa');
  await expect(nav.locator('.note-sidebar-section-open', { hasText: 'Chuyển hóa' })).toBeVisible();
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-section-open', { hasText: 'Chuyển hóa' })).toBeVisible();

  await nav.getByRole('button', { name: 'Thao tác Notebook' }).click();
  await submitName(page, nav.getByRole('button', { name: 'Đổi tên Notebook' }), 'Nội tiết học');
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Nội tiết học');
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Nội tiết học');

  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
  nav = await reloadAndFindNavigator(page);
  await expect(nav.locator('.note-sidebar-page.active', { hasText: 'ĐTĐ type 2' })).toContainText('2 tờ');
  await expect(page.locator('[data-page-title-editor]')).toHaveText('ĐTĐ type 2');
});
