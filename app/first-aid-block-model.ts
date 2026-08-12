export type EditorMode = "edit" | "arrange" | "view";
export type BlockType = "heading" | "label" | "text" | "figure" | "figure-text" | "table" | "flow" | "pearl";
export type TextStyle = "paragraph" | "bullets" | "numbered";

export type FirstAidBlock = {
  id: string;
  type: BlockType;
  title?: string;
  titleHtml?: string;
  label?: string;
  labelHtml?: string;
  text?: string;
  textHtml?: string;
  textStyle?: TextStyle;
  imageAssetId?: string;
  imageObjectId?: string;
  imageName?: string;
  imageAspectRatio?: number;
  caption?: string;
  captionHtml?: string;
  imageSide?: "left" | "right";
  rows?: string[][];
  rowsHtml?: string[][];
  steps?: string[];
  stepsHtml?: string[];
};

const SERIALIZATION_VERSION = 4;
const LEGACY_SECTION_LABELS = [
  "TỔNG QUAN",
  "YẾU TỐ NGUY CƠ",
  "CƠ CHẾ",
  "LÂM SÀNG",
  "CHẨN ĐOÁN",
  "ĐIỀU TRỊ",
  "PEARL",
  "CLINICAL PEARL",
  "HIGH-YIELD",
  "ĐIỂM CẦN NHỚ",
] as const;

const LEGACY_FIRST_AID_STARTER_TEXT = [
  "TỔNG QUAN",
  "YẾU TỐ NGUY CƠ",
  "CƠ CHẾ",
  "LÂM SÀNG",
  "CHẨN ĐOÁN",
  "ĐIỀU TRỊ",
  "PEARL",
].join("\n");

const LEGACY_FIRST_AID_STARTER_MARKERS = [
  "Viết định nghĩa hoặc thông điệp cốt lõi tại đây.",
  "Yếu tố có thể thay đổi",
  "Yếu tố không thể thay đổi",
  "Nguyên nhân → cơ chế trung gian → biểu hiện.",
  "Triệu chứng, dấu hiệu và hình ảnh then chốt.",
  "Xét nghiệm đầu tay → xác nhận → phân tầng.",
  "Điều trị nền tảng, thuốc chính và theo dõi.",
  "Điểm dễ nhầm hoặc mẹo nhớ.",
] as const;

export function uid(prefix = "fa-block") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createBlock(type: BlockType): FirstAidBlock {
  switch (type) {
    case "heading": return { id: uid(), type, title: "TIÊU ĐỀ MỤC" };
    case "label": return { id: uid(), type, label: "NHÃN", text: "Nhập nội dung…" };
    case "text": return { id: uid(), type, text: "Nhập nội dung…", textStyle: "bullets" };
    case "figure": return { id: uid(), type, caption: "Nhập chú thích hình…" };
    case "figure-text": return { id: uid(), type, text: "Nhập nội dung liên quan đến hình…", caption: "Chú thích", imageSide: "left" };
    case "table": return { id: uid(), type, rows: [["Tiêu đề 1", "Tiêu đề 2"], ["Nội dung", "Nội dung"]] };
    case "flow": return { id: uid(), type, label: "CƠ CHẾ", steps: ["Bước 1", "Bước 2", "Bước 3"] };
    case "pearl": return { id: uid(), type, label: "HIGH-YIELD", text: "Điểm dễ nhầm hoặc mẹo nhớ." };
  }
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function lines(value = "") {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function plainTextToRichHtml(value = "") {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

export function sanitizeBlockRichTextHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "FONT", "SUB", "SUP", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD"]);
  const allowedStyles = ["fontFamily", "fontSize", "color", "backgroundColor", "fontWeight", "fontStyle", "textDecoration", "textAlign", "lineHeight", "listStyleType", "borderCollapse", "borderColor", "borderStyle", "borderWidth", "borderTop", "borderBottom", "width", "minWidth", "padding", "margin", "display", "alignItems", "gridTemplateColumns", "columnGap", "rowGap", "verticalAlign", "whiteSpace"] as const;
  Array.from(template.content.querySelectorAll<HTMLElement>("*")).forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(element.tagName)) {
        element.remove();
        return;
      }
      const parent = element.parentNode;
      while (parent && element.firstChild) parent.insertBefore(element.firstChild, element);
      element.remove();
      return;
    }
    const styles = Object.fromEntries(allowedStyles.map((property) => [property, element.style[property]]));
    const face = element.tagName === "FONT" ? element.getAttribute("face") : null;
    const color = element.tagName === "FONT" ? element.getAttribute("color") : null;
    const size = element.tagName === "FONT" ? element.getAttribute("size") : null;
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
    allowedStyles.forEach((property) => {
      const styleValue = styles[property];
      if (styleValue) element.style[property] = styleValue;
    });
    if (face) element.setAttribute("face", face);
    if (color) element.setAttribute("color", color);
    if (size && /^[1-7]$/.test(size)) element.setAttribute("size", size);
  });
  return template.innerHTML;
}

