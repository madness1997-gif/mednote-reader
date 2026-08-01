import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Copy,
  GitBranch,
  GripVertical,
  Heading2,
  Image as ImageIcon,
  LayoutList,
  Lightbulb,
  List,
  Plus,
  Table2,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import "./first-aid-block-editor.css";

type EditorMode = "edit" | "arrange" | "view";
type BlockType = "heading" | "label" | "text" | "figure" | "figure-text" | "table" | "flow" | "pearl";
type TextStyle = "paragraph" | "bullets" | "numbered";

type FirstAidBlock = {
  id: string;
  type: BlockType;
  title?: string;
  label?: string;
  text?: string;
  textStyle?: TextStyle;
  imageAssetId?: string;
  imageObjectId?: string;
  imageName?: string;
  imageAspectRatio?: number;
  caption?: string;
  imageSide?: "left" | "right";
  rows?: string[][];
  steps?: string[];
};

type FirstAidBlockEditorProps = {
  html: string;
  plainText: string;
  mode: EditorMode;
  onChange: (html: string, plainText: string) => void;
  onInsertImage: (image: {
    blob: Blob;
    name: string;
    aspectRatio: number;
    placement: { x: number; y: number; width: number };
  }) => Promise<{ excerptId: string } | null>;
  onRemoveImage: (excerptId: string) => void;
  pageObjectIds: string[];
};

