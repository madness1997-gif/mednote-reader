import type { Plugin } from "vite";

const IMPORT_ANCHOR = 'import { loadPdfiumDocument, type PDFiumDocument } from "./pdfium-renderer";';
const IMPORT_LINE = 'import { FirstAidBlockEditor } from "./first-aid-block-editor";';
const EDITOR_ANCHOR = '<RichTextEditor editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />';
const EDITOR_REPLACEMENT = '{activeNote.paper.template === "first-aid" ? <FirstAidBlockEditor key={activeNote.id} html={activeNote.bodyHtml ?? ""} plainText={activeNote.body} mode={activeTool === "text" || activeTool === "pointer" ? "edit" : "view"} onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onInsertImage={addFirstAidImage} onRemoveImage={deleteExcerpt} onRequestPdfCrop={requestFirstAidPdfCrop} pdfCropResult={firstAidCropResult} onPdfCropHandled={finishFirstAidPdfCrop} pageObjectIds={activeNote.excerpts.map((excerpt) => excerpt.id)} pageObjectLayouts={Object.fromEntries(activeNote.excerpts.map((excerpt) => [excerpt.id, { height: excerpt.layout?.height ?? 0 }]))} pageHeightCss={basePaperMaxWidth * (paperHeight / paperWidth)} onTextActivate={(editorId, editor, range) => { if (activeTool === "pointer") { setActiveTool("text"); setNotePanel("text"); } activateTextEditor(editorId, editor, range); }} onNormalizeTextInput={normalizeTextEditorInput} /> : <RichTextEditor editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />}';

const RESIZE_SYNC_ANCHOR = [
  '    setLayout(state.current);',
  '  };',
].join("\n");
const RESIZE_SYNC_REPLACEMENT = [
  '    setLayout(state.current);',
  '    if (excerpt.kind === "image" && state.mode === "resize") {',
  '      window.dispatchEvent(new CustomEvent("mednote:first-aid-image-resize", { detail: { excerptId: excerpt.id, height: state.current.height } }));',
  '    }',
  '  };',
].join("\n");

const FIRST_AID_PROPS_ANCHOR = [
  '  pageObjectIds: string[];',
  '  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;',
].join("\n");
const FIRST_AID_PROPS_REPLACEMENT = [
  '  pageObjectIds: string[];',
  '  pageObjectLayouts: Record<string, { height: number }>;',
  '  pageHeightCss: number;',
  '  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;',
].join("\n");

const FIRST_AID_FUNCTION_ANCHOR = 'export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, onRequestPdfCrop, pdfCropResult, onPdfCropHandled, pageObjectIds, onTextActivate, onNormalizeTextInput }: FirstAidBlockEditorProps) {';
const FIRST_AID_FUNCTION_REPLACEMENT = 'export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, onRequestPdfCrop, pdfCropResult, onPdfCropHandled, pageObjectIds, pageObjectLayouts, pageHeightCss, onTextActivate, onNormalizeTextInput }: FirstAidBlockEditorProps) {';

const FIRST_AID_STATE_ANCHOR = '  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});';
const FIRST_AID_STATE_REPLACEMENT = [
  FIRST_AID_STATE_ANCHOR,
  '  const [liveObjectHeights, setLiveObjectHeights] = useState<Record<string, number>>({});',
].join("\n");

const FIRST_AID_OBJECT_KEY_ANCHOR = '  const pageObjectKey = [...pageObjectIds].sort().join("|");';
const FIRST_AID_OBJECT_KEY_REPLACEMENT = [
  FIRST_AID_OBJECT_KEY_ANCHOR,
  '  const pageObjectLayoutKey = pageObjectIds.map((id) => `${id}:${pageObjectLayouts[id]?.height ?? 0}`).join("|");',
].join("\n");

