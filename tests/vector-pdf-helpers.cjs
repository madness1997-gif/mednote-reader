const { expect } = require('@playwright/test');
const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

async function captureBrowserPrint(page) {
  await page.addInitScript(() => {
    window.print = () => {
      window.top.__printedNoteHtml = document.documentElement.outerHTML;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
}

async function renderAndReadPdf(page, html) {
  const target = await page.context().newPage();
  try {
    await target.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await target.setContent(html);
    await target.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(image => image.decode()));
    });
    const bytes = await target.pdf({ printBackground: true, preferCSSPageSize: true });
    const parsed = await page.evaluate(async data => {
      const { loadPdfDocument } = await import('/mednote-reader/app/pdf-document-loader.ts');
      const pdf = await loadPdfDocument(new Uint8Array(data));
      try {
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const sheet = await pdf.getPage(i);
          const text = await sheet.getTextContent();
          pages.push(text.items.map(item => item.str || '').join(' '));
        }
        return { pages };
      } finally { await pdf.destroy(); }
    }, Array.from(bytes));
    return { bytes, ...parsed };
  } finally { await target.close(); }
}

async function readBrowserPrint(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__printedNoteHtml))).toBe(true);
  const html = await page.evaluate(() => window.__printedNoteHtml);
  await expect(page.locator('.note-pdf-export-surface')).toHaveCount(0);
  return renderAndReadPdf(page, html);
}
module.exports = { captureBrowserPrint, readBrowserPrint, renderAndReadPdf };