type BlockOption = {
  type: BlockType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SERIALIZATION_VERSION = 3;
const ASSET_DB = "mednote-first-aid-assets";
const ASSET_STORE = "assets";

const BLOCK_OPTIONS: BlockOption[] = [
  { type: "heading", label: "Tiêu đề mục", description: "Dải tiêu đề toàn chiều rộng", icon: Heading2 },
  { type: "label", label: "Nhãn – nội dung", description: "Cột nhãn trái, nội dung phải", icon: LayoutList },
  { type: "text", label: "Đoạn / danh sách", description: "Đoạn văn, bullet hoặc đánh số", icon: List },
  { type: "figure", label: "Hình + chú thích", description: "Một hình trong luồng trang", icon: ImageIcon },
  { type: "figure-text", label: "Hình + nội dung", description: "Hình và chữ đặt cạnh nhau", icon: Columns2 },
  { type: "table", label: "Bảng", description: "Bảng so sánh tự co giãn", icon: Table2 },
  { type: "flow", label: "Diễn tiến", description: "Các bước nối bằng mũi tên", icon: GitBranch },
  { type: "pearl", label: "Clinical pearl", description: "Điểm nhớ hoặc cảnh báo", icon: Lightbulb },
];

function uid(prefix = "fa-block") {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createBlock(type: BlockType): FirstAidBlock {
  switch (type) {
    case "heading":
      return { id: uid(), type, title: "TIÊU ĐỀ MỤC" };
    case "label":
      return { id: uid(), type, label: "NHÃN", text: "Nhập nội dung…" };
    case "text":
      return { id: uid(), type, text: "Nhập nội dung…", textStyle: "bullets" };
    case "figure":
      return { id: uid(), type, caption: "Nhập chú thích hình…" };
    case "figure-text":
      return { id: uid(), type, text: "Nhập nội dung liên quan đến hình…", caption: "Chú thích", imageSide: "left" };
    case "table":
      return { id: uid(), type, rows: [["Tiêu đề 1", "Tiêu đề 2"], ["Nội dung", "Nội dung"]] };
    case "flow":
      return { id: uid(), type, label: "CƠ CHẾ", steps: ["Bước 1", "Bước 2", "Bước 3"] };
    case "pearl":
      return { id: uid(), type, label: "HIGH-YIELD", text: "Điểm dễ nhầm hoặc mẹo nhớ." };
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

function lines(value = "") {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function encodePayload(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(binary);
}

function decodePayload<T>(value: string): T {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function blockPlainText(block: FirstAidBlock) {
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
  const border = "border-bottom:1px solid #b8c3c7;";
  const content = "font-family:'Times New Roman',serif;font-size:12px;line-height:1.32;color:#26343a;";
  if (block.type === "heading") {
    return `<div style="margin:0;padding:5px 8px;background:#1b7184;color:#fff;font:800 11px/1.2 'Segoe UI',Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(block.title)}</div>`;
  }
  if (block.type === "label") {
    return `<div style="display:grid;grid-template-columns:22% 1fr;${border}"><div style="padding:6px;color:#1b7184;font:800 9px/1.25 'Segoe UI',Arial,sans-serif;text-transform:uppercase">${escapeHtml(block.label)}</div><div style="padding:6px;white-space:pre-wrap;${content}">${escapeHtml(block.text)}</div></div>`;
  }
  if (block.type === "text") {
    const items = lines(block.text);
    const body = block.textStyle === "paragraph"
      ? `<div style="white-space:pre-wrap">${escapeHtml(block.text)}</div>`
      : `<${block.textStyle === "numbered" ? "ol" : "ul"} style="margin:0;padding-left:18px">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${block.textStyle === "numbered" ? "ol" : "ul"}>`;
    return `<div style="padding:6px;${border}${content}">${body}</div>`;
  }
  if (block.type === "figure" || block.type === "figure-text") {
    const objectAttribute = block.imageObjectId ? ` data-mednote-image-object-id="${escapeHtml(block.imageObjectId)}"` : "";
    const figure = `<div${objectAttribute} data-mednote-asset-id="${escapeHtml(block.imageAssetId)}" style="min-height:92px;display:grid;place-items:center;background:#eef3f4;color:#72828a;font:700 10px/1.3 'Segoe UI',Arial,sans-serif">${block.imageObjectId || block.imageAssetId ? "Hình là một đối tượng trên trang" : "Chưa có hình"}</div><div style="padding:4px 6px;background:#edf1f2;color:#43545d;font:600 9px/1.3 'Segoe UI',Arial,sans-serif">${escapeHtml(block.caption)}</div>`;
    if (block.type === "figure") return `<div style="padding:6px;${border}">${figure}</div>`;
    const text = `<div style="padding:6px;white-space:pre-wrap;${content}">${escapeHtml(block.text)}</div>`;
    return `<div style="display:grid;grid-template-columns:44% 1fr;gap:8px;padding:6px;${border}">${block.imageSide === "right" ? `${text}<div>${figure}</div>` : `<div>${figure}</div>${text}`}</div>`;
  }
  if (block.type === "table") {
    return `<div style="padding:6px;${border}"><table style="width:100%;border-collapse:collapse;${content}">${(block.rows ?? []).map((row, rowIndex) => `<tr>${row.map((cell) => `<${rowIndex === 0 ? "th" : "td"} style="padding:5px 6px;border:1px solid #b9c4c8;${rowIndex === 0 ? "color:#1b7184;font:800 9px/1.2 'Segoe UI',Arial,sans-serif;text-align:left;background:#f2f6f7" : ""}">${escapeHtml(cell)}</${rowIndex === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table></div>`;
  }
  if (block.type === "flow") {
    const flow = `<div style="display:flex;align-items:stretch;gap:5px;padding:7px 6px;${content}">${(block.steps ?? []).map((step, index, all) => `<div style="flex:1;padding:6px;border:1px solid #b7c4c8;border-radius:4px;text-align:center;background:#fff">${escapeHtml(step)}</div>${index < all.length - 1 ? '<div style="display:grid;place-items:center;color:#8b2c58;font-weight:800">→</div>' : ""}`).join("")}</div>`;
    return `<div style="display:grid;grid-template-columns:22% 1fr;${border}"><div style="padding:7px;color:#1b7184;background:#eff7f8;font:800 9px/1.25 'Segoe UI',Arial,sans-serif;text-transform:uppercase">${escapeHtml(block.label ?? "CƠ CHẾ")}</div>${flow}</div>`;
  }
  return `<div style="display:grid;grid-template-columns:22% 1fr;margin:4px 0;border:1px solid #e0c96e;background:#fff7c7"><div style="padding:6px;color:#8b2c58;font:800 9px/1.25 'Segoe UI',Arial,sans-serif;text-transform:uppercase">${escapeHtml(block.label)}</div><div style="padding:6px;white-space:pre-wrap;${content}"><b>${escapeHtml(block.text)}</b></div></div>`;
}

function serializeBlocks(blocks: FirstAidBlock[]) {
  const payload = encodePayload({ version: SERIALIZATION_VERSION, blocks });
  const visible = blocks.map(blockStaticHtml).join("");
  // Keep the structured payload in a comment. Rich-text sanitizing intentionally
  // preserves comments, while unknown elements/attributes may be removed when a
  // notebook is loaded. The visible HTML remains useful for export and fallback.
  return `<div data-mednote-first-aid-rendered="1" style="width:100%">${visible}</div><!--mednote-first-aid:${payload}-->`;
}

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
  // A single paragraph may legitimately start with words such as "CƠ CHẾ".
  // Only migrate when the page clearly resembles the former First Aid template.
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

function parseBlocks(html: string, plainText: string): FirstAidBlock[] {
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
    if (rows.length) {
      return rows.map((row) => {
        const label = row.querySelector("th")?.textContent?.trim() ?? "NHÃN";
        const text = row.querySelector("td")?.textContent?.trim() ?? "";
        return label.toUpperCase().includes("PEARL")
          ? { ...createBlock("pearl"), label, text }
          : { ...createBlock("label"), label, text };
      });
    }
  }
  const paragraphs = plainText.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  if (paragraphs.length) return recoverLegacySections(paragraphs.map((text) => ({ ...createBlock("text"), text, textStyle: "paragraph" })));
  return [createBlock("heading"), createBlock("label"), createBlock("label"), createBlock("pearl")];
}

function openAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) request.result.createObjectStore(ASSET_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAsset(id: string) {
  const database = await openAssetDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(ASSET_STORE, "readonly").objectStore(ASSET_STORE).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return blob;
}

async function compressImage(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? file), "image/webp", 0.84));
    return { blob, aspectRatio: canvas.width / Math.max(1, canvas.height) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function AutoTextarea({ value, onChange, readOnly, placeholder, ariaLabel, className = "", onKeyDown }: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = "0px";
    ref.current.style.height = `${Math.max(28, ref.current.scrollHeight)}px`;
  };
  useEffect(resize, [value]);
  return <textarea ref={ref} className={className} value={value} readOnly={readOnly} placeholder={placeholder} aria-label={ariaLabel} rows={1} onChange={(event) => { onChange(event.target.value); resize(); }} onKeyDown={onKeyDown} />;
}

function InsertMenu({ onInsert, onClose }: { onInsert: (type: BlockType) => void; onClose: () => void }) {
  return (
    <div className="fa-block-menu" role="dialog" aria-label="Chọn loại block">
      <header><strong>Thêm block</strong><button onClick={onClose} aria-label="Đóng"><X size={15} /></button></header>
      <div className="fa-block-menu-grid">
        {BLOCK_OPTIONS.map(({ type, label, description, icon: Icon }) => <button key={type} onClick={() => onInsert(type)}><Icon size={18} /><span><b>{label}</b><small>{description}</small></span></button>)}
      </div>
    </div>
  );
}

export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, pageObjectIds }: FirstAidBlockEditorProps) {
  const [blocks, setBlocks] = useState<FirstAidBlock[]>(() => parseBlocks(html, plainText));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetUrlsRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageBlockRef = useRef<{ blockId: string; placement: { x: number; y: number; width: number } } | null>(null);
  const canManage = mode !== "view";
  const canEdit = mode === "edit";
  const pageObjectKey = [...pageObjectIds].sort().join("|");
  const assetIds = useMemo(() => Array.from(new Set(blocks.map((block) => block.imageAssetId).filter((value): value is string => Boolean(value)))).sort(), [blocks]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(assetIds.map(async (id) => {
      if (assetUrlsRef.current[id]) return;
      const blob = await readAsset(id);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      assetUrlsRef.current[id] = url;
      setAssetUrls((current) => ({ ...current, [id]: url }));
    }));
    return () => { cancelled = true; };
  }, [assetIds.join("|")]);

  useEffect(() => () => {
    Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const normalizedHtml = serializeBlocks(blocks);
    if (html === normalizedHtml) return;
    onChange(normalizedHtml, blocks.map(blockPlainText).filter(Boolean).join("\n\n"));
    // Normalize legacy/sanitized First Aid pages once when this note is opened.
    // The editor is keyed by page id, so later edits continue through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: FirstAidBlock[]) => {
    setBlocks(next);
    onChange(serializeBlocks(next), next.map(blockPlainText).filter(Boolean).join("\n\n"));
  };

  useEffect(() => {
    const knownObjects = new Set(pageObjectIds);
    const next = blocks.map((block) => block.imageObjectId && !knownObjects.has(block.imageObjectId)
      ? { ...block, imageObjectId: undefined, imageName: undefined, imageAspectRatio: undefined }
      : block);
    if (next.some((block, index) => block !== blocks[index])) commit(next);
    // A deleted page object turns its anchored row back into a Browse row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageObjectKey]);

  const updateBlock = (id: string, changes: Partial<FirstAidBlock>) => commit(blocks.map((block) => block.id === id ? { ...block, ...changes } : block));

  const insertBlock = (type: BlockType, index: number) => {
    const next = [...blocks];
    const block = createBlock(type);
    next.splice(index, 0, block);
    commit(next);
    setSelectedId(block.id);
    setInsertAt(null);
  };

  const removeBlock = (id: string) => {
    const imageObjectId = blocks.find((block) => block.id === id)?.imageObjectId;
    const next = blocks.filter((block) => block.id !== id);
    commit(next.length ? next : [createBlock("label")]);
    if (imageObjectId) onRemoveImage(imageObjectId);
    setSelectedId(null);
  };

  const duplicateBlock = (id: string) => {
    const index = blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const copy = { ...blocks[index], id: uid(), imageObjectId: undefined, imageAssetId: undefined, imageName: undefined, imageAspectRatio: undefined, rows: blocks[index].rows?.map((row) => [...row]), steps: blocks[index].steps ? [...blocks[index].steps] : undefined };
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    commit(next);
    setSelectedId(copy.id);
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const moveToIndex = (id: string, targetIndex: number) => {
    const from = blocks.findIndex((block) => block.id === id);
    if (from < 0) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    const destination = from < targetIndex ? Math.max(0, targetIndex - 1) : targetIndex;
    next.splice(Math.min(destination, next.length), 0, item);
    commit(next);
  };

  const convertBlock = (id: string, type: BlockType) => {
    const current = blocks.find((block) => block.id === id);
    if (!current || current.type === type) return;
    const seed = blockPlainText(current);
    const replacement = createBlock(type);
    replacement.id = id;
    if (type === "heading") replacement.title = seed || replacement.title;
    else if (type === "label" || type === "pearl") replacement.text = seed || replacement.text;
    else if (type === "text" || type === "figure-text") replacement.text = seed || replacement.text;
    else if (type === "flow") replacement.steps = lines(seed).length ? lines(seed) : [seed || "Bước 1"];
    commit(blocks.map((block) => block.id === id ? replacement : block));
    if (current.imageObjectId) onRemoveImage(current.imageObjectId);
  };

  const onBlockKeyDown = (event: KeyboardEvent<HTMLElement>, block: FirstAidBlock) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      const index = blocks.findIndex((item) => item.id === block.id);
      insertBlock(block.type, index + 1);
    }
  };

  const blockPlacement = (element: HTMLElement) => {
    const page = element.closest<HTMLElement>(".typed-layer");
    if (!page) return { x: .1, y: .28, width: .8 };
    const elementRect = element.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const width = Math.min(.9, Math.max(.06, elementRect.width / Math.max(1, pageRect.width)));
    return {
      x: Math.min(1 - width, Math.max(0, (elementRect.left - pageRect.left) / Math.max(1, pageRect.width))),
      y: Math.min(.94, Math.max(.04, (elementRect.top - pageRect.top) / Math.max(1, pageRect.height))),
      width,
    };
  };

  const requestImage = (blockId: string, element: HTMLElement) => {
    if (!canEdit) return;
    pendingImageBlockRef.current = { blockId, placement: blockPlacement(element) };
    fileInputRef.current?.click();
  };

  const applyImageFile = async (blockId: string, file: File, placement: { x: number; y: number; width: number }) => {
    if (!file.type.startsWith("image/")) return;
    const { blob, aspectRatio } = await compressImage(file);
    const inserted = await onInsertImage({ blob, name: file.name, aspectRatio, placement });
    if (inserted) updateBlock(blockId, { imageObjectId: inserted.excerptId, imageAssetId: undefined, imageName: file.name, imageAspectRatio: aspectRatio });
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const pending = pendingImageBlockRef.current;
    event.target.value = "";
    pendingImageBlockRef.current = null;
    if (file && pending) void applyImageFile(pending.blockId, file, pending.placement);
  };

  const updateTableCell = (block: FirstAidBlock, rowIndex: number, columnIndex: number, value: string) => {
    const rows = (block.rows ?? [["", ""]]).map((row) => [...row]);
    rows[rowIndex][columnIndex] = value;
    updateBlock(block.id, { rows });
  };

  const renderImageZone = (block: FirstAidBlock) => {
    if (block.imageObjectId) {
      return <div className="fa-linked-image-space" style={{ aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;
    }
    const url = block.imageAssetId ? assetUrls[block.imageAssetId] : undefined;
    return (
      <div className={`fa-image-zone ${url ? "has-image" : ""}`} onClick={(event) => requestImage(block.id, event.currentTarget)} onDragOver={(event) => { if (canEdit) event.preventDefault(); }} onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        event.stopPropagation();
        const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
        if (file) void applyImageFile(block.id, file, blockPlacement(event.currentTarget));
      }}>
        {url ? <img src={url} alt={block.imageName || "Hình trong note"} /> : <><ImageIcon size={24} /><b>Thả, dán hoặc chọn hình</b><small>Ảnh được nén và lưu cục bộ</small></>}
      </div>
    );
  };

  const renderBlockBody = (block: FirstAidBlock) => {
    if (block.type === "heading") return <input className="fa-heading-input" value={block.title ?? ""} readOnly={!canEdit} onChange={(event) => updateBlock(block.id, { title: event.target.value })} aria-label="Tiêu đề mục" />;
    if (block.type === "label") return <div className="fa-label-layout"><AutoTextarea className="fa-label-input" value={block.label ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { label: value })} ariaLabel="Nhãn block" /><AutoTextarea className="fa-content-input" value={block.text ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { text: value })} ariaLabel="Nội dung block" /></div>;
    if (block.type === "text") return <div className="fa-text-block"><div className="fa-text-style-switch">{(["paragraph", "bullets", "numbered"] as TextStyle[]).map((style) => <button key={style} className={block.textStyle === style ? "selected" : ""} disabled={!canEdit} onClick={() => updateBlock(block.id, { textStyle: style })}>{style === "paragraph" ? "Đoạn" : style === "bullets" ? "• Danh sách" : "1. Đánh số"}</button>)}</div><AutoTextarea className="fa-content-input" value={block.text ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { text: value })} ariaLabel="Đoạn hoặc danh sách" placeholder="Mỗi dòng là một ý…" /></div>;
    if (block.type === "figure") return <div className="fa-figure-block">{renderImageZone(block)}<AutoTextarea className="fa-caption-input" value={block.caption ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { caption: value })} ariaLabel="Chú thích hình" /></div>;
    if (block.type === "figure-text") return <div className={`fa-figure-text ${block.imageSide === "right" ? "image-right" : ""}`}><div className="fa-figure-block">{renderImageZone(block)}<AutoTextarea className="fa-caption-input" value={block.caption ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { caption: value })} ariaLabel="Chú thích hình" /></div><div className="fa-figure-copy"><button className="fa-side-toggle" disabled={!canEdit} onClick={() => updateBlock(block.id, { imageSide: block.imageSide === "right" ? "left" : "right" })}>{block.imageSide === "right" ? "Đưa hình sang trái" : "Đưa hình sang phải"}</button><AutoTextarea className="fa-content-input" value={block.text ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { text: value })} ariaLabel="Nội dung cạnh hình" /></div></div>;
    if (block.type === "table") {
      const rows = block.rows ?? [["", ""]];
      const columns = Math.max(1, rows[0]?.length ?? 2);
      return <div className="fa-table-block"><div className="fa-table-actions"><button disabled={!canEdit} onClick={() => updateBlock(block.id, { rows: [...rows, Array.from({ length: columns }, () => "Nội dung")] })}>+ Hàng</button><button disabled={!canEdit} onClick={() => updateBlock(block.id, { rows: rows.map((row, index) => [...row, index === 0 ? `Tiêu đề ${columns + 1}` : "Nội dung"]) })}>+ Cột</button><button disabled={!canEdit || rows.length <= 1} onClick={() => updateBlock(block.id, { rows: rows.slice(0, -1) })}>− Hàng</button><button disabled={!canEdit || columns <= 1} onClick={() => updateBlock(block.id, { rows: rows.map((row) => row.slice(0, -1)) })}>− Cột</button></div><div className="fa-table-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <AutoTextarea key={`${rowIndex}-${columnIndex}`} className={rowIndex === 0 ? "fa-table-head" : "fa-table-cell"} value={cell} readOnly={!canEdit} onChange={(value) => updateTableCell(block, rowIndex, columnIndex, value)} ariaLabel={`Ô ${rowIndex + 1}, ${columnIndex + 1}`} />))}</div></div>;
    }
    if (block.type === "flow") {
      const steps = block.steps ?? ["Bước 1"];
      return <div className="fa-flow-layout"><AutoTextarea className="fa-flow-label" value={block.label ?? "CƠ CHẾ"} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { label: value })} ariaLabel="Nhãn diễn tiến" /><div className="fa-flow-block">{steps.map((step, index) => <div className="fa-flow-item" key={`${block.id}-${index}`}><AutoTextarea value={step} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { steps: steps.map((item, itemIndex) => itemIndex === index ? value : item) })} ariaLabel={`Bước ${index + 1}`} />{canEdit && steps.length > 1 && <button onClick={() => updateBlock(block.id, { steps: steps.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Xóa bước ${index + 1}`}><X size={13} /></button>}{index < steps.length - 1 && <span>↓</span>}</div>)}<button className="fa-add-step" disabled={!canEdit} onClick={() => updateBlock(block.id, { steps: [...steps, `Bước ${steps.length + 1}`] })}><Plus size={14} /> Thêm bước</button></div></div>;
    }
    return <div className="fa-pearl-layout"><AutoTextarea className="fa-pearl-label" value={block.label ?? "HIGH-YIELD"} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { label: value })} ariaLabel="Nhãn pearl" /><AutoTextarea className="fa-pearl-text" value={block.text ?? ""} readOnly={!canEdit} onChange={(value) => updateBlock(block.id, { text: value })} ariaLabel="Nội dung pearl" /></div>;
  };

  return (
    <div className={`fa-block-editor mode-${mode}`} onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
      <input ref={fileInputRef} className="fa-hidden-input" type="file" accept="image/*" onChange={onFileChange} />
      <div className="fa-insert-slot first">
        <button className="fa-insert-button" disabled={!canManage} onClick={() => setInsertAt(insertAt === 0 ? null : 0)} aria-label="Thêm block đầu trang"><Plus size={14} /></button>
        {insertAt === 0 && <InsertMenu onInsert={(type) => insertBlock(type, 0)} onClose={() => setInsertAt(null)} />}
      </div>
      {blocks.map((block, index) => {
        const selected = selectedId === block.id;
        return (
          <div className={`fa-block-wrap ${selected ? "has-selected-block" : ""}`} key={block.id}>
            <section className={`fa-block fa-block-${block.type} ${selected ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); if (canManage) setSelectedId(block.id); }} onKeyDown={(event) => onBlockKeyDown(event, block)} onDragOver={(event) => { if (draggedId) event.preventDefault(); }} onDrop={(event: DragEvent<HTMLElement>) => { event.preventDefault(); if (draggedId) moveToIndex(draggedId, index); setDraggedId(null); }}>
              {canManage && <div className="fa-block-toolbar" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <button type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedId(block.id); }} onDragEnd={() => setDraggedId(null)} aria-label="Kéo để đổi thứ tự" title="Kéo để đổi thứ tự"><GripVertical size={15} /></button>
                <select value={block.type} onChange={(event) => convertBlock(block.id, event.target.value as BlockType)} aria-label="Đổi loại block">{BLOCK_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select>
                <button type="button" disabled={index === 0} onClick={() => moveBlock(block.id, -1)} aria-label="Đưa block lên"><ArrowUp size={14} /></button>
                <button type="button" disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} aria-label="Đưa block xuống"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => duplicateBlock(block.id)} aria-label="Nhân bản block"><Copy size={14} /></button>
                <button type="button" className="danger" onClick={() => removeBlock(block.id)} aria-label="Xóa block"><Trash2 size={14} /></button>
              </div>}
              {renderBlockBody(block)}
            </section>
            <div className={`fa-insert-slot ${index === blocks.length - 1 ? "last" : ""}`}>
              <span />
              <button className={`fa-insert-button ${index === blocks.length - 1 ? "persistent" : ""}`} disabled={!canManage} onClick={() => setInsertAt(insertAt === index + 1 ? null : index + 1)} aria-label={`Thêm block sau block ${index + 1}`}><Plus size={14} />{index === blocks.length - 1 && <b>Thêm block</b>}</button>
              <span />
              {insertAt === index + 1 && <InsertMenu onInsert={(type) => insertBlock(type, index + 1)} onClose={() => setInsertAt(null)} />}
            </div>
          </div>
        );
      })}
      {!canManage && <div className="fa-view-hint"><Type size={14} /> Chọn công cụ Type để sửa block, hoặc Pointer để sắp xếp.</div>}
    </div>
  );
}
