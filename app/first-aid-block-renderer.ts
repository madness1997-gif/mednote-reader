import { escapeHtml, plainTextToRichHtml, sanitizeRichTextHtml } from "./rich-text-html";
import { lines, type FirstAidBlock, type TextStyle } from "./first-aid-block-domain";
import { firstAidTableLayout } from "./first-aid-table-layout";

export { plainTextToRichHtml } from "./rich-text-html";

export function sanitizeBlockRichTextHtml(value: string) {
  return sanitizeRichTextHtml(value);
}

export function richBlockHtml(html: string | undefined, text = "", textStyle: TextStyle = "paragraph") {
  if (html) return html;
  if (textStyle === "paragraph") return plainTextToRichHtml(text);
  const tag = textStyle === "numbered" ? "ol" : "ul";
  return `<${tag}>${lines(text).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</${tag}>`;
}

const roundPercent = (value: number) => Number((value * 100).toFixed(2));

function blockStaticHtml(block: FirstAidBlock) {
  const border = "border-bottom:1px solid var(--fa-border,#b8c3c7);";
  const content = "font-family:'Times New Roman',serif;font-size:12px;line-height:1.32;color:var(--fa-ink,#26343a);";
  const rich = (html: string | undefined, text = "", textStyle: TextStyle = "paragraph") => sanitizeBlockRichTextHtml(richBlockHtml(html, text, textStyle));
  if (block.type === "heading") return `<div style="margin:0;padding:5px 8px;background-color:var(--fa-heading-bg,#1b7184);color:var(--fa-heading-ink,#fff);font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;line-height:1.2">${rich(block.titleHtml, block.title)}</div>`;
  if (block.type === "label") return `<div style="display:grid;grid-template-columns:22% 1fr;background-color:var(--fa-block-bg,#fff);${border}"><div style="padding:5px 6px;background-color:var(--fa-label-bg,#eff7f8);color:var(--fa-primary,#1b7184);border-right:1px solid var(--fa-soft-border,#d3e1e4);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label)}</div><div style="padding:5px 6px;${content}">${rich(block.textHtml, block.text)}</div></div>`;
  if (block.type === "text") return `<div style="padding:4px 6px;background-color:var(--fa-block-bg,#fff);${border}${content}">${rich(block.textHtml, block.text, block.textStyle)}</div>`;
  if (block.type === "figure" || block.type === "figure-text") {
    const objectAttribute = block.imageObjectId ? ` data-mednote-image-object-id="${escapeHtml(block.imageObjectId)}"` : "";
    const figure = `<div${objectAttribute} data-mednote-asset-id="${escapeHtml(block.imageAssetId ?? "")}" style="min-height:92px;display:grid;align-items:center;background-color:var(--fa-muted-bg,#eef3f4);color:var(--fa-muted-ink,#72828a);font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;text-align:center">${block.imageObjectId || block.imageAssetId ? "Hình là một đối tượng trên trang" : "Chưa có hình"}</div><div style="padding:3px 6px;background-color:var(--fa-caption-bg,#edf1f2);color:var(--fa-caption-ink,#43545d);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:600;line-height:1.3">${rich(block.captionHtml, block.caption)}</div>`;
    if (block.type === "figure") return `<div style="padding:6px;background-color:var(--fa-block-bg,#fff);${border}">${figure}</div>`;
    const text = `<div style="padding:5px 6px;${content}">${rich(block.textHtml, block.text)}</div>`;
    return `<div style="display:grid;grid-template-columns:44% 1fr;column-gap:8px;padding:6px;background-color:var(--fa-block-bg,#fff);${border}">${block.imageSide === "right" ? `${text}<div>${figure}</div>` : `<div>${figure}</div>${text}`}</div>`;
  }
  if (block.type === "table") {
    const rows = block.rows ?? [];
    const columns = Math.max(1, rows[0]?.length ?? 1);
    const layout = firstAidTableLayout(block, rows.length, columns);
    const columnLayout = `<colgroup>${layout.columnWidths.map((width) => `<col style="width:${roundPercent(width)}%">`).join("")}</colgroup>`;
    const tableRows = rows.map((row, rowIndex) => `<tr style="height:${layout.rowHeights[rowIndex]}px">${row.map((cell, columnIndex) => `<${rowIndex === 0 ? "th" : "td"} style="padding:4px 5px;border-style:solid;border-width:1px;border-color:var(--fa-border,#b9c4c8);${rowIndex === 0 ? "color:var(--fa-primary,#1b7184);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.2;text-align:left;background-color:var(--fa-table-head-bg,#f2f6f7)" : "background-color:var(--fa-block-bg,#fff)"}">${rich(block.rowsHtml?.[rowIndex]?.[columnIndex], cell)}</${rowIndex === 0 ? "th" : "td"}>`).join("")}</tr>`).join("");
    return `<div style="padding:5px;background-color:var(--fa-block-bg,#fff);${border}"><table style="width:100%;border-collapse:collapse;table-layout:fixed;${content}">${columnLayout}${tableRows}</table></div>`;
  }
  if (block.type === "flow") {
    const flow = `<div style="display:flex;align-items:stretch;column-gap:4px;padding:5px 6px;${content}">${(block.steps ?? []).map((step, index, all) => `<div style="padding:5px;border-style:solid;border-width:1px;border-color:var(--fa-border,#b7c4c8);text-align:center;background-color:var(--fa-flow-step-bg,#fff)">${rich(block.stepsHtml?.[index], step)}</div>${index < all.length - 1 ? '<div style="display:grid;align-items:center;color:var(--fa-secondary,#8b2c58);font-weight:800">→</div>' : ""}`).join("")}</div>`;
    return `<div style="display:grid;grid-template-columns:22% 1fr;background-color:var(--fa-block-bg,#fff);${border}"><div style="padding:5px 6px;background-color:var(--fa-label-bg,#eff7f8);color:var(--fa-primary,#1b7184);border-right:1px solid var(--fa-soft-border,#d3e1e4);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label ?? "CƠ CHẾ")}</div>${flow}</div>`;
  }
  return `<div style="display:grid;grid-template-columns:22% 1fr;margin:2px 0;border-style:solid;border-width:1px;border-color:var(--fa-pearl-border,#e0c96e);background-color:var(--fa-pearl-bg,#fff7c7);color:var(--fa-pearl-ink,#3b3111)"><div style="padding:5px 6px;color:var(--fa-secondary,#8b2c58);border-right:1px solid var(--fa-pearl-border,#e7d98d);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label)}</div><div style="padding:5px 6px;font-family:'Times New Roman',serif;font-size:12px;line-height:1.32"><b>${rich(block.textHtml, block.text)}</b></div></div>`;
}

export function renderFirstAidBlocksHtml(blocks: FirstAidBlock[]) {
  return blocks.map(blockStaticHtml).join("");
}

export function firstAidBlocksToStandardRichText(blocks: FirstAidBlock[]) {
  const rich = (value: string | undefined, text = "", textStyle: TextStyle = "paragraph") =>
    sanitizeBlockRichTextHtml(richBlockHtml(value, text, textStyle));
  const heading = (value: string | undefined, text = "") => `<div><b>${rich(value, text)}</b></div>`;

  return blocks.map((block) => {
    if (block.type === "heading") return heading(block.titleHtml, block.title);
    if (block.type === "label") return `${heading(block.labelHtml, block.label)}<div>${rich(block.textHtml, block.text)}</div>`;
    if (block.type === "text") return `<div>${rich(block.textHtml, block.text, block.textStyle)}</div>`;
    if (block.type === "figure") return block.caption || block.captionHtml ? `<div><i>${rich(block.captionHtml, block.caption)}</i></div>` : "";
    if (block.type === "figure-text") {
      const caption = block.caption || block.captionHtml ? `<div><i>${rich(block.captionHtml, block.caption)}</i></div>` : "";
      return `<div>${rich(block.textHtml, block.text)}</div>${caption}`;
    }
    if (block.type === "table") {
      const rows = block.rows ?? [];
      const cells = rows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => {
        const tag = rowIndex === 0 ? "th" : "td";
        return `<${tag}>${rich(block.rowsHtml?.[rowIndex]?.[columnIndex], cell)}</${tag}>`;
      }).join("")}</tr>`).join("");
      return `<table><tbody>${cells}</tbody></table>`;
    }
    if (block.type === "flow") {
      const steps = block.steps ?? [];
      return `${heading(block.labelHtml, block.label ?? "CƠ CHẾ")}<ol>${steps.map((step, index) => `<li>${rich(block.stepsHtml?.[index], step)}</li>`).join("")}</ol>`;
    }
    return `${heading(block.labelHtml, block.label ?? "HIGH-YIELD")}<div><b>${rich(block.textHtml, block.text)}</b></div>`;
  }).join("");
}