export function richBlockHtml(html: string | undefined, text = "", textStyle: TextStyle = "paragraph") {
  if (html) return html;
  if (textStyle === "paragraph") return plainTextToRichHtml(text);
  const tag = textStyle === "numbered" ? "ol" : "ul";
  return `<${tag}>${lines(text).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</${tag}>`;
}

function encodePayload(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.slice(index, index + 8192));
  return btoa(binary);
}

function decodePayload<T>(value: string): T {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export function blockPlainText(block: FirstAidBlock) {
  switch (block.type) {
    case "heading": return block.title ?? "";
    case "label": return `${block.label ?? ""}\n${block.text ?? ""}`.trim();
    case "text": return block.text ?? "";
    case "figure": return block.caption ?? "";
    case "figure-text": return `${block.text ?? ""}\n${block.caption ?? ""}`.trim();
    case "table": return (block.rows ?? []).map((row) => row.join(" | ")).join("\n");
    case "flow": return `${block.label ?? "CƠ CHẾ"}\n${(block.steps ?? []).join(" → ")}`.trim();
    case "pearl": return `${block.label ?? "HIGH-YIELD"}: ${block.text ?? ""}`;
  }
}

function blockStaticHtml(block: FirstAidBlock) {
  const border = "border-bottom:1px solid var(--fa-border,#b8c3c7);";
  const content = "font-family:'Times New Roman',serif;font-size:12px;line-height:1.32;color:var(--fa-ink,#26343a);";
  const rich = (html: string | undefined, text = "", textStyle: TextStyle = "paragraph") => sanitizeBlockRichTextHtml(richBlockHtml(html, text, textStyle));
  if (block.type === "heading") return `<div style="margin:0;padding:5px 8px;background-color:var(--fa-heading-bg,#1b7184);color:var(--fa-heading-ink,#fff);font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;line-height:1.2">${rich(block.titleHtml, block.title)}</div>`;
  if (block.type === "label") return `<div style="display:grid;grid-template-columns:22% 1fr;background-color:var(--fa-block-bg,#fff);${border}"><div style="padding:5px 6px;background-color:var(--fa-label-bg,#eff7f8);color:var(--fa-primary,#1b7184);border-right:1px solid var(--fa-soft-border,#d3e1e4);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label)}</div><div style="padding:5px 6px;${content}">${rich(block.textHtml, block.text)}</div></div>`;
  if (block.type === "text") return `<div style="padding:4px 6px;background-color:var(--fa-block-bg,#fff);${border}${content}">${rich(block.textHtml, block.text, block.textStyle)}</div>`;
  if (block.type === "figure" || block.type === "figure-text") {
    const objectAttribute = block.imageObjectId ? ` data-mednote-image-object-id="${escapeHtml(block.imageObjectId)}"` : "";
    const figure = `<div${objectAttribute} data-mednote-asset-id="${escapeHtml(block.imageAssetId)}" style="min-height:92px;display:grid;align-items:center;background-color:var(--fa-muted-bg,#eef3f4);color:var(--fa-muted-ink,#72828a);font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.3;text-align:center">${block.imageObjectId || block.imageAssetId ? "Hình là một đối tượng trên trang" : "Chưa có hình"}</div><div style="padding:3px 6px;background-color:var(--fa-caption-bg,#edf1f2);color:var(--fa-caption-ink,#43545d);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:600;line-height:1.3">${rich(block.captionHtml, block.caption)}</div>`;
    if (block.type === "figure") return `<div style="padding:6px;background-color:var(--fa-block-bg,#fff);${border}">${figure}</div>`;
    const text = `<div style="padding:5px 6px;${content}">${rich(block.textHtml, block.text)}</div>`;
    return `<div style="display:grid;grid-template-columns:44% 1fr;column-gap:8px;padding:6px;background-color:var(--fa-block-bg,#fff);${border}">${block.imageSide === "right" ? `${text}<div>${figure}</div>` : `<div>${figure}</div>${text}`}</div>`;
  }
  if (block.type === "table") return `<div style="padding:5px;background-color:var(--fa-block-bg,#fff);${border}"><table style="width:100%;border-collapse:collapse;${content}">${(block.rows ?? []).map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => `<${rowIndex === 0 ? "th" : "td"} style="padding:4px 5px;border-style:solid;border-width:1px;border-color:var(--fa-border,#b9c4c8);${rowIndex === 0 ? "color:var(--fa-primary,#1b7184);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.2;text-align:left;background-color:var(--fa-table-head-bg,#f2f6f7)" : "background-color:var(--fa-block-bg,#fff)"}">${rich(block.rowsHtml?.[rowIndex]?.[columnIndex], cell)}</${rowIndex === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table></div>`;
  if (block.type === "flow") {
    const flow = `<div style="display:flex;align-items:stretch;column-gap:4px;padding:5px 6px;${content}">${(block.steps ?? []).map((step, index, all) => `<div style="padding:5px;border-style:solid;border-width:1px;border-color:var(--fa-border,#b7c4c8);text-align:center;background-color:var(--fa-flow-step-bg,#fff)">${rich(block.stepsHtml?.[index], step)}</div>${index < all.length - 1 ? '<div style="display:grid;align-items:center;color:var(--fa-secondary,#8b2c58);font-weight:800">→</div>' : ""}`).join("")}</div>`;
    return `<div style="display:grid;grid-template-columns:22% 1fr;background-color:var(--fa-block-bg,#fff);${border}"><div style="padding:5px 6px;background-color:var(--fa-label-bg,#eff7f8);color:var(--fa-primary,#1b7184);border-right:1px solid var(--fa-soft-border,#d3e1e4);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label ?? "CƠ CHẾ")}</div>${flow}</div>`;
  }
  return `<div style="display:grid;grid-template-columns:22% 1fr;margin:2px 0;border-style:solid;border-width:1px;border-color:var(--fa-pearl-border,#e0c96e);background-color:var(--fa-pearl-bg,#fff7c7);color:var(--fa-pearl-ink,#3b3111)"><div style="padding:5px 6px;color:var(--fa-secondary,#8b2c58);border-right:1px solid var(--fa-pearl-border,#e7d98d);font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;line-height:1.25">${rich(block.labelHtml, block.label)}</div><div style="padding:5px 6px;font-family:'Times New Roman',serif;font-size:12px;line-height:1.32"><b>${rich(block.textHtml, block.text)}</b></div></div>`;
}

export function serializeBlocks(blocks: FirstAidBlock[]) {
  const payload = encodePayload({ version: SERIALIZATION_VERSION, blocks });
  const visible = blocks.map(blockStaticHtml).join("");
  return `<div data-mednote-first-aid-rendered="1" style="width:100%">${visible}</div><!--mednote-first-aid:${payload}-->`;
}

export function hasFirstAidBlockSerialization(html: string) {
  return /data-mednote-first-aid-rendered|<!--\s*mednote-first-aid:/i.test(html);
}

function firstAidPayloadComment(html: string) {
  return html.match(/<!--\s*mednote-first-aid:[A-Za-z0-9+/=]+\s*-->/i)?.[0] ?? "";
}

export function stripFirstAidBlockMetadata(html: string) {
  return html.replace(/<!--\s*mednote-first-aid:[A-Za-z0-9+/=]+\s*-->/gi, "");
}

/**
 * First Aid stores a styled, static rendering beside its block payload. That
 * rendering must not leak into the regular rich-text editor when the user
 * changes the paper template. Convert the blocks to semantic rich text while
 * keeping their order and character-level formatting.
 */
export function firstAidToStandardRichText(html: string, plainText: string) {
  const rich = (value: string | undefined, text = "", textStyle: TextStyle = "paragraph") =>
    sanitizeBlockRichTextHtml(richBlockHtml(value, text, textStyle));
  const heading = (value: string | undefined, text = "") => `<div><b>${rich(value, text)}</b></div>`;

  return parseBlocks(html, plainText).map((block) => {
    if (block.type === "heading") return heading(block.titleHtml, block.title);
    if (block.type === "label") return `${heading(block.labelHtml, block.label)}<div>${rich(block.textHtml, block.text)}</div>`;
    if (block.type === "text") return `<div>${rich(block.textHtml, block.text, block.textStyle)}</div>`;
    if (block.type === "figure") return block.caption || block.captionHtml
      ? `<div><i>${rich(block.captionHtml, block.caption)}</i></div>`
      : "";
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

function isLegacyFirstAidStarterContent(html: string, plainText: string) {
  const normalizedText = lines(plainText).join("\n");
  return normalizedText === LEGACY_FIRST_AID_STARTER_TEXT
    && LEGACY_FIRST_AID_STARTER_MARKERS.every((marker) => html.includes(marker));
}

export function regularTemplateRichText(html: string, plainText: string) {
  // Old blank First Aid sheets were persisted with instructional starter text.
  // Outside the First Aid template that content is not user data, so suppress it
  // instead of leaking the template scaffolding onto ruled/grid/blank paper.
  if (isLegacyFirstAidStarterContent(html, plainText)) return "";
  if (!hasFirstAidBlockSerialization(html)) return html;
  // Keep the payload as an invisible comment so switching back before editing
  // restores the exact block types. The regular editor removes it on its first
  // real change, preventing stale block data from overriding new text.
  return `${firstAidToStandardRichText(html, plainText)}${firstAidPayloadComment(html)}`;
}

function splitLegacySection(value = "") {
  const trimmed = value.trim();
  const firstLineEnd = trimmed.indexOf("\n");
  const firstLine = (firstLineEnd >= 0 ? trimmed.slice(0, firstLineEnd) : trimmed).trim();
  const normalizedFirstLine = firstLine.toLocaleUpperCase("vi-VN").replace(/\s+/g, " ");
  const label = LEGACY_SECTION_LABELS.find((candidate) => normalizedFirstLine === candidate || normalizedFirstLine.startsWith(`${candidate}:`));
  if (!label) return null;
  const inlineText = normalizedFirstLine.startsWith(`${label}:`) ? firstLine.slice(firstLine.indexOf(":") + 1).trim() : "";
  const remainingText = firstLineEnd >= 0 ? trimmed.slice(firstLineEnd + 1).trim() : "";
  return { label, text: [inlineText, remainingText].filter(Boolean).join("\n") };
}

function recoverLegacySections(blocks: FirstAidBlock[]) {
  const sections = blocks.map((block) => block.type === "text" ? splitLegacySection(block.text) : null);
  const recognized = sections.filter(Boolean).length;
  if (recognized < 3 || recognized < Math.ceil(blocks.length / 2)) return blocks;
  return blocks.map((block, index) => {
    const section = sections[index];
    if (!section) return block;
    if (["PEARL", "CLINICAL PEARL", "HIGH-YIELD", "ĐIỂM CẦN NHỚ"].includes(section.label)) return { ...createBlock("pearl"), id: block.id, label: section.label === "PEARL" ? "ĐIỂM CẦN NHỚ" : section.label, text: section.text || "Điểm dễ nhầm hoặc mẹo nhớ." };
    return { ...createBlock("label"), id: block.id, label: section.label, text: section.text };
  });
}

export function parseBlocks(html: string, plainText: string): FirstAidBlock[] {
  const payload = html.match(/<!--\s*mednote-first-aid:([A-Za-z0-9+/=]+)\s*-->/i)?.[1]
    ?? html.match(/<template[^>]*data-mednote-first-aid="([^"]+)"[^>]*>/i)?.[1];
  if (payload) {
    try {
      const parsed = decodePayload<{ version: number; blocks: FirstAidBlock[] }>(payload);
      if (Array.isArray(parsed.blocks) && parsed.blocks.length) return recoverLegacySections(parsed.blocks);
    } catch {
      // Fall through to legacy conversion.
    }
  }
  if (typeof DOMParser !== "undefined" && html.trim()) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const rows = Array.from(document.querySelectorAll("table tr"));
    if (rows.length) return rows.map((row) => {
      const label = row.querySelector("th")?.textContent?.trim() ?? "NHÃN";
      const text = row.querySelector("td")?.textContent?.trim() ?? "";
      return label.toUpperCase().includes("PEARL") ? { ...createBlock("pearl"), label, text } : { ...createBlock("label"), label, text };
    });
  }
  const paragraphs = plainText.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  if (paragraphs.length) return recoverLegacySections(paragraphs.map((text) => ({ ...createBlock("text"), text, textStyle: "paragraph" })));
  return [createBlock("heading"), createBlock("label"), createBlock("label"), createBlock("pearl")];
}