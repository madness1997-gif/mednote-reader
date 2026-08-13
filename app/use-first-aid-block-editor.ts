import { useCallback, useEffect, useRef, useState } from "react";
import {
  blockPlainText,
  createBlock,
  lines,
  uid,
  type BlockType,
  type FirstAidBlock,
} from "./first-aid-block-domain";
import { parseBlocks, serializeBlocks } from "./first-aid-block-codec";

export type FirstAidPdfCropResult = {
  token: string;
  blockId: string;
  excerptId: string;
  imageName: string;
  aspectRatio: number;
};

type UseFirstAidBlockEditorInput = {
  html: string;
  plainText: string;
  onChange: (html: string, plainText: string) => void;
  onRemoveImage: (excerptId: string) => void;
  pageObjectIds: string[];
  pdfCropResult: FirstAidPdfCropResult | null;
  onPdfCropHandled: (token: string) => void;
};

function plainTextForBlocks(blocks: FirstAidBlock[]) {
  return blocks.map(blockPlainText).filter(Boolean).join("\n\n");
}

export function useFirstAidBlockEditor({
  html,
  plainText,
  onChange,
  onRemoveImage,
  pageObjectIds,
  pdfCropResult,
  onPdfCropHandled,
}: UseFirstAidBlockEditorInput) {
  const [blocks, setBlocks] = useState<FirstAidBlock[]>(() => parseBlocks(html, plainText));
  const blocksRef = useRef(blocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const normalizedSourceRef = useRef<string | null>(null);
  const handledCropTokenRef = useRef<string | null>(null);

  const emit = useCallback((next: FirstAidBlock[]) => {
    const serialized = serializeBlocks(next);
    lastEmittedHtmlRef.current = serialized;
    onChange(serialized, plainTextForBlocks(next));
  }, [onChange]);

  const commit = useCallback((nextOrUpdater: FirstAidBlock[] | ((current: FirstAidBlock[]) => FirstAidBlock[])) => {
    const current = blocksRef.current;
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
    if (next === current) return;
    blocksRef.current = next;
    setBlocks(next);
    emit(next);
  }, [emit]);

  // External restore/sync may replace the content of the same Sheet id. Reconcile
  // that source instead of treating the editor's mount-time parse as permanent.
  useEffect(() => {
    if (html === lastEmittedHtmlRef.current) return;
    const parsed = parseBlocks(html, plainText);
    blocksRef.current = parsed;
    setBlocks(parsed);
    setSelectedId(null);
    setInsertAt(null);
    normalizedSourceRef.current = null;
  }, [html, plainText]);

  // Normalize legacy input once per external source, while keeping v4 stable.
  useEffect(() => {
    const sourceKey = `${html}\u0000${plainText}`;
    if (normalizedSourceRef.current === sourceKey) return;
    normalizedSourceRef.current = sourceKey;
    const normalizedHtml = serializeBlocks(blocksRef.current);
    if (html !== normalizedHtml) {
      lastEmittedHtmlRef.current = normalizedHtml;
      onChange(normalizedHtml, plainTextForBlocks(blocksRef.current));
    }
  }, [html, plainText, onChange]);

  const pageObjectKey = [...pageObjectIds].sort().join("|");
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
      ? current.map((block) => block.id === pdfCropResult.blockId
        ? { ...block, imageObjectId: pdfCropResult.excerptId, imageAssetId: undefined, imageName: pdfCropResult.imageName, imageAspectRatio: pdfCropResult.aspectRatio }
        : block)
      : current);
    onPdfCropHandled(pdfCropResult.token);
  }, [pdfCropResult, commit, onPdfCropHandled]);

  const updateBlock = useCallback((id: string, changes: Partial<FirstAidBlock>) => {
    commit((current) => current.map((block) => block.id === id ? { ...block, ...changes } : block));
  }, [commit]);

  const insertBlock = useCallback((type: BlockType, index: number) => {
    const block = createBlock(type);
    commit((current) => {
      const next = [...current];
      next.splice(index, 0, block);
      return next;
    });
    setSelectedId(block.id);
    setInsertAt(null);
  }, [commit]);

  const removeBlock = useCallback((id: string) => {
    const imageObjectId = blocksRef.current.find((block) => block.id === id)?.imageObjectId;
    commit((current) => current.filter((block) => block.id !== id));
    if (imageObjectId) onRemoveImage(imageObjectId);
    setSelectedId(null);
  }, [commit, onRemoveImage]);

  const duplicateBlock = useCallback((id: string) => {
    const current = blocksRef.current;
    const index = current.findIndex((block) => block.id === id);
    if (index < 0) return;
    const source = current[index];
    const copy: FirstAidBlock = {
      ...source,
      id: uid(),
      imageObjectId: undefined,
      imageAssetId: undefined,
      imageName: undefined,
      imageAspectRatio: undefined,
      rows: source.rows?.map((row) => [...row]),
      rowsHtml: source.rowsHtml?.map((row) => [...row]),
      steps: source.steps ? [...source.steps] : undefined,
      stepsHtml: source.stepsHtml ? [...source.stepsHtml] : undefined,
    };
    commit((latest) => {
      const latestIndex = latest.findIndex((block) => block.id === id);
      if (latestIndex < 0) return latest;
      const next = [...latest];
      next.splice(latestIndex + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  }, [commit]);

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
    commit((current) => {
      const index = current.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, [commit]);

  const moveToIndex = useCallback((id: string, targetIndex: number) => {
    commit((current) => {
      const from = current.findIndex((block) => block.id === id);
      if (from < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      const destination = from < targetIndex ? Math.max(0, targetIndex - 1) : targetIndex;
      next.splice(Math.min(destination, next.length), 0, item);
      return next;
    });
  }, [commit]);

  const convertBlock = useCallback((id: string, type: BlockType) => {
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
  }, [commit, onRemoveImage]);

  return {
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
  };
}
