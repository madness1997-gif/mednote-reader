const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('PDF export core produces a high-resolution real PDF in mobile Chromium', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const core = await import('/mednote-reader/app/pdf-export-core.ts');
    const a4Scale = core.captureScaleForSize(720, 1018);
    return { ...(await core.runPdfCoreSelfTest()), a4Scale };
  });

  expect(result.ok).toBe(true);
  expect(result.header).toBe('%PDF-');
  expect(result.pages).toBe(1);
  expect(result.bytes).toBeGreaterThan(1000);
  expect(result.scale).toBeGreaterThanOrEqual(2);
  expect(result.a4Scale).toBeGreaterThanOrEqual(2);
  expect(result.pixelWidth).toBeGreaterThanOrEqual(840);
  expect(result.pixelHeight).toBeGreaterThanOrEqual(1188);
  expect(result.contentCoverage).toBeGreaterThan(0.005);
  expect(result.inlineBackgroundFragments).toBeGreaterThanOrEqual(2);
});

test('clicking Export PDF really creates a downloadable PDF blob', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${APP_URL}?pdfExportE2E=1`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('[data-pdf-export-e2e-harness="1"]')).toBeVisible({ timeout: 5000 });
  const exportButton = page.locator('.note-pdf-export-button');
  await expect(exportButton).toBeVisible({ timeout: 5000 });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  const notebookScope = page.locator('[data-export-scope="notebook"]');
  await expect(notebookScope).toBeVisible({ timeout: 3000 });
  await notebookScope.click();

  const ready = page.getByText('PDF đã tạo xong');
  const failed = page.getByText('Xuất PDF thất bại');
  await expect.poll(async () => {
    if (await ready.isVisible().catch(() => false)) return 'ready';
    if (await failed.isVisible().catch(() => false)) {
      const detail = await page.locator('.note-pdf-export-status small').textContent().catch(() => 'unknown');
      return `failed:${detail}`;
    }
    return 'waiting';
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe('ready');

  const downloadLink = page.locator('[data-pdf-download="1"]');
  await expect(downloadLink).toBeVisible();

  const blobResult = await page.evaluate(async () => {
    const link = document.querySelector('[data-pdf-download="1"]');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('missing download link');
    const response = await fetch(link.href);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      header: new TextDecoder().decode(bytes.slice(0, 5)),
      bytes: bytes.length,
    };
  });

  expect(blobResult.header).toBe('%PDF-');
  expect(blobResult.bytes).toBeGreaterThan(1000);
});
