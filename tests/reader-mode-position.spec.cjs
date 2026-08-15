const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1280, height: 900 } });

test('Reader keeps its continuous-scroll position after visiting Note mode', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 9; index += 1) pdf.addPage([420, 595]);
  const bytes = Buffer.from(await pdf.save());

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('input[data-pdf-input="preview"]')).toBeEnabled();
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'reader-position.pdf', mimeType: 'application/pdf', buffer: bytes,
  });

  const dialog = page.locator('.mednote-note-destination');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="mode"][value="notebook"]').check();
  await dialog.locator('[data-title]').fill('Reader position regression');
  await dialog.locator('button[type="submit"]').click();

  const modeSwitcher = page.locator('.workspace-mode-switcher');
  await modeSwitcher.getByRole('button', { name: 'Reader' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);

  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await page.getByRole('button', { name: 'Cuộn liên tục' }).click();

  const stage = page.locator('.document-stage');
  const targetPage = stage.locator('[data-pdf-page="6"]');
  await expect(targetPage).toBeAttached();
  await targetPage.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(1_000);
  const before = await stage.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));

  await modeSwitcher.getByRole('button', { name: 'Note' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(stage).toBeHidden();

  await modeSwitcher.getByRole('button', { name: 'Reader' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);
  await expect(stage).toBeVisible();
  await expect.poll(async () => {
    const current = await stage.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    return Math.max(Math.abs(current.top - before.top), Math.abs(current.left - before.left));
  }).toBeLessThanOrEqual(2);
});
