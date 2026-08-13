import { createBlock, lines, type FirstAidBlock } from "./first-aid-block-domain";
import { renderFirstAidBlocksHtml, sanitizeBlockRichTextHtml } from "./first-aid-block-renderer";

export const FIRST_AID_SERIALIZATION_VERSION = 4;

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

type FirstAidPayload = {
  version?: number;
  blocks?: FirstAidBlock[];
};

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
    if (["PEARL", "CLINICAL PEARL", "HIGH-YIELD", "ĐIỂM CẦN NHỚ"].includes(section.label)) {
      return { ...createBlock("pearl"), id: block.id, label: section.label === "PEARL" ? "ĐIỂM CẦN NHỚ" : section.label, text: section.text || "Điểm dễ nhầm hoặc mẹo nhớ." };
    }
    return { ...createBlock("label"), id: block.id, label: section.label, text: section.text };
  });
}

function normalizedNodeText(value: string | null | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function legacyTableBlocks(table: HTMLTableElement) {
  const rows = Array.from(table.querySelectorAll("tr"));
  const labels = rows.map((row) => normalizedNodeText(row.querySelector("th")?.textContent).toLocaleUpperCase("vi-VN").replace(/\s+/g, " "));
  const recognized = labels.filter((label) => LEGACY_SECTION_LABELS.some((candidate) => label === candidate || label.startsWith(`${candidate}:`))).length;
  if (recognized < 3 || recognized < Math.ceil(rows.length / 2)) return null;
  return rows.map((row) => {
    const header = row.querySelector("th");
    const cell = row.querySelector("td");
    const label = normalizedNodeText(header?.textContent) || "NHÃN";
    const text = normalizedNodeText(cell?.textContent);
    const labelHtml = header ? sanitizeBlockRichTextHtml(header.innerHTML) : undefined;
    const textHtml = cell ? sanitizeBlockRichTextHtml(cell.innerHTML) : undefined;
    if (["PEARL", "CLINICAL PEARL", "HIGH-YIELD", "ĐIỂM CẦN NHỚ"].some((candidate) => label.toLocaleUpperCase("vi-VN").includes(candidate))) {
      return { ...createBlock("pearl"), label, labelHtml, text, textHtml };
    }
    return { ...createBlock("label"), label, labelHtml, text, textHtml };
  });
}

function regularTableBlock(table: HTMLTableElement): FirstAidBlock | null {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return null;
  const rowCells = rows.map((row) => Array.from(row.querySelectorAll(":scope > th, :scope > td")));
  const width = Math.max(0, ...rowCells.map((cells) => cells.length));
  if (!width) return null;
  const values = rowCells.map((cells) => Array.from({ length: width }, (_, index) => normalizedNodeText(cells[index]?.textContent)));
  const valuesHtml = rowCells.map((cells) => Array.from({ length: width }, (_, index) => sanitizeBlockRichTextHtml(cells[index]?.innerHTML ?? "")));
  return { ...createBlock("table"), rows: values, rowsHtml: valuesHtml };
}

function listBlock(element: HTMLElement): FirstAidBlock {
  const ordered = element.tagName === "OL";
  const items = Array.from(element.querySelectorAll(":scope > li"));
  const text = items.map((item) => normalizedNodeText(item.textContent)).filter(Boolean).join("\n");
  return {
    ...createBlock("text"),
    text,
    textHtml: sanitizeBlockRichTextHtml(element.outerHTML),
    textStyle: ordered ? "numbered" : "bullets",
  };
}

function regularElementBlocks(element: HTMLElement): FirstAidBlock[] {
  if (element.tagName === "TABLE") {
    const legacy = legacyTableBlocks(element as HTMLTableElement);
    if (legacy) return legacy;
    const table = regularTableBlock(element as HTMLTableElement);
    return table ? [table] : [];
  }
  if (element.tagName === "UL" || element.tagName === "OL") return [listBlock(element)];
  const text = normalizedNodeText(element.textContent);
  const html = sanitizeBlockRichTextHtml(element.outerHTML);
  if (!text && !html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "").trim()) return [];
  return [{ ...createBlock("text"), text, textHtml: html, textStyle: "paragraph" }];
}

function regularRichTextBlocks(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const blocks: FirstAidBlock[] = [];
  parsed.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizedNodeText(node.textContent);
      if (text) blocks.push({ ...createBlock("text"), text, textStyle: "paragraph" });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    blocks.push(...regularElementBlocks(node as HTMLElement));
  });
  return recoverLegacySections(blocks);
}

/**
 * Central migration boundary for persisted First Aid payloads.
 * v1-v4 share the same block envelope; legacy semantic repair is applied here,
 * not in the editor or renderer. Keep this function as the only place that
 * understands serialized versions when a v5+ schema is introduced.
 */
export function migrateFirstAidPayload(payload: FirstAidPayload): FirstAidBlock[] | null {
  if (!Array.isArray(payload.blocks)) return null;
  const version = Number(payload.version ?? 1);
  if (!Number.isFinite(version) || version < 1 || version > FIRST_AID_SERIALIZATION_VERSION) return null;
  return recoverLegacySections(payload.blocks);
}

export function serializeBlocks(blocks: FirstAidBlock[]) {
  const payload = encodePayload({ version: FIRST_AID_SERIALIZATION_VERSION, blocks });
  const visible = renderFirstAidBlocksHtml(blocks);
  return `<div data-mednote-first-aid-rendered="1" style="width:100%">${visible}</div><!--mednote-first-aid:${payload}-->`;
}

export function hasFirstAidBlockSerialization(html: string) {
  return /data-mednote-first-aid-rendered|<!--\s*mednote-first-aid:/i.test(html);
}

export function firstAidPayloadComment(html: string) {
  return html.match(/<!--\s*mednote-first-aid:[A-Za-z0-9+/=]+\s*-->/i)?.[0] ?? "";
}

export function stripFirstAidBlockMetadata(html: string) {
  return html.replace(/<!--\s*mednote-first-aid:[A-Za-z0-9+/=]+\s*-->/gi, "");
}

export function isLegacyFirstAidStarterContent(html: string, plainText: string) {
  const normalizedText = lines(plainText).join("\n");
  return normalizedText === LEGACY_FIRST_AID_STARTER_TEXT
    && LEGACY_FIRST_AID_STARTER_MARKERS.every((marker) => html.includes(marker));
}

export function parseBlocks(html: string, plainText: string): FirstAidBlock[] {
  const payload = html.match(/<!--\s*mednote-first-aid:([A-Za-z0-9+/=]+)\s*-->/i)?.[1]
    ?? html.match(/<template[^>]*data-mednote-first-aid="([^"]+)"[^>]*>/i)?.[1];
  if (payload) {
    try {
      const migrated = migrateFirstAidPayload(decodePayload<FirstAidPayload>(payload));
      if (migrated) return migrated;
    } catch {
      // Fall through to legacy HTML/plain-text recovery.
    }
  }
  if (typeof DOMParser !== "undefined" && html.trim()) {
    const imported = regularRichTextBlocks(html);
    if (imported.length) return imported;
  }
  const paragraphs = plainText.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  if (paragraphs.length) return recoverLegacySections(paragraphs.map((text) => ({ ...createBlock("text"), text, textStyle: "paragraph" })));
  return [];
}
