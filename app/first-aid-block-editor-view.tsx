import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Copy,
  Crop,
  GitBranch,
  GripVertical,
  Heading2,
  Image as ImageIcon,
  LayoutList,
  Lightbulb,
  List,
  Minus,
  Plus,
  Rows3,
  Table2,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import "./first-aid-block-editor.css";
import { RichTextEditor } from "./rich-text-editor";
import {
  blockPlainText,
  createBlock,
  lines,
  parseBlocks,
  plainTextToRichHtml,
  richBlockHtml,
  sanitizeBlockRichTextHtml,
  serializeBlocks,
  uid,
  type BlockType,
  type EditorMode,
  type FirstAidBlock,
  type TextStyle,
} from "./first-aid-block-model";
import { compressFirstAidImage, readFirstAidAsset } from "./first-aid-image-service";

type PdfCropResultLink = {
  token: string;
  blockId: string;
  excerptId: string;
  imageName: string;
  aspectRatio: number;
};

type FirstAidBlockEditorProps = {
  html: string;
  plainText: string;
  mode: EditorMode;
  onChange: (html: string, plainText: string) => void;
  onInsertImage: (image: { blob: Blob; name: string; aspectRatio: number; placement: { x: number; y: number; width: number } }) => Promise<{ excerptId: string } | null>;
  onRemoveImage: (excerptId: string) => void;
  onRequestPdfCrop: (request: { blockId: string; placement: { x: number; y: number; width: number } }) => void;
  pdfCropResult: PdfCropResultLink | null;
  onPdfCropHandled: (token: string) => void;
  pageObjectIds: string[];
  pageObjectLayouts: Record<string, { height: number }>;
  pageHeightCss: number;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
};

type BlockOption = { type: BlockType; label: string; description: string; icon: LucideIcon };

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

function BlockRichEditor({ editorId, className = "", html, text, textStyle = "paragraph", editable, singleLine = false, placeholder, ariaLabel, onChange, onActivate, onNormalizeInput }: {
  editorId: string; className?: string; html?: string; text?: string; textStyle?: TextStyle; editable: boolean; singleLine?: boolean; placeholder?: string; ariaLabel: string;
  onChange: (html: string, text: string) => void; onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void; onNormalizeInput: (editorId: string, editor: HTMLElement) => void;
}) {
  return <RichTextEditor editorId={editorId} className={`fa-rich-editor ${className}`} html={richBlockHtml(html, text, textStyle)} editable={editable} singleLine={singleLine} placeholder={placeholder} ariaLabel={ariaLabel} onChange={(nextHtml, nextText) => onChange(sanitizeBlockRichTextHtml(nextHtml), nextText)} onActivate={onActivate} onNormalizeInput={onNormalizeInput} />;
}

function InsertMenu({ onInsert, onClose }: { onInsert: (type: BlockType) => void; onClose: () => void }) {
  return <div className="fa-block-menu" role="dialog" aria-label="Chọn loại block">
    <header><strong>Thêm block</strong><button onClick={onClose} aria-label="Đóng"><X size={15} /></button></header>
    <div className="fa-block-menu-grid">{BLOCK_OPTIONS.map(({ type, label, description, icon: Icon }) => <button key={type} onClick={() => onInsert(type)}><Icon size={18} /><span><b>{label}</b><small>{description}</small></span></button>)}</div>
  </div>;
}

