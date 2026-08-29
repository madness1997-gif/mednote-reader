const { test, expect } = require('@playwright/test');

const APP_URL = 'http://127.0.0.1:4173/mednote-reader/';

test.use({ viewport: { width: 1440, height: 1050 } });

function firstAidSheet(id, order) {
  const blocks = [
    { id: `${id}-heading`, type: 'heading', title: 'BỆNH LÝ TĂNG LIPOPROTEIN CHỨA APO B' },
    {
      id: `${id}-label-1`, type: 'label', label: 'TĂNG TRIGLYCERIDE MÁU NẶNG',
      text: 'Định nghĩa\nThường kèm tăng cholesterol\nHậu quả: viêm tụy cấp',
      textHtml: '<ul><li><u>Định nghĩa</u>: TG đói &gt;500 mg%</li><li>Thường kèm tăng cholesterol</li><li>Hậu quả: <b>viêm tụy cấp</b></li></ul>',
    },
    {
      id: `${id}-figure`, type: 'figure-text', imageSide: 'left', imageWidthRatio: .4,
      caption: 'Cơ chế hoạt động của LPL',
      text: 'LPL thủy phân triglyceride\nApoC-II hoạt hóa LPL',
      textHtml: '<p><b>LPL</b> thủy phân triglyceride</p><ul><li>ApoC-II hoạt hóa LPL</li><li>ApoC-III ức chế LPL</li></ul>',
    },
    {
      id: `${id}-label-2`, type: 'label', label: 'HỘI CHỨNG TĂNG CHYLOMICRON MÁU CÓ TÍNH GIA ĐÌNH',
      text: 'Do khiếm khuyết hoặc bất hoạt LPL\nLặn trên NST thường\nTG thường trên 1000 mg%',
      textHtml: '<ul><li>Do khiếm khuyết hoặc bất hoạt LPL</li><li>Lặn trên NST thường</li><li>TG thường &gt;1000 mg%</li></ul>',
    },
  ];
  return {
    id, title: 'RỐI LOẠN LIPID', titleHtml: 'RỐI LOẠN LIPID', logicalPageId: 'layout-page',
    logicalPageTitle: 'RỐI LOẠN LIPID', sheetOrder: order, body: '', bodyHtml: '',
    firstAid: { version: 1, blocks }, citationPage: null, strokes: [], excerpts: [],
    paper: { size: 'a4', orientation: 'portrait', template: 'first-aid', color: 'white' },
    text: { font: 'times', size: 12, color: 'auto', bold: false, italic: false, underline: false, align: 'left' },
  };
}

test.beforeEach(async ({ page }) => {
  const sheet1 = firstAidSheet('layout-sheet-1', 0);
  const sheet2 = firstAidSheet('layout-sheet-2', 1);
  await page.addInitScript(({ sheet1, sheet2 }) => {
    localStorage.clear();
    sessionStorage.clear();
    const now = Date.now();
    const notebook = { id: 'layout-notebook', title: 'Lipid', pages: [sheet1, sheet2], activePageId: sheet2.id, createdAt: now };
    localStorage.setItem('mednote-library-v2', JSON.stringify({
      workspaces: [{
        id: 'layout-workspace', kind: 'empty', name: 'Lipid', documents: [], activeDocumentId: null,
        notebooks: [notebook], activeNotebookId: notebook.id, sourcePage: 1,
      }],
      activeWorkspaceId: 'layout-workspace', readerShare: 50, workspaceMode: 'note', noteZoom: 1, savedAt: now,
    }));
  }, { sheet1, sheet2 });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
});

async function blockMetrics(paper) {
  return paper.locator('.fa-block').evaluateAll((blocks) => {
    const paperRect = blocks[0]?.closest('.note-paper')?.getBoundingClientRect();
    return blocks.map((block) => {
      const rect = block.getBoundingClientRect();
      return {
        type: [...block.classList].find((name) => name.startsWith('fa-block-') && name !== 'fa-block-wrap'),
        top: rect.top - paperRect.top,
        height: rect.height,
      };
    });
  });
}

function expectSameGeometry(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((metric, index) => {
    expect(metric.type).toBe(expected[index].type);
    expect(Math.abs(metric.top - expected[index].top)).toBeLessThanOrEqual(.5);
    expect(Math.abs(metric.height - expected[index].height)).toBeLessThanOrEqual(.5);
  });
}

test('First Aid edit and view modes keep identical content geometry', async ({ page }) => {
  await expect(page.locator('.note-sidebar')).toBeVisible({ timeout: 12_000 });
  await page.getByRole('toolbar', { name: 'Công cụ ghi chú' }).getByRole('button', { name: 'Liên tục' }).click();

  const preview = page.locator('.note-paper-preview[data-note-page-id="layout-sheet-1"]');
  const active = page.locator('.note-paper.interactive[data-note-page-id="layout-sheet-2"]');
  await expect(preview).toBeVisible();
  await expect(active).toBeVisible();

  const previewMetrics = await blockMetrics(preview);
  const editMetrics = await blockMetrics(active);
  expectSameGeometry(editMetrics, previewMetrics);

  await page.getByRole('button', { name: 'Chỉnh sửa tờ 1' }).click();
  const nextActive = page.locator('.note-paper.interactive[data-note-page-id="layout-sheet-1"]');
  const nextPreview = page.locator('.note-paper-preview[data-note-page-id="layout-sheet-2"]');
  await expect(nextActive).toBeVisible();
  await expect(nextPreview).toBeVisible();
  expectSameGeometry(await blockMetrics(nextActive), await blockMetrics(nextPreview));
});
