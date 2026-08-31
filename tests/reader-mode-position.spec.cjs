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

test('Reader keeps its continuous-scroll position after returning from a long Note visit', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 120; index += 1) {
    const pdfPage = pdf.addPage(index % 3 === 0 ? [595, 842] : index % 3 === 1 ? [420, 595] : [612, 792]);
    const { width, height } = pdfPage.getSize();
    pdfPage.drawRectangle({ x: width * .08, y: height * .14, width: width * .84, height: height * .24, borderWidth: 2 });
    for (let row = 1; row < 5; row += 1) {
      pdfPage.drawLine({ start: { x: width * .08, y: height * (.14 + row * .048) }, end: { x: width * .92, y: height * (.14 + row * .048) }, thickness: 1 });
    }
  }
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
  await pageInput.fill('87');
  await pageInput.press('Enter');
  const targetPage = stage.locator('[data-pdf-page="87"]');
  await expect(targetPage).toBeAttached();
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(1_000);
  await stage.evaluate((element) => {
    const target = element.querySelector('[data-pdf-page="87"]');
    const stageRect = element.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    element.scrollTop += targetRect.top + targetRect.height * .78 - (stageRect.top + 24);
  });
  await page.waitForTimeout(500);
  const before = await stage.evaluate((element) => {
    const stageRect = element.getBoundingClientRect();
    const pages = [...element.querySelectorAll('[data-pdf-page]')];
    const anchorY = stageRect.top + 24;
    const anchor = pages.find((pageElement) => {
      const rect = pageElement.getBoundingClientRect();
      return rect.top <= anchorY && rect.bottom >= anchorY;
    });
    const anchorRect = anchor?.getBoundingClientRect();
    return {
      left: element.scrollLeft,
      page: anchor?.getAttribute('data-pdf-page'),
      ratio: anchorRect ? (anchorY - anchorRect.top) / anchorRect.height : Number.NaN,
    };
  });
  expect(before.page).toBe('87');
  expect(before.ratio).toBeGreaterThan(.7);

  await page.keyboard.press('F6');
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(stage).toBeHidden();
  await page.waitForTimeout(5_000);

  await modeSwitcher.getByRole('button', { name: 'Cả hai' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  await expect(stage).toBeVisible();
  await page.waitForTimeout(3_200);
  const after = await stage.evaluate((element, anchorPage) => {
    const anchor = element.querySelector(`[data-pdf-page="${anchorPage}"]`);
    const stageRect = element.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect();
    return {
      left: element.scrollLeft,
      ratio: anchorRect ? (stageRect.top + 24 - anchorRect.top) / anchorRect.height : Number.NaN,
    };
  }, before.page);
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.ratio - before.ratio)).toBeLessThanOrEqual(.003);

  await modeSwitcher.getByRole('button', { name: 'Note' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
  await expect(stage).toBeHidden();
  await page.keyboard.press('F6');
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);
  await expect(stage).toBeVisible();
  await page.waitForTimeout(3_200);
  const afterReader = await stage.evaluate((element, anchorPage) => {
    const anchor = element.querySelector(`[data-pdf-page="${anchorPage}"]`);
    const stageRect = element.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect();
    return {
      left: element.scrollLeft,
      ratio: anchorRect ? (stageRect.top + 24 - anchorRect.top) / anchorRect.height : Number.NaN,
    };
  }, before.page);
  expect(Math.abs(afterReader.left - after.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(afterReader.ratio - after.ratio)).toBeLessThanOrEqual(.003);

  const boundaryPage = stage.locator('[data-pdf-page="88"]');
  await expect(boundaryPage).toBeAttached();
  await stage.evaluate((element) => {
    const target = element.querySelector('[data-pdf-page="88"]');
    element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - 30;
  });
  await page.waitForTimeout(500);
  const boundaryBefore = await stage.evaluate((element) => {
    const target = element.querySelector('[data-pdf-page="88"]');
    return target.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });
  expect(Math.abs(boundaryBefore - 30)).toBeLessThanOrEqual(2);

  await modeSwitcher.getByRole('button', { name: 'Note' }).click();
  await expect(stage).toBeHidden();
  await page.waitForTimeout(1_200);
  await modeSwitcher.getByRole('button', { name: 'Cả hai' }).click();
  await expect(stage).toBeVisible();
  await page.waitForTimeout(3_200);
  const boundaryAfter = await stage.evaluate((element) => {
    const target = element.querySelector('[data-pdf-page="88"]');
    return target.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });
  expect(Math.abs(boundaryAfter - boundaryBefore)).toBeLessThanOrEqual(2);
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

test('Reader and Both modes keep a zoomed continuous PDF reachable after pane resize', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const bytes = Buffer.from(await pdf.save());

  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.locator('input[data-pdf-input="preview"]').setInputFiles({
    name: 'reader-layout.pdf', mimeType: 'application/pdf', buffer: bytes,
  });
  const dialog = page.locator('.mednote-note-destination');
  await expect(dialog).toBeVisible();
  await dialog.locator('button[type="submit"]').click();
  await expect(page.getByText('Đã mở 1 trang')).toBeVisible();

  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await page.getByRole('button', { name: 'Cuộn liên tục' }).click();
  const modeSwitcher = page.locator('.workspace-mode-switcher');
  const stage = page.locator('.document-stage');
  await modeSwitcher.getByRole('button', { name: 'Reader' }).click();
  await page.getByRole('button', { name: 'Phóng to' }).click();
  await page.getByRole('button', { name: 'Phóng to' }).click();

  const expectReachablePage = async () => {
    await expect.poll(() => stage.evaluate((element) => {
      const surface = element.querySelector('.pdf-page-surface');
      if (!surface) return false;
      const stageRect = element.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return surfaceRect.left >= stageRect.left
        && surfaceRect.left < stageRect.right - 100
        && element.scrollWidth > element.clientWidth + 50;
    })).toBe(true);
    await stage.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => stage.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
    await stage.evaluate((element) => { element.scrollLeft = 0; });
  };

  await expectReachablePage();
  await modeSwitcher.getByRole('button', { name: 'Cả hai' }).click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-split/);
  await expectReachablePage();
});
