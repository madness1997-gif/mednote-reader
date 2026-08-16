const path = require('node:path');
const { test, expect } = require('@playwright/test');

const editorCss = path.resolve(__dirname, '../app/first-aid-block-editor.css');

const mintTheme = [
  '--fa-paper-bg:#e9f8ef',
  '--fa-ink:#203a31',
  '--fa-primary:#126d59',
  '--fa-secondary:#87516e',
  '--fa-band-primary:#126d59',
  '--fa-band-secondary:#87516e',
  '--fa-title-ink:#fff',
  '--fa-heading-bg:#126d59',
  '--fa-heading-ink:#fff',
  '--fa-block-bg:#f6fcf8',
  '--fa-pearl-bg:#f3df86',
  '--fa-pearl-ink:#40370f',
  '--fa-label-bg:color-mix(in srgb,var(--fa-primary) 18%,var(--fa-block-bg))',
  '--fa-label-ink:color-mix(in srgb,var(--fa-primary) 86%,var(--fa-ink))',
  '--fa-table-head-bg:color-mix(in srgb,var(--fa-primary) 22%,var(--fa-block-bg))',
  '--fa-table-head-ink:color-mix(in srgb,var(--fa-primary) 82%,var(--fa-ink))',
  '--fa-border:color-mix(in srgb,var(--fa-primary) 34%,var(--fa-block-bg))',
  '--fa-soft-border:color-mix(in srgb,var(--fa-primary) 22%,var(--fa-block-bg))',
  '--fa-muted-bg:color-mix(in srgb,var(--fa-primary) 11%,var(--fa-block-bg))',
  '--fa-muted-ink:color-mix(in srgb,var(--fa-ink) 70%,var(--fa-primary))',
  '--fa-caption-bg:color-mix(in srgb,var(--fa-secondary) 12%,var(--fa-block-bg))',
  '--fa-caption-ink:color-mix(in srgb,var(--fa-ink) 84%,var(--fa-secondary))',
  '--fa-flow-step-bg:color-mix(in srgb,var(--fa-primary) 8%,var(--fa-block-bg))',
  '--fa-pearl-border:color-mix(in srgb,var(--fa-secondary) 40%,var(--fa-pearl-bg))',
  '--fa-toolbar-bg:color-mix(in srgb,var(--fa-block-bg) 92%,var(--fa-primary))',
  '--fa-toolbar-ink:color-mix(in srgb,var(--fa-ink) 82%,var(--fa-primary))',
  '--fa-focus-bg:color-mix(in srgb,var(--fa-primary) 16%,var(--fa-block-bg))',
].join(';');

const sample = `
  <main class="visual-canvas">
    <article class="visual-paper template-first-aid" style="${mintTheme}">
      <div class="paper-background"></div>
      <div class="typed-layer">
        <div class="note-title-input">CƯỜNG GIÁP NẶNG</div>
        <div class="fa-block-editor mode-edit">
          <div class="fa-block-wrap"><section class="fa-block fa-block-heading"><input class="fa-heading-input" value="BỆNH CẢNH LÂM SÀNG" readonly></section></div>
          <div class="fa-insert-slot"><span></span><button class="fa-insert-button">+</button><span></span></div>
          <div class="fa-block-wrap"><section class="fa-block fa-block-label"><div class="fa-label-layout"><div class="fa-rich-editor fa-label-input">GỢI Ý</div><div class="fa-rich-editor fa-content-input">Sốt, nhịp tim nhanh, rối loạn tiêu hóa và thay đổi tri giác.</div></div></section></div>
          <div class="fa-insert-slot"><span></span><button class="fa-insert-button">+</button><span></span></div>
          <div class="fa-block-wrap"><section class="fa-block fa-block-flow"><div class="fa-flow-layout"><div class="fa-rich-editor fa-flow-label">CƠ CHẾ</div><div class="fa-flow-block"><div class="fa-flow-item"><div class="fa-rich-editor">Tăng tổng hợp hormon giáp</div><span>↓</span></div><div class="fa-flow-item"><div class="fa-rich-editor">Tăng đáp ứng catecholamine</div><span>↓</span></div><div class="fa-flow-item"><div class="fa-rich-editor">Suy đa cơ quan</div></div></div></div></section></div>
          <div class="fa-insert-slot"><span></span><button class="fa-insert-button">+</button><span></span></div>
          <div class="fa-block-wrap"><section class="fa-block fa-block-figure-text"><div class="fa-figure-text"><div class="fa-figure-block"><div class="fa-image-zone"><svg width="24" height="24" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor"/><path d="m5 17 5-5 4 4 2-2 3 3" fill="none" stroke="currentColor"/></svg><b>Hình minh họa</b><div class="fa-image-actions"><button>Duyệt ảnh</button></div><small>Chọn ảnh khi chỉnh sửa</small></div><div class="fa-rich-editor fa-caption-input">Dấu hiệu gợi ý trên lâm sàng</div></div><button class="fa-figure-resizer"><span></span></button><div class="fa-figure-copy"><div class="fa-rich-editor fa-content-input"><b>Điểm nhớ</b><ul><li>Ưu tiên ổn định ABC</li><li>Điều trị đa cơ chế</li></ul></div></div></div></section></div>
          <div class="fa-insert-slot"><span></span><button class="fa-insert-button">+</button><span></span></div>
          <div class="fa-block-wrap"><section class="fa-block fa-block-table"><div class="fa-table-block"><div class="fa-table-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="fa-rich-editor fa-table-head">Thuốc</div><div class="fa-rich-editor fa-table-head">Vai trò</div><div class="fa-rich-editor fa-table-cell">PTU</div><div class="fa-rich-editor fa-table-cell">Ức chế tổng hợp và chuyển T4 → T3</div></div></div></section></div>
          <div class="fa-insert-slot"><span></span><button class="fa-insert-button">+</button><span></span></div>
          <div class="fa-block-wrap"><section class="fa-block fa-block-pearl"><div class="fa-pearl-layout"><div class="fa-rich-editor fa-pearl-label">HIGH-YIELD</div><div class="fa-rich-editor fa-pearl-text">Dùng iod sau thuốc kháng giáp ít nhất 1 giờ.</div></div></section></div>
        </div>
      </div>
    </article>
  </main>`;

