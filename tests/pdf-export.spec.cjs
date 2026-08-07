const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
});

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test('PDF export core produces a real one-page PDF in mobile Chromium', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const core = await import('/mednote-reader/app/pdf-export-core.ts');
    return core.runPdfCoreSelfTest();
  });

  expect(result.ok).toBe(true);
  expect(result.header).toBe('%PDF-');
  expect(result.pages).toBe(1);
  expect(result.bytes).toBeGreaterThan(1000);
});

test('clicking Export PDF really creates a downloadable PDF blob', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();

    document.querySelectorAll('.note-thumbnails.__pdf-e2e, .note-stage.__pdf-e2e').forEach((node) => node.remove());

    const thumbs = document.createElement('div');
    thumbs.className = 'note-thumbnails __pdf-e2e';
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'note-thumb active';
    thumb.textContent = 'Tờ 1';
    thumbs.append(thumb);

    const stage = document.createElement('div');
    stage.className = 'note-stage __pdf-e2e';
    stage.style.position = 'fixed';
    stage.style.left = '-10000px';
    stage.style.top = '0';
    const paper = document.createElement('div');
    paper.className = 'note-paper';
    paper.style.setProperty('--note-natural-width', '420px');
    paper.style.setProperty('--note-natural-height', '594px');
    paper.style.width = '420px';
    paper.style.height = '594px';
    paper.style.background = '#fff';
    paper.innerHTML = '<div style="padding:28px;font:16px Arial"><h2>MedNote E2E</h2><p>Real export button test</p><div style="width:100px;height:100px;border-radius:50%;background:#c7d8eb"></div></div>';
    stage.append(paper);

    document.body.append(thumbs, stage);

    if (!document.querySelector('.note-file-actions')) {
      const actions = document.createElement('div');
      actions.className = 'note-file-actions';
      document.body.append(actions);
    }
  });

  const exportButton = page.locator('.note-pdf-export-button');
  await expect(exportButton).toBeVisible({ timeout: 5000 });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  const notebookScope = page.locator('[data-export-scope="notebook"]');
  await expect(notebookScope).toBeVisible({ timeout: 3000 });
  await notebookScope.click();

  await expect(page.getByText('PDF đã tạo xong')).toBeVisible({ timeout: 25_000 });
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