const FIRST_AID_EFFECT_ANCHOR = [
  '  useEffect(() => {',
  '    let cancelled = false;',
  '    void Promise.all(assetIds.map(async (id) => {',
].join("\n");
const FIRST_AID_EFFECT_REPLACEMENT = [
  '  useEffect(() => {',
  '    const syncHeight = (event: Event) => {',
  '      const detail = (event as CustomEvent<{ excerptId?: string; height?: number }>).detail;',
  '      const excerptId = detail?.excerptId;',
  '      const height = Number(detail?.height);',
  '      if (!excerptId || !Number.isFinite(height) || height <= 0) return;',
  '      setLiveObjectHeights((current) => Math.abs((current[excerptId] ?? 0) - height) < .0002 ? current : { ...current, [excerptId]: height });',
  '    };',
  '    window.addEventListener("mednote:first-aid-image-resize", syncHeight as EventListener);',
  '    return () => window.removeEventListener("mednote:first-aid-image-resize", syncHeight as EventListener);',
  '  }, []);',
  '',
  '  useEffect(() => {',
  '    setLiveObjectHeights((current) => {',
  '      const available = new Set(pageObjectIds);',
  '      const next: Record<string, number> = {};',
  '      let changed = Object.keys(current).some((id) => !available.has(id));',
  '      pageObjectIds.forEach((id) => {',
  '        const height = pageObjectLayouts[id]?.height;',
  '        const resolved = Number.isFinite(height) && (height ?? 0) > 0 ? Number(height) : current[id];',
  '        if (resolved && resolved > 0) next[id] = resolved;',
  '        if ((current[id] ?? 0) !== (next[id] ?? 0)) changed = true;',
  '      });',
  '      return changed ? next : current;',
  '    });',
  '  }, [pageObjectKey, pageObjectLayoutKey]);',
  '',
  '  useEffect(() => {',
  '    let cancelled = false;',
  '    void Promise.all(assetIds.map(async (id) => {',
].join("\n");

const LINKED_IMAGE_ANCHOR = [
  '    if (block.imageObjectId) {',
  '      return <div className="fa-linked-image-space" style={{ aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;',
  '    }',
].join("\n");
const LINKED_IMAGE_REPLACEMENT = [
  '    if (block.imageObjectId) {',
  '      const objectHeight = liveObjectHeights[block.imageObjectId] ?? pageObjectLayouts[block.imageObjectId]?.height;',
  '      const linkedHeight = objectHeight && pageHeightCss > 0 ? Math.max(28, Math.round(objectHeight * pageHeightCss)) : undefined;',
  '      return <div className="fa-linked-image-space" style={linkedHeight ? { height: `${linkedHeight}px` } : { aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;',
  '    }',
].join("\n");

function replaceRequired(code: string, anchor: string, replacement: string, errorMessage: string) {
  if (code.includes(replacement)) return code;
  if (!code.includes(anchor)) throw new Error(errorMessage);
  return code.replace(anchor, replacement);
}

export function firstAidBlocksPlugin(): Plugin {
  return {
    name: "mednote-first-aid-blocks",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];

      if (normalizedId.endsWith("/app/first-aid-block-editor.tsx")) {
        let next = code;
        next = replaceRequired(next, FIRST_AID_PROPS_ANCHOR, FIRST_AID_PROPS_REPLACEMENT, "Không tìm thấy props First Aid để gắn kích thước đối tượng ảnh.");
        next = replaceRequired(next, FIRST_AID_FUNCTION_ANCHOR, FIRST_AID_FUNCTION_REPLACEMENT, "Không tìm thấy hàm FirstAidBlockEditor để gắn kích thước đối tượng ảnh.");
        next = replaceRequired(next, FIRST_AID_STATE_ANCHOR, FIRST_AID_STATE_REPLACEMENT, "Không tìm thấy state First Aid để theo dõi chiều cao ảnh.");
        next = replaceRequired(next, FIRST_AID_OBJECT_KEY_ANCHOR, FIRST_AID_OBJECT_KEY_REPLACEMENT, "Không tìm thấy khóa đối tượng First Aid để đồng bộ chiều cao ảnh.");
        next = replaceRequired(next, FIRST_AID_EFFECT_ANCHOR, FIRST_AID_EFFECT_REPLACEMENT, "Không tìm thấy effect First Aid để theo dõi resize ảnh.");
        next = replaceRequired(next, LINKED_IMAGE_ANCHOR, LINKED_IMAGE_REPLACEMENT, "Không tìm thấy vùng ảnh First Aid để tự co giãn block.");
        return { code: next, map: null };
      }

      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      if (!next.includes(IMPORT_LINE)) {
        if (!next.includes(IMPORT_ANCHOR)) throw new Error("Không tìm thấy vị trí import để gắn First Aid block editor.");
        next = next.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`);
      }

      if (!next.includes("<FirstAidBlockEditor")) {
        if (!next.includes(EDITOR_ANCHOR)) throw new Error("Không tìm thấy trình soạn thảo note để gắn First Aid block editor.");
        next = next.replace(EDITOR_ANCHOR, EDITOR_REPLACEMENT);
      }

      next = replaceRequired(next, RESIZE_SYNC_ANCHOR, RESIZE_SYNC_REPLACEMENT, "Không tìm thấy thao tác resize ảnh để đồng bộ chiều cao block First Aid.");

      return { code: next, map: null };
    },
  };
}
