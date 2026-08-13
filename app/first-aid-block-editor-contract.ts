import type { EditorMode } from "./first-aid-block-domain";
import type { FirstAidPdfCropResult } from "./use-first-aid-block-editor";

export type FirstAidBlockEditorProps = {
  html: string;
  plainText: string;
  mode: EditorMode;
  onChange: (html: string, plainText: string) => void;
  onInsertImage: (image: { blob: Blob; name: string; aspectRatio: number; placement: { x: number; y: number; width: number } }) => Promise<{ excerptId: string } | null>;
  onRemoveImage: (excerptId: string) => void;
  onRequestPdfCrop: (request: { blockId: string; placement: { x: number; y: number; width: number } }) => void;
  pdfCropResult: FirstAidPdfCropResult | null;
  onPdfCropHandled: (token: string) => void;
  pageObjectIds: string[];
  pageObjectLayouts: Record<string, { height: number }>;
  pageHeightCss: number;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
};
