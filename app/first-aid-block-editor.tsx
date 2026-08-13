import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import "./first-aid-block-editor.css";
import type { BlockType, FirstAidBlock } from "./first-aid-block-domain";
import type { FirstAidBlockEditorProps } from "./first-aid-block-editor-contract";
import { firstAidImagePlacement, type FirstAidImagePlacement } from "./first-aid-image-placement";
import {
  FIRST_AID_BLOCK_OPTIONS,
  FirstAidBlockBody,
  FirstAidInsertMenu,
  FirstAidTableToolbar,
} from "./first-aid-block-editor-components";
import { compressFirstAidImage, readFirstAidAsset } from "./first-aid-image-service";
import { useFirstAidBlockEditor } from "./use-first-aid-block-editor";

export function FirstAidBlockEditor({
  document,
  mode,
  onChange,
  onInsertImage,
  onRemoveImage,
  onRequestPdfCrop,
  pdfCropResult,
  onPdfCropHandled,
  pageObjectIds,
  pageObjectLayouts,
  pageHeightCss,
  onTextActivate,
  onNormalizeTextInput,
}: FirstAidBlockEditorProps) {
  const canManage = mode !== "view";
  const canEdit = mode === "edit";
  const {
    blocks,
    blocksRef,
    selectedId,
    setSelectedId,
    insertAt,
    setInsertAt,
    draggedId,
    setDraggedId,
    updateBlock,
    insertBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    moveToIndex,
    convertBlock,
  } = useFirstAidBlockEditor({ document, onChange, onRemoveImage, pageObjectIds, pdfCropResult, onPdfCropHandled });

  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const assetUrlsRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImageBlockRef = useRef<{ blockId: string; placement: FirstAidImagePlacement } | null>(null);
  const pageObjectLayoutKey = pageObjectIds.map((id) => `${id}:${pageObjectLayouts[id]?.height ?? 0}`).join("|");
  const assetIds = useMemo(() => Array.from(new Set(blocks.map((block) => block.imageAssetId).filter((value): value is string => Boolean(value)))).sort(), [blocks]);
  const assetIdsKey = assetIds.join("|");

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

  const blockPlacement = (blockId: string, element: HTMLElement) => {
    const page = element.closest<HTMLElement>(".typed-layer");
    const blockType = blocksRef.current.find((block) => block.id === blockId)?.type;
    if (!page) return blockType === "figure-text"
      ? { x: .1, y: .28, width: .28, maxHeight: .22 }
      : { x: .27, y: .28, width: .46, maxHeight: .3 };
    const elementRect = element.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    return firstAidImagePlacement(blockType, elementRect, pageRect);
  };

  const openNativeImagePicker = () => {
    const input = fileInputRef.current;
    if (!input) return;
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof picker.showPicker === "function") {
        picker.showPicker();
        return;
      }
    } catch {
      // Some mobile browsers expose showPicker but reject it; the native click path remains valid.
    }
    input.click();
  };

  const requestImage = (blockId: string, element: HTMLElement) => {
    if (!canEdit) return;
    pendingImageBlockRef.current = { blockId, placement: blockPlacement(blockId, element) };
    openNativeImagePicker();
  };

  const requestPdfCrop = (blockId: string, element: HTMLElement) => {
    if (canEdit) onRequestPdfCrop({ blockId, placement: blockPlacement(blockId, element) });
  };

  const applyImageFile = async (blockId: string, file: File, placement: FirstAidImagePlacement) => {
    const looksLikeImage = file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
    if (!looksLikeImage) return;
    const { blob, aspectRatio } = await compressFirstAidImage(file);
    const inserted = await onInsertImage({ blob, name: file.name, aspectRatio, placement });
    if (!inserted) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    updateBlock(blockId, { imageObjectId: inserted.excerptId, imageAssetId: undefined, imageName: file.name, imageAspectRatio: aspectRatio });
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const pending = pendingImageBlockRef.current;
    event.target.value = "";
    pendingImageBlockRef.current = null;
    if (file && pending) void applyImageFile(pending.blockId, file, pending.placement);
  };

  const onBlockKeyDown = (event: KeyboardEvent<HTMLElement>, block: FirstAidBlock) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      const index = blocksRef.current.findIndex((item) => item.id === block.id);
      insertBlock(block.type, index + 1);
    }
  };

  return <div className={`fa-block-editor mode-${mode}`} onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
    <input
      ref={fileInputRef}
      className="fa-hidden-input"
      type="file"
      accept="image/*"
      tabIndex={-1}
      onChange={onFileChange}
    />
    <div className="fa-insert-slot first">
      <button type="button" className="fa-insert-button" disabled={!canManage} onClick={() => setInsertAt(insertAt === 0 ? null : 0)} aria-label="Thêm block đầu trang"><Plus size={14} /></button>
      {insertAt === 0 && <FirstAidInsertMenu onInsert={(type) => insertBlock(type, 0)} onClose={() => setInsertAt(null)} />}
    </div>
    {blocks.map((block, index) => {
      const selected = selectedId === block.id;
      return <div className={`fa-block-wrap ${selected ? "has-selected-block" : ""}`} key={block.id}>
        <section
          className={`fa-block fa-block-${block.type} ${selected ? "selected" : ""}`}
          onPointerDown={() => { if (canManage) setSelectedId(block.id); }}
          onClick={(event) => { event.stopPropagation(); if (canManage) setSelectedId(block.id); }}
          onKeyDown={(event) => onBlockKeyDown(event, block)}
          onDragOver={(event) => { if (draggedId) event.preventDefault(); }}
          onDrop={(event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            if (draggedId) moveToIndex(draggedId, index);
            setDraggedId(null);
          }}
        >
          {canManage && <div
            className="fa-block-toolbar"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedId(block.id); }} onDragEnd={() => setDraggedId(null)} aria-label="Kéo để đổi thứ tự" title="Kéo để đổi thứ tự"><GripVertical size={15} /></button>
            <select value={block.type} onChange={(event) => convertBlock(block.id, event.target.value as BlockType)} aria-label="Đổi loại block">{FIRST_AID_BLOCK_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select>
            {block.type === "table" && <FirstAidTableToolbar block={block} canEdit={canEdit} updateBlock={updateBlock} />}
            <button type="button" disabled={index === 0} onClick={() => moveBlock(block.id, -1)} aria-label="Đưa block lên"><ArrowUp size={14} /></button>
            <button type="button" disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, 1)} aria-label="Đưa block xuống"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => duplicateBlock(block.id)} aria-label="Nhân bản block"><Copy size={14} /></button>
            <button type="button" className="danger" onClick={() => removeBlock(block.id)} aria-label="Xóa block"><Trash2 size={14} /></button>
          </div>}
          <FirstAidBlockBody
            block={block}
            canEdit={canEdit}
            assetUrl={block.imageAssetId ? assetUrls[block.imageAssetId] : undefined}
            pageObjectLayouts={pageObjectLayouts}
            pageHeightCss={pageHeightCss}
            pageObjectLayoutKey={pageObjectLayoutKey}
            updateBlock={updateBlock}
            onBrowseImage={requestImage}
            onPdfCrop={requestPdfCrop}
            onDropImage={(blockId, file, element) => { void applyImageFile(blockId, file, blockPlacement(blockId, element)); }}
            onTextActivate={onTextActivate}
            onNormalizeTextInput={onNormalizeTextInput}
          />
        </section>
        <div className={`fa-insert-slot ${index === blocks.length - 1 ? "last" : ""}`}>
          <span />
          <button type="button" className={`fa-insert-button ${index === blocks.length - 1 ? "persistent" : ""}`} disabled={!canManage} onClick={() => setInsertAt(insertAt === index + 1 ? null : index + 1)} aria-label={`Thêm block sau block ${index + 1}`}><Plus size={14} />{index === blocks.length - 1 && <b>Thêm block</b>}</button>
          <span />
          {insertAt === index + 1 && <FirstAidInsertMenu onInsert={(type) => insertBlock(type, index + 1)} onClose={() => setInsertAt(null)} />}
        </div>
      </div>;
    })}
    {!canManage && <div className="fa-view-hint"><Type size={14} /> Chọn công cụ Type để sửa block, hoặc Pointer để sắp xếp.</div>}
  </div>;
}
