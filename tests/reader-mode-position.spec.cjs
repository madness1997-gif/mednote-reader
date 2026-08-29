const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1280, height: 900 } });

async function waitForAppReady(page) {
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('mednote-document-runtime-v1');
    if (!raw) return false;
    try {
      const snapshot = JSON.parse(raw);
      return Array.isArray(snapshot?.workspaces) && snapshot.workspaces.length > 0;
    } catch {
      return false;
    }
  }), { timeout: 10000 }).toBe(true);
}

test('Reader keeps its continuous-scroll position after visiting Note mode', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 9; index += 1) pdf.addPage([420, 595]);
  const bytes = Buffer.from(await pdf.save());

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
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
  const pageInput = page.getByRole('textbox', { name: 'Số trang' });
  await pageInput.fill('6');
  await pageInput.press('Enter');
  const targetPage = stage.locator('[data-pdf-page="6"]');
  await expect(targetPage).toBeAttached();
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(1_000);
  const before = await stage.evaluate((element) => {
    const stageRect = element.getBoundingClientRect();
    const pages = [...element.querySelectorAll('[data-pdf-page]')];
    const anchor = pages.reduce((best, pageElement) => {
      const offset = pageElement.getBoundingClientRect().top - stageRect.top;
      return !best || Math.abs(offset) < Math.abs(best.offset) ? { pageElement, offset } : best;
    }, null);
    return {
      left: element.scrollLeft,
      page: anchor?.pageElement.getAttribute('data-pdf-page'),
      offset: anchor?.offset ?? 0,
    };
  });

  await page.keyboard.press('F6');
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(stage).toBeHidden();

  await page.keyboard.press('F6');
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);
  await expect(stage).toBeVisible();
  await page.waitForTimeout(3_200);
  const after = await stage.evaluate((element, anchorPage) => {
    const anchor = element.querySelector(`[data-pdf-page="${anchorPage}"]`);
    return {
      left: element.scrollLeft,
      offset: anchor ? anchor.getBoundingClientRect().top - element.getBoundingClientRect().top : Number.NaN,
    };
  }, before.page);
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(2);
});

test('F6 moves focus between Reader and Note while both panes stay visible', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);

  const workspace = page.locator('.workspace');
  const readerStage = page.locator('.document-stage');
  const readerPane = page.locator('.reader-pane');
  const notePane = page.locator('.notes-pane');
  await page.locator('.workspace-mode-switcher').getByRole('button', { name: 'Cả hai' }).click();
  await expect(workspace).toHaveClass(/workspace-mode-split/);

  await readerStage.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('F6');
  await expect.poll(() => notePane.evaluate((pane) => pane.contains(document.activeElement))).toBe(true);
  await expect(workspace).toHaveClass(/workspace-mode-split/);

  await page.keyboard.press('F6');
  await expect.poll(() => readerPane.evaluate((pane) => pane.contains(document.activeElement))).toBe(true);
  await expect(workspace).toHaveClass(/workspace-mode-split/);
});
