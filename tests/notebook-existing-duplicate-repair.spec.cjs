const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';
test.use({ viewport: { width: 1280, height: 900 } });

async function createNotebook(page, name) {
  const nav = page.locator('.note-sidebar');
  await nav.getByRole('button', { name: 'Tạo Notebook' }).click();
  const dialog = page.locator('.mednote-native-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="text"]').fill(name);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect(nav.locator('select[aria-label="Notebook"] option:checked')).toHaveText(name);
}

async function corruptNotebookTitles(page) {
  await page.evaluate(async () => {
    const requestValue = (request) => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mednote-local', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const meta = await requestValue(store.get('library:v6:meta'));
      for (const id of meta.notebookIds) {
        const key = `library:v6:notebook:${id}`;
        const notebook = await requestValue(store.get(key));
        store.put({ ...notebook, title: 'Notebook mới' }, key);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

test('existing v6 duplicate Notebook titles are repaired without deleting notebooks', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await createNotebook(page, 'Alpha');
  await createNotebook(page, 'Beta');

  let nav = page.locator('.note-sidebar');
  const countBefore = await nav.locator('select[aria-label="Notebook"] option').count();
  await corruptNotebookTitles(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  nav = page.locator('.note-sidebar');
  await expect(nav).toBeVisible({ timeout: 10_000 });

  const options = nav.locator('select[aria-label="Notebook"] option');
  await expect(options).toHaveCount(countBefore);
  const titles = (await options.allTextContents()).map((title) => title.trim());
  expect(new Set(titles.map((title) => title.toLocaleLowerCase('vi-VN'))).size).toBe(titles.length);
  expect(titles).toContain('Notebook mới');
  expect(titles).toContain('Notebook mới (2)');
});
