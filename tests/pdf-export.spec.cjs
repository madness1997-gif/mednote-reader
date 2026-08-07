const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

test('PDF export core produces a real one-page PDF in mobile Chromium', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/mednote-reader/', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const core = await import('/mednote-reader/app/pdf-export-core.ts');
    return core.runPdfCoreSelfTest();
  });

  expect(result.ok).toBe(true);
  expect(result.header).toBe('%PDF-');
  expect(result.pages).toBe(1);
  expect(result.bytes).toBeGreaterThan(1000);
});