export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, onRequestPdfCrop, pdfCropResult, onPdfCropHandled, pageObjectIds, pageObjectLayouts, pageHeightCss, onTextActivate, onNormalizeTextInput }: FirstAidBlockEditorProps) {
  const [blocks, setBlocks] = useState<FirstAidBlock[]>(() => parseBlocks(html, plainText));
  const blocksRef = useRef(blocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetUrlsRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageBlockRef = useRef<{ blockId: string; placement: { x: number; y: number; width: number } } | null>(null);
  const normalizedOnceRef = useRef(false);
  const handledCropTokenRef = useRef<string | null>(null);
  const canManage = mode !== "view";
  const canEdit = mode === "edit";
  const pageObjectKey = [...pageObjectIds].sort().join("|");
  const pageObjectLayoutKey = pageObjectIds.map((id) => `${id}:${pageObjectLayouts[id]?.height ?? 0}`).join("|");
  const assetIds = useMemo(() => Array.from(new Set(blocks.map((block) => block.imageAssetId).filter((value): value is string => Boolean(value)))).sort(), [blocks]);
  const assetIdsKey = assetIds.join("|");

  const commit = useCallback((nextOrUpdater: FirstAidBlock[] | ((current: FirstAidBlock[]) => FirstAidBlock[])) => {
    const current = blocksRef.current;
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
    if (next === current) return;
    blocksRef.current = next;
    setBlocks(next);
    onChange(serializeBlocks(next), next.map(blockPlainText).filter(Boolean).join("\n\n"));
  }, [onChange]);

  useEffect(() => {
    if (normalizedOnceRef.current) return;
    normalizedOnceRef.current = true;
    const normalizedHtml = serializeBlocks(blocksRef.current);
    if (html !== normalizedHtml) onChange(normalizedHtml, blocksRef.current.map(blockPlainText).filter(Boolean).join("\n\n"));
  }, [html, onChange]);

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(assetIds);
    for (const [id, url] of Object.entries(assetUrlsRef.current)) {
      if (wanted.has(id)) continue;
      URL.revokeObjectURL(url);
      delete assetUrlsRef.current[id];
      setAssetUrls((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
    void Promise.all(assetIds.map(async (id) => {
      if (assetUrlsRef.current[id]) return;
      const blob = await readFirstAidAsset(id);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      assetUrlsRef.current[id] = url;
      setAssetUrls((current) => ({ ...current, [id]: url }));
    }));
    return () => { cancelled = true; };
  }, [assetIdsKey]);

  useEffect(() => () => {
    Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    assetUrlsRef.current = {};
  }, []);

  useEffect(() => {
    const knownObjects = new Set(pageObjectIds);
    commit((current) => {
      const next = current.map((block) => block.imageObjectId && !knownObjects.has(block.imageObjectId)
        ? { ...block, imageObjectId: undefined, imageName: undefined, imageAspectRatio: undefined }
        : block);
      return next.some((block, index) => block !== current[index]) ? next : current;
    });
  }, [pageObjectKey, commit]);

  useEffect(() => {
    if (!pdfCropResult || handledCropTokenRef.current === pdfCropResult.token) return;
    handledCropTokenRef.current = pdfCropResult.token;
    commit((current) => current.some((block) => block.id === pdfCropResult.blockId)
      ? current.map((block) => block.id === pdfCropResult.blockId ? { ...block, imageObjectId: pdfCropResult.excerptId, imageAssetId: undefined, imageName: pdfCropResult.imageName, imageAspectRatio: pdfCropResult.aspectRatio } : block)
      : current);
    onPdfCropHandled(pdfCropResult.token);
  }, [pdfCropResult, commit, onPdfCropHandled]);

  const updateBlock = useCallback((id: string, changes: Partial<FirstAidBlock>) => commit((current) => current.map((block) => block.id === id ? { ...block, ...changes } : block)), [commit]);

  const insertBlock = (type: BlockType, index: number) => {
    const block = createBlock(type);
    commit((current) => {
      const next = [...current];
      next.splice(index, 0, block);
      return next;
    });
    setSelectedId(block.id);
    setInsertAt(null);
  };

  const removeBlock = (id: string) => {
    const imageObjectId = blocksRef.current.find((block) => block.id === id)?.imageObjectId;
    commit((current) => {
      const next = current.filter((block) => block.id !== id);
      return next;
    });
    if (imageObjectId) onRemoveImage(imageObjectId);
    setSelectedId(null);
  };

  const duplicateBlock = (id: string) => {
    const current = blocksRef.current;
    const index = current.findIndex((block) => block.id === id);
    if (index < 0) return;
    const source = current[index];
    const copy = { ...source, id: uid(), imageObjectId: undefined, imageAssetId: undefined, imageName: undefined, imageAspectRatio: undefined, rows: source.rows?.map((row) => [...row]), rowsHtml: source.rowsHtml?.map((row) => [...row]), steps: source.steps ? [...source.steps] : undefined, stepsHtml: source.stepsHtml ? [...source.stepsHtml] : undefined };
    commit((latest) => {
      const latestIndex = latest.findIndex((block) => block.id === id);
      if (latestIndex < 0) return latest;
      const next = [...latest];
      next.splice(latestIndex + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  };

  const moveBlock = (id: string, direction: -1 | 1) => commit((current) => {
    const index = current.findIndex((block) => block.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const moveToIndex = (id: string, targetIndex: number) => commit((current) => {
    const from = current.findIndex((block) => block.id === id);
    if (from < 0) return current;
    const next = [...current];
    const [item] = next.splice(from, 1);
    const destination = from < targetIndex ? Math.max(0, targetIndex - 1) : targetIndex;
    next.splice(Math.min(destination, next.length), 0, item);
    return next;
  });

  const convertBlock = (id: string, type: BlockType) => {
    const current = blocksRef.current.find((block) => block.id === id);
    if (!current || current.type === type) return;
    const seed = blockPlainText(current);
    const replacement = createBlock(type);
    replacement.id = id;
    if (type === "heading") replacement.title = seed || replacement.title;
    else if (type === "label" || type === "pearl" || type === "text" || type === "figure-text") replacement.text = seed || replacement.text;
    else if (type === "flow") replacement.steps = lines(seed).length ? lines(seed) : [seed];
    commit((latest) => latest.map((block) => block.id === id ? replacement : block));
    if (current.imageObjectId) onRemoveImage(current.imageObjectId);
  };

  const onBlockKeyDown = (event: KeyboardEvent<HTMLElement>, block: FirstAidBlock) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      const index = blocksRef.current.findIndex((item) => item.id === block.id);
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

  const requestPdfCrop = (blockId: string, element: HTMLElement) => {
    if (canEdit) onRequestPdfCrop({ blockId, placement: blockPlacement(element) });
  };

  const applyImageFile = async (blockId: string, file: File, placement: { x: number; y: number; width: number }) => {
    if (!file.type.startsWith("image/")) return;
    const { blob, aspectRatio } = await compressFirstAidImage(file);
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

  const tableRows = (block: FirstAidBlock) => block.rows?.length ? block.rows : [["", ""]];
  const tableRowsHtml = (block: FirstAidBlock) => tableRows(block).map((row, rowIndex) => row.map((cell, columnIndex) => block.rowsHtml?.[rowIndex]?.[columnIndex] ?? plainTextToRichHtml(cell)));

  const updateTableCellRich = (block: FirstAidBlock, rowIndex: number, columnIndex: number, cellHtml: string, value: string) => {
    const rows = tableRows(block).map((row) => [...row]);
    const rowsHtml = tableRowsHtml(block).map((row) => [...row]);
    rows[rowIndex][columnIndex] = value;
    rowsHtml[rowIndex][columnIndex] = cellHtml;
    updateBlock(block.id, { rows, rowsHtml });
  };

  const addTableRow = (block: FirstAidBlock) => {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    updateBlock(block.id, { rows: [...rows, Array.from({ length: columns }, () => "Nội dung")], rowsHtml: [...tableRowsHtml(block), Array.from({ length: columns }, () => plainTextToRichHtml("Nội dung"))] });
  };

  const addTableColumn = (block: FirstAidBlock) => {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    updateBlock(block.id, {
      rows: rows.map((row, rowIndex) => [...row, rowIndex === 0 ? `Tiêu đề ${columns + 1}` : "Nội dung"]),
      rowsHtml: tableRowsHtml(block).map((row, rowIndex) => [...row, plainTextToRichHtml(rowIndex === 0 ? `Tiêu đề ${columns + 1}` : "Nội dung")]),
    });
  };

  const removeTableRow = (block: FirstAidBlock) => {
    const rows = tableRows(block);
    if (rows.length > 1) updateBlock(block.id, { rows: rows.slice(0, -1), rowsHtml: tableRowsHtml(block).slice(0, -1) });
  };

  const removeTableColumn = (block: FirstAidBlock) => {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    if (columns > 1) updateBlock(block.id, { rows: rows.map((row) => row.slice(0, -1)), rowsHtml: tableRowsHtml(block).map((row) => row.slice(0, -1)) });
  };

  const renderTableToolbar = (block: FirstAidBlock) => {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    return <div className="fa-table-toolbar-group" role="group" aria-label="Chỉnh hàng và cột">
      <button type="button" className="fa-table-toolbar-action" disabled={!canEdit} onClick={() => addTableRow(block)} aria-label="Thêm hàng" title="Thêm hàng"><Plus size={9} /><Rows3 size={13} /></button>
      <button type="button" className="fa-table-toolbar-action" disabled={!canEdit} onClick={() => addTableColumn(block)} aria-label="Thêm cột" title="Thêm cột"><Plus size={9} /><Columns2 size={13} /></button>
      <button type="button" className="fa-table-toolbar-action" disabled={!canEdit || rows.length <= 1} onClick={() => removeTableRow(block)} aria-label="Bớt hàng" title="Bớt hàng"><Minus size={9} /><Rows3 size={13} /></button>
      <button type="button" className="fa-table-toolbar-action" disabled={!canEdit || columns <= 1} onClick={() => removeTableColumn(block)} aria-label="Bớt cột" title="Bớt cột"><Minus size={9} /><Columns2 size={13} /></button>
    </div>;
  };

  const renderRichField = (block: FirstAidBlock, field: "title" | "label" | "text" | "caption", htmlField: "titleHtml" | "labelHtml" | "textHtml" | "captionHtml", className: string, ariaLabel: string, options?: { singleLine?: boolean; placeholder?: string; textStyle?: TextStyle }) => <BlockRichEditor editorId={`first-aid:${block.id}:${field}`} className={className} html={block[htmlField]} text={block[field]} textStyle={options?.textStyle} editable={canEdit} singleLine={options?.singleLine} placeholder={options?.placeholder} ariaLabel={ariaLabel} onChange={(fieldHtml, fieldText) => updateBlock(block.id, { [field]: fieldText, [htmlField]: fieldHtml } as Partial<FirstAidBlock>)} onActivate={onTextActivate} onNormalizeInput={onNormalizeTextInput} />;

  const renderImageZone = (block: FirstAidBlock) => {
    if (block.imageObjectId) {
      const objectHeight = pageObjectLayouts[block.imageObjectId]?.height;
      const linkedHeight = objectHeight && pageHeightCss > 0 ? Math.max(28, Math.round(objectHeight * pageHeightCss)) : undefined;
      return <div className="fa-linked-image-space" data-layout-key={pageObjectLayoutKey} style={linkedHeight ? { height: `${linkedHeight}px` } : { aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;
    }
    const url = block.imageAssetId ? assetUrls[block.imageAssetId] : undefined;
    return <div className={`fa-image-zone ${url ? "has-image" : ""}`} onDragOver={(event) => { if (canEdit) event.preventDefault(); }} onDrop={(event) => {
      if (!canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
      if (file) void applyImageFile(block.id, file, blockPlacement(event.currentTarget));
    }}>
      {url ? <img src={url} alt={block.imageName || "Hình trong note"} /> : <><ImageIcon size={24} /><b>Thả hình vào đây</b><div className="fa-image-actions"><button type="button" disabled={!canEdit} onClick={(event) => requestImage(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget)}><ImageIcon size={14} /> Browse từ máy</button><button type="button" disabled={!canEdit} onClick={(event) => requestPdfCrop(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget)}><Crop size={14} /> Crop từ PDF</button></div><small>Ảnh sẽ thành đối tượng kéo, resize, xoay và xếp lớp được</small></>}
    </div>;
  };

  const renderBlockBody = (block: FirstAidBlock) => {
    if (block.type === "heading") return renderRichField(block, "title", "titleHtml", "fa-heading-input", "Tiêu đề mục", { singleLine: true, placeholder: "TIÊU ĐỀ MỤC" });
    if (block.type === "label") return <div className="fa-label-layout">{renderRichField(block, "label", "labelHtml", "fa-label-input", "Nhãn block", { placeholder: "NHÃN" })}{renderRichField(block, "text", "textHtml", "fa-content-input", "Nội dung block", { placeholder: "Nhập nội dung…" })}</div>;
    if (block.type === "text") return <div className="fa-text-block"><div className="fa-text-style-switch">{(["paragraph", "bullets", "numbered"] as TextStyle[]).map((style) => <button key={style} className={block.textStyle === style ? "selected" : ""} disabled={!canEdit} onClick={() => updateBlock(block.id, { textStyle: style, textHtml: richBlockHtml(undefined, block.text, style) })}>{style === "paragraph" ? "Đoạn" : style === "bullets" ? "• Danh sách" : "1. Đánh số"}</button>)}</div>{renderRichField(block, "text", "textHtml", "fa-content-input", "Đoạn hoặc danh sách", { placeholder: "Nhập đoạn văn hoặc dùng Bullet / Đánh số trên thanh Type…", textStyle: block.textStyle })}</div>;
    if (block.type === "figure") return <div className="fa-figure-block">{renderImageZone(block)}{renderRichField(block, "caption", "captionHtml", "fa-caption-input", "Chú thích hình", { placeholder: "Nhập chú thích hình…" })}</div>;
    if (block.type === "figure-text") return <div className={`fa-figure-text ${block.imageSide === "right" ? "image-right" : ""}`}><div className="fa-figure-block">{renderImageZone(block)}{renderRichField(block, "caption", "captionHtml", "fa-caption-input", "Chú thích hình", { placeholder: "Chú thích hình…" })}</div><div className="fa-figure-copy"><button className="fa-side-toggle" disabled={!canEdit} onClick={() => updateBlock(block.id, { imageSide: block.imageSide === "right" ? "left" : "right" })}>{block.imageSide === "right" ? "Đưa hình sang trái" : "Đưa hình sang phải"}</button>{renderRichField(block, "text", "textHtml", "fa-content-input", "Nội dung cạnh hình", { placeholder: "Nhập nội dung liên quan…" })}</div></div>;
    if (block.type === "table") {
      const rows = tableRows(block);
      const columns = Math.max(1, rows[0]?.length ?? 2);
      return <div className="fa-table-block"><div className="fa-table-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <BlockRichEditor key={`${rowIndex}-${columnIndex}`} editorId={`first-aid:${block.id}:cell:${rowIndex}:${columnIndex}`} className={rowIndex === 0 ? "fa-table-head" : "fa-table-cell"} html={block.rowsHtml?.[rowIndex]?.[columnIndex]} text={cell} editable={canEdit} ariaLabel={`Ô ${rowIndex + 1}, ${columnIndex + 1}`} onChange={(cellHtml, value) => updateTableCellRich(block, rowIndex, columnIndex, cellHtml, value)} onActivate={onTextActivate} onNormalizeInput={onNormalizeTextInput} />))}</div></div>;
    }
    if (block.type === "flow") {
      const steps = block.steps ?? [""];
      return <div className="fa-flow-layout">{renderRichField(block, "label", "labelHtml", "fa-flow-label", "Nhãn diễn tiến", { placeholder: "CƠ CHẾ" })}<div className="fa-flow-block">{steps.map((step, index) => <div className="fa-flow-item" key={`${block.id}-${index}`}><BlockRichEditor editorId={`first-aid:${block.id}:step:${index}`} html={block.stepsHtml?.[index]} text={step} editable={canEdit} ariaLabel={`Bước ${index + 1}`} onChange={(stepHtml, value) => updateBlock(block.id, { steps: steps.map((item, itemIndex) => itemIndex === index ? value : item), stepsHtml: steps.map((item, itemIndex) => itemIndex === index ? stepHtml : block.stepsHtml?.[itemIndex] ?? plainTextToRichHtml(item)) })} onActivate={onTextActivate} onNormalizeInput={onNormalizeTextInput} />{canEdit && steps.length > 1 && <button onClick={() => updateBlock(block.id, { steps: steps.filter((_, itemIndex) => itemIndex !== index), stepsHtml: block.stepsHtml?.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Xóa bước ${index + 1}`}><X size={13} /></button>}{index < steps.length - 1 && <span>↓</span>}</div>)}<button className="fa-add-step" disabled={!canEdit} onClick={() => updateBlock(block.id, { steps: [...steps, ""], stepsHtml: [...(block.stepsHtml ?? steps.map((step) => plainTextToRichHtml(step))), ""] })}><Plus size={14} /> Thêm bước</button></div></div>;
    }
    return <div className="fa-pearl-layout">{renderRichField(block, "label", "labelHtml", "fa-pearl-label", "Nhãn pearl", { placeholder: "HIGH-YIELD" })}{renderRichField(block, "text", "textHtml", "fa-pearl-text", "Nội dung pearl", { placeholder: "Điểm dễ nhầm hoặc mẹo nhớ…" })}</div>;
  };

  return <div className={`fa-block-editor mode-${mode}`} onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
    <input ref={fileInputRef} className="fa-hidden-input" type="file" accept="image/*" onChange={onFileChange} />
    <div className="fa-insert-slot first"><button className="fa-insert-button" disabled={!canManage} onClick={() => setInsertAt(insertAt === 0 ? null : 0)} aria-label="Thêm block đầu trang"><Plus size={14} /></button>{insertAt === 0 && <InsertMenu onInsert={(type) => insertBlock(type, 0)} onClose={() => setInsertAt(null)} />}</div>
    {blocks.map((block, index) => {
      const selected = selectedId === block.id;
      return <div className={`fa-block-wrap ${selected ? "has-selected-block" : ""}`} key={block.id}>
        <section className={`fa-block fa-block-${block.type} ${selected ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); if (canManage) setSelectedId(block.id); }} onKeyDown={(event) => onBlockKeyDown(event, block)} onDragOver={(event) => { if (draggedId) event.preventDefault(); }} onDrop={(event: DragEvent<HTMLElement>) => { event.preventDefault(); if (draggedId) moveToIndex(draggedId, index); setDraggedId(null); }}>
          {canManage && <div className="fa-block-toolbar" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <button type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedId(block.id); }} onDragEnd={() => setDraggedId(null)} aria-label="Kéo để đổi thứ tự" title="Kéo để đổi thứ tự"><GripVertical size={15} /></button>
            <select value={block.type} onChange={(event) => convertBlock(block.id, event.target.value as BlockType)} aria-label="Đổi loại block">{BLOCK_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select>
            {block.type === "table" && renderTableToolbar(block)}
            <button type="button" disabled={index === 0} onClick={() => moveBlock(block.id, -1)} aria-label="Đưa block lên"><ArrowUp size={14} /></button>
            <button type="button" disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} aria-label="Đưa block xuống"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => duplicateBlock(block.id)} aria-label="Nhân bản block"><Copy size={14} /></button>
            <button type="button" className="danger" onClick={() => removeBlock(block.id)} aria-label="Xóa block"><Trash2 size={14} /></button>
          </div>}
          {renderBlockBody(block)}
        </section>
        <div className={`fa-insert-slot ${index === blocks.length - 1 ? "last" : ""}`}><span /><button className={`fa-insert-button ${index === blocks.length - 1 ? "persistent" : ""}`} disabled={!canManage} onClick={() => setInsertAt(insertAt === index + 1 ? null : index + 1)} aria-label={`Thêm block sau block ${index + 1}`}><Plus size={14} />{index === blocks.length - 1 && <b>Thêm block</b>}</button><span />{insertAt === index + 1 && <InsertMenu onInsert={(type) => insertBlock(type, index + 1)} onClose={() => setInsertAt(null)} />}</div>
      </div>;
    })}
    {!canManage && <div className="fa-view-hint"><Type size={14} /> Chọn công cụ Type để sửa block, hoặc Pointer để sắp xếp.</div>}
  </div>;
}