async function renderSample(page) {
  await page.setViewportSize({ width: 900, height: 1080 });
  await page.setContent(sample);
  await page.addStyleTag({ content: `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #dfe7e7; }
    .visual-canvas { min-height: 1080px; display: grid; place-items: start center; padding: 38px; }
    .visual-paper { position: relative; width: 690px; min-height: 980px; overflow: hidden; background: var(--fa-paper-bg); box-shadow: 0 16px 42px rgba(22, 52, 52, .18); }
    .visual-paper .paper-background { position: absolute; inset: 0; }
    .visual-paper .typed-layer { position: relative; z-index: 1; padding: 40px 44px; }
    .visual-paper .fa-block-editor { height: auto; overflow: visible; }
    .visual-paper .fa-insert-button { font-size: 0; }
    .visual-paper, .visual-paper .fa-rich-editor { font-family: "DejaVu Serif", serif !important; }
    .visual-paper .note-title-input,
    .visual-paper .fa-heading-input,
    .visual-paper .fa-label-input,
    .visual-paper .fa-flow-label,
    .visual-paper .fa-table-head,
    .visual-paper .fa-pearl-label { font-family: "DejaVu Sans", sans-serif !important; }
  ` });
  await page.addStyleTag({ path: editorCss });
}

test('First Aid signature matches the approved reading surface', async ({ page }) => {
  await renderSample(page);
  const paper = page.locator('.visual-paper');

  // Keep text in the layout while removing platform-specific glyph rasterization.
  // Typography is covered by the metric contract below; this snapshot protects
  // the remaining geometry, spacing, borders, bands, and surface colors.
  await paper.evaluate((element) => element.classList.add('visual-snapshot-geometry'));
  await page.addStyleTag({ content: `
    .visual-paper.visual-snapshot-geometry,
    .visual-paper.visual-snapshot-geometry * {
      color: transparent !important;
      text-shadow: none !important;
    }
  ` });

  await expect(paper).toHaveScreenshot('first-aid-signature.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.001,
  });
});

test('First Aid keeps the approved layout metrics', async ({ page }) => {
  await renderSample(page);
  const metrics = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      titleHeight: style('.note-title-input').minHeight,
      titleSize: style('.note-title-input').fontSize,
      headingSize: style('.fa-heading-input').fontSize,
      titleDirection: style('.note-title-input').direction,
      titleAlignment: style('.note-title-input').textAlign,
      labelColumns: style('.fa-label-layout').gridTemplateColumns,
      labelSize: style('.fa-label-input').fontSize,
      flowLabelSize: style('.fa-flow-label').fontSize,
      contentSize: style('.fa-content-input').fontSize,
      pearlLabelSize: style('.fa-pearl-label').fontSize,
      pearlTextSize: style('.fa-pearl-text').fontSize,
      titleWeight: style('.note-title-input').fontWeight,
      headingWeight: style('.fa-heading-input').fontWeight,
      labelWeight: style('.fa-label-input').fontWeight,
      tableHeadWeight: style('.fa-table-head').fontWeight,
      titleInk: style('.note-title-input').color,
      headingInk: style('.fa-heading-input').color,
      contentInk: style('.fa-content-input').color,
      pearlTextInk: style('.fa-pearl-text').color,
      flowAlignment: style('.fa-flow-item .fa-rich-editor').textAlign,
      imageHeight: style('.fa-image-zone').minHeight,
    };
  });

  expect(metrics).toEqual({
    titleHeight: '34px',
    titleSize: '12px',
    headingSize: '12px',
    titleDirection: 'ltr',
    titleAlignment: 'left',
    labelColumns: '138.453px 463.547px',
    labelSize: '12px',
    flowLabelSize: '12px',
    contentSize: '12px',
    pearlLabelSize: '12px',
    pearlTextSize: '12px',
    titleWeight: '850',
    headingWeight: '800',
    labelWeight: '800',
    tableHeadWeight: '800',
    titleInk: 'rgb(255, 255, 255)',
    headingInk: 'rgb(255, 255, 255)',
    contentInk: 'rgb(32, 58, 49)',
    pearlTextInk: 'rgb(32, 58, 49)',
    flowAlignment: 'center',
    imageHeight: '68px',
  });
});
