const { test, expect } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

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
  }), { timeout: 10_000 }).toBe(true);
}

for (const viewport of [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
]) {
  test(`Library remains a real two-column split at ${viewport.label} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Mở thư viện' })).toBeEnabled({ timeout: 12_000 });
    await page.getByRole('button', { name: 'Mở thư viện' }).click();

    const panel = page.getByRole('complementary', { name: 'Thư viện tài liệu và ghi chú' });
    const documents = panel.locator('.library-domain[aria-label="Tài liệu"]');
    const notes = panel.locator('.library-domain[aria-label="Ghi chú"]');
    await expect(panel).toBeVisible();
    await expect(documents).toBeVisible();
    await expect(notes).toBeVisible();

    const [panelBox, documentBox, noteBox, styles] = await Promise.all([
      panel.boundingBox(),
      documents.boundingBox(),
      notes.boundingBox(),
      panel.evaluate((element) => {
        const panelStyle = getComputedStyle(element);
        const list = element.querySelector('.library-two-column');
        const columns = list ? getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean) : [];
        const scrollAreas = [...element.querySelectorAll('.library-domain-scroll')].map((area) => getComputedStyle(area).overflowY);
        return { display: panelStyle.display, overflowX: panelStyle.overflowX, columns, scrollAreas };
      }),
    ]);

    expect(panelBox).not.toBeNull();
    expect(documentBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    expect(documentBox.x).toBeLessThan(noteBox.x);
    expect(Math.abs(documentBox.y - noteBox.y)).toBeLessThanOrEqual(1);
    expect(documentBox.x + documentBox.width).toBeLessThanOrEqual(noteBox.x);
    expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    expect(styles.display).toBe('flex');
    expect(styles.overflowX).toBe('hidden');
    expect(styles.columns).toHaveLength(2);
    expect(styles.scrollAreas).toEqual(['auto', 'auto']);
  });
}

test('Library callbacks rename and open canonical documents and notebooks', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 320]);
  const bytes = await pdf.save();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.locator('input[data-pdf-input="library"]').setInputFiles({
    name: 'library-callbacks.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes),
  });
  const destination = page.locator('.mednote-note-destination');
  await expect(destination).toBeVisible();
  await destination.locator('input[name="mode"][value="none"]').check();
  await destination.locator('button[type="submit"]').click();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);

  await page.getByRole('button', { name: 'Mở thư viện' }).click();
  const panel = page.getByRole('complementary', { name: 'Thư viện tài liệu và ghi chú' });
  const documentRow = panel.locator('.library-domain[aria-label="Tài liệu"] .library-row').first();
  await expect(documentRow).toContainText('library-callbacks');
  await documentRow.locator('.library-rename').click();
  await documentRow.getByRole('textbox', { name: 'Tên tài liệu mới' }).fill('Library đã đổi tên');
  await documentRow.locator('.library-save').click();
  await expect(documentRow).toContainText('Library đã đổi tên');

  await documentRow.locator('.library-item').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-reader/);

  await page.getByRole('button', { name: 'Mở thư viện' }).click();
  await panel.locator('.library-domain[aria-label="Ghi chú"] .library-item').first().click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.workspace')).toHaveClass(/workspace-mode-note/);
});
