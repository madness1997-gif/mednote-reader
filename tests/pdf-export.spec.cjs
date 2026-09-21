const { test, expect } = require('@playwright/test');
const { captureBrowserPrint, readBrowserPrint, renderAndReadPdf } = require('./vector-pdf-helpers.cjs');
const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

for (const desktop of [false, true]) {
  test(`${desktop ? 'desktop bridge' : 'web print'} exports selectable Vietnamese text`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: desktop ? 1440 : 412, height: 915 });
    await captureBrowserPrint(page);
    let output;
    if (desktop) {
      await page.exposeFunction('testPrintNotePdf', async html => {
        output = await renderAndReadPdf(page, html);
        return Array.from(output.bytes);
      });
    }
    await page.addInitScript(({ desktop }) => {
      if (window !== window.top) return;
      localStorage.clear(); sessionStorage.clear();
      if (desktop) window.mednoteDesktop = { printNotePdf: async html => new Uint8Array(await window.testPrintNotePdf(html)) };
    }, { desktop });
    await page.goto(`${APP_URL}?pdfExportE2E=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-pdf-export-e2e-harness="1"]')).toBeVisible();
    await page.getByRole('button', { name: 'Xuất note thành PDF' }).click();
    await page.locator('[data-export-scope="notebook"]').click();
    if (desktop) {
      await expect(page.getByText('PDF đã tạo xong')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('[data-pdf-download="1"]')).toBeVisible();
    } else output = await readBrowserPrint(page);
    expect(output.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(output.pages).toHaveLength(1);
    // PDF.js can split a shaped font run into multiple items; the helper adds spaces between them.
    expect(output.pages[0].replace(/\s/g, '')).toContain('MEDNOTEPDFE2E');
    expect(output.pages[0]).toContain('Đây là nội dung');
    await expect(page.locator('.note-pdf-export-surface')).toHaveCount(0);
  });
}
