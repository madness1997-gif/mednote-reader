const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1280, height: 900 } });

async function waitForAppReady(page) {
  await expect.poll(() => page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('mednote-document-runtime-v1') || 'null')?.workspaces?.length > 0;
    } catch {
      return false;
    }
  }), { timeout: 10_000 }).toBe(true);
}

test('continuous PDF keeps a 2,500-page document inside a bounded DOM window', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 2_500; index += 1) pdf.addPage([595, 842]);
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: true }));
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'virtual-2500.pdf', mimeType: 'application/pdf', buffer: bytes,
  });
  const dialog = page.locator('.mednote-note-destination');
  await expect(dialog).toBeVisible();
  await dialog.locator('button[type="submit"]').click();
  await expect(page.getByText('Đã mở 2500 trang')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await page.getByRole('button', { name: 'Cuộn liên tục' }).click();
  const stage = page.locator('.document-stage');
  const list = stage.locator('.continuous-pages');
  await expect(list).toHaveAttribute('data-pdf-total-pages', '2500');
  await expect.poll(() => stage.locator('[data-pdf-page]').count()).toBeLessThanOrEqual(8);

  const pageInput = page.getByRole('textbox', { name: 'Số trang' });
  await pageInput.fill('2400');
  await pageInput.press('Enter');
  await expect(stage.locator('[data-pdf-page="2400"]')).toBeAttached();
  await expect.poll(() => stage.locator('[data-pdf-page]').count()).toBeLessThanOrEqual(8);
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(1_000_000);
  const pageSurface = stage.locator('[data-pdf-page="2400"] .pdf-page-surface');
  const beforeZoom = await pageSurface.boundingBox();
  await pageSurface.hover({ position: { x: 80, y: 120 } });
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(page.locator('.pdf-toolbar .zoom-control')).toContainText('110%');
  await expect(stage.locator('[data-pdf-page="2400"]')).toBeAttached();
  await expect.poll(() => stage.locator('[data-pdf-page]').count()).toBeLessThanOrEqual(8);
  const afterZoom = await pageSurface.boundingBox();
  expect(Math.abs((afterZoom?.y ?? 0) - (beforeZoom?.y ?? 0))).toBeLessThan(180);
  await page.waitForTimeout(500);
  expect(runtimeErrors).toEqual([]);
});
