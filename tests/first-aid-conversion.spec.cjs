const { test, expect } = require('@playwright/test');

test('regular rich text conversion preserves content around tables and list formatting', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/mednote-reader/');
  const blocks = await page.evaluate(async () => {
    const { parseBlocks } = await import('/mednote-reader/app/first-aid-block-codec.ts');
    const html = [
      '<div><b>Đoạn trước bảng</b></div>',
      '<table><tbody>',
      '<tr><th>Thuốc</th><th>Liều</th></tr>',
      '<tr><td>Levothyroxine</td><td><i>50 mcg</i></td></tr>',
      '</tbody></table>',
      '<div><u>Đoạn sau bảng</u></div>',
      '<ul><li>Theo dõi TSH</li><li>Chỉnh liều</li></ul>',
    ].join('');
    return parseBlocks(html, 'Đoạn trước bảng\n\nThuốc | Liều\nLevothyroxine | 50 mcg\n\nĐoạn sau bảng\n\nTheo dõi TSH\nChỉnh liều');
  });

  expect(blocks.map((block) => block.type)).toEqual(['text', 'table', 'text', 'text']);
  expect(blocks[0].text).toBe('Đoạn trước bảng');
  expect(blocks[0].textHtml).toContain('<b>Đoạn trước bảng</b>');
  expect(blocks[1].rows).toEqual([
    ['Thuốc', 'Liều'],
    ['Levothyroxine', '50 mcg'],
  ]);
  expect(blocks[1].rowsHtml[1][1]).toContain('<i>50 mcg</i>');
  expect(blocks[2].text).toBe('Đoạn sau bảng');
  expect(blocks[2].textHtml).toContain('<u>Đoạn sau bảng</u>');
  expect(blocks[3].textStyle).toBe('bullets');
  expect(blocks[3].text).toBe('Theo dõi TSH\nChỉnh liều');
  expect(blocks[3].textHtml).toContain('<ul>');
});
