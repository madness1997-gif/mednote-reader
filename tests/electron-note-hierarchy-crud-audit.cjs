const { _electron: electron, expect } = require('@playwright/test');

const profile = `/tmp/mednote-electron-crud-audit-${Date.now()}`;

async function launch() {
  const application = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });
  application.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));
  return application;
}

async function ready(app) {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const nav = page.locator('.note-sidebar');
  await expect(nav).toBeVisible({ timeout: 20_000 });
  return { page, nav };
}

async function submitName(page, trigger, value) {
  await trigger.click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(value);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.note-sidebar')).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
}

async function acceptConfirm(page, action) {
  page.once('dialog', async (dialog) => {
    if (dialog.type() !== 'confirm') throw new Error(`Expected confirm, got ${dialog.type()}`);
    await dialog.accept();
  });
  await action();
  await expect(page.locator('.note-sidebar')).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });
}

async function restart(app) {
  await app.close();
  const next = await launch();
  const state = await ready(next);
  return { app: next, ...state };
}

async function ensureActivePageExpanded(nav, expectedSheetCount) {
  const row = nav.locator('.note-sidebar-page.active');
  const sheets = row.locator('.note-sidebar-sheet');
  if (await sheets.count() < expectedSheetCount) {
    const expand = row.getByRole('button', { name: 'Mở rộng Page' });
    if (await expand.count()) await expand.click();
  }
  await expect(sheets).toHaveCount(expectedSheetCount, { timeout: 10_000 });
  return sheets;
}

(async () => {
  let app = await launch();
  try {
    let { page, nav } = await ready(app);

    await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Audit Notebook');
    await nav.getByRole('button', { name: 'Thao tác Notebook' }).click();
    await submitName(page, nav.getByRole('button', { name: 'Đổi tên Notebook' }), 'Audit Notebook Renamed');
    await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Audit Notebook Renamed');

    await submitName(page, nav.getByRole('button', { name: 'Thêm Section' }), 'Audit Section');
    await submitName(page, nav.getByRole('button', { name: 'Đổi tên Audit Section' }), 'Audit Section Renamed');
    await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Audit Section Renamed' })).toBeVisible();

    await submitName(page, nav.getByRole('button', { name: 'Thêm Page' }), 'Audit Page');
    await submitName(page, nav.getByRole('button', { name: 'Đổi tên Audit Page' }), 'Audit Page Renamed');
    let pageRow = nav.locator('.note-sidebar-page.active', { hasText: 'Audit Page Renamed' });
    await expect(pageRow).toBeVisible();

    // Sheet has create/reorder/delete but no rename control in current UI.
    await nav.getByRole('button', { name: 'Thêm tờ vào Audit Page Renamed' }).click();
    pageRow = nav.locator('.note-sidebar-page.active', { hasText: 'Audit Page Renamed' });
    await expect(pageRow).toContainText('2 tờ');
    let sheets = await ensureActivePageExpanded(nav, 2);
    await sheets.nth(1).getByRole('button', { name: 'Đưa tờ lên' }).click();
    sheets = await ensureActivePageExpanded(nav, 2);
    await acceptConfirm(page, () => sheets.nth(1).getByRole('button', { name: /Xóa tờ/ }).click());
    pageRow = nav.locator('.note-sidebar-page.active', { hasText: 'Audit Page Renamed' });
    await expect(pageRow).toContainText('1 tờ');
    await ensureActivePageExpanded(nav, 1);

    ({ app, page, nav } = await restart(app));
    await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Audit Notebook Renamed');
    await expect(nav.locator('.note-sidebar-section.active', { hasText: 'Audit Section Renamed' })).toBeVisible();
    await expect(nav.locator('.note-sidebar-page.active', { hasText: 'Audit Page Renamed' })).toContainText('1 tờ');
    await ensureActivePageExpanded(nav, 1);

    await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Audit Page Renamed' }).click());
    await expect(nav.locator('.note-sidebar-page', { hasText: 'Audit Page Renamed' })).toHaveCount(0);
    ({ app, page, nav } = await restart(app));
    await expect(nav.locator('.note-sidebar-page', { hasText: 'Audit Page Renamed' })).toHaveCount(0);

    await submitName(page, nav.getByRole('button', { name: 'Thêm Section' }), 'Section Keep');
    await nav.locator('.note-sidebar-section-open', { hasText: 'Audit Section Renamed' }).click();
    await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Audit Section Renamed' }).click());
    await expect(nav.locator('.note-sidebar-section', { hasText: 'Audit Section Renamed' })).toHaveCount(0);
    ({ app, page, nav } = await restart(app));
    await expect(nav.locator('.note-sidebar-section', { hasText: 'Audit Section Renamed' })).toHaveCount(0);
    await expect(nav.locator('.note-sidebar-section', { hasText: 'Section Keep' })).toBeVisible();

    await submitName(page, nav.getByRole('button', { name: 'Tạo Notebook' }), 'Notebook Keep');
    await nav.locator('select[aria-label="Notebook"]').selectOption({ label: 'Audit Notebook Renamed' });
    await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Audit Notebook Renamed');
    await nav.getByRole('button', { name: 'Thao tác Notebook' }).click();
    await acceptConfirm(page, () => nav.getByRole('button', { name: 'Xóa Notebook' }).click());
    await expect(nav.locator('select[aria-label="Notebook"] option', { hasText: 'Audit Notebook Renamed' })).toHaveCount(0);

    ({ app, page, nav } = await restart(app));
    await expect(nav.locator('select[aria-label="Notebook"] option', { hasText: 'Audit Notebook Renamed' })).toHaveCount(0);
    await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText('Notebook Keep');

    process.stdout.write('Desktop Notebook/Section/Page/Sheet CRUD lifecycle audit passed\n');
  } finally {
    try { await app.close(); } catch { /* already closed */ }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
