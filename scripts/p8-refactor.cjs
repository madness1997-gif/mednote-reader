const fs = require('node:fs');

function read(path) { return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n'); }
function write(path, value) { fs.writeFileSync(path, value.endsWith('\n') ? value : `${value}\n`); }
function required(source, anchor, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(anchor)) throw new Error(`Missing ${label}: ${anchor.slice(0, 100)}`);
  return source.replace(anchor, replacement);
}
function removeRange(source, startAnchor, endAnchor, label) {
  const start = source.indexOf(startAnchor);
  if (start < 0) throw new Error(`Missing start ${label}`);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error(`Missing end ${label}`);
  return source.slice(0, start) + source.slice(end);
}

// P8.0 canonical note model + sticker type in real source.
{
  let code = read('app/note-runtime-adapter.ts');
  code = code.replace('import type { PdfRect } from "./pdf-reader";', 'import type { PdfRect } from "./pdf-domain";');
  if (!code.includes('export type StickerPresetId')) {
    code = required(code,
      'export type InkTool = "pen" | "highlight" | "shape";\n',
      'export type InkTool = "pen" | "highlight" | "shape";\n\nexport type StickerPresetId = "classic-yellow" | "tape-pink" | "pin-mint" | "tab-blue" | "clinical-card" | "high-yield";\n',
      'StickerPresetId');
  }
  if (!code.includes('stickerStyle?: StickerPresetId;')) {
    code = required(code,
      '  appearance?: Partial<ExcerptAppearance>;\n};',
      '  appearance?: Partial<ExcerptAppearance>;\n  stickerStyle?: StickerPresetId;\n};',
      'NoteExcerpt stickerStyle');
  }
  write('app/note-runtime-adapter.ts', code);
}

let page = read('app/page.tsx');

// P8.1 materialize sticker transform in source.
if (!page.includes('type StickerPresetId =')) {
  page = required(page,
    'type TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | null;',
    'type StickerPresetId = "classic-yellow" | "tape-pink" | "pin-mint" | "tab-blue" | "clinical-card" | "high-yield";\ntype TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | "stickers" | null;',
    'sticker popover type');
}
if (!page.includes('const STICKER_PRESETS:')) {
  const anchor = 'const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [';
  const presets = `const STICKER_PRESETS: { id: StickerPresetId; label: string; description: string; width: number; height: number; rotation: number }[] = [\n  { id: "classic-yellow", label: "Sticky vàng", description: "Giấy note cổ điển, góc gấp", width: .30, height: .17, rotation: -1 },\n  { id: "tape-pink", label: "Tape hồng", description: "Note pastel có băng dính phía trên", width: .31, height: .17, rotation: 1 },\n  { id: "pin-mint", label: "Ghim xanh", description: "Thẻ xanh bạc hà có ghim tròn", width: .29, height: .16, rotation: -.5 },\n  { id: "tab-blue", label: "Tab xanh", description: "Thẻ xanh có nhãn tab nổi", width: .31, height: .16, rotation: 0 },\n  { id: "clinical-card", label: "Clinical card", description: "Thẻ trắng viền teal cho ý chính", width: .33, height: .17, rotation: 0 },\n  { id: "high-yield", label: "High-yield", description: "Sticker vàng nhấn mạnh điểm cần nhớ", width: .32, height: .16, rotation: 0 },\n];\n\n${anchor}`;
  page = required(page, anchor, presets, 'sticker presets');
}
if (!page.includes('const addSticker =')) {
  const anchor = '  const addCalloutAt = (event: React.PointerEvent<HTMLElement>) => {';
  const replacement = `  const addSticker = (presetId: StickerPresetId) => {\n    const preset = STICKER_PRESETS.find((item) => item.id === presetId);\n    if (!preset) return;\n    const slot = activeNote.excerpts.length % 6;\n    const x = Math.min(1 - preset.width - .03, .13 + (slot % 3) * .045);\n    const y = Math.min(1 - preset.height - .04, .16 + (slot % 4) * .055);\n    const excerpt: NoteExcerpt = {\n      id: uid("sticker"),\n      kind: "text",\n      sourceKind: "manual",\n      text: "",\n      richText: "",\n      stickerStyle: preset.id,\n      createdAt: Date.now(),\n      layout: { x, y, width: preset.width, height: preset.height, contentScale: 1, rotation: preset.rotation, opacity: 1, autoFit: false },\n      appearance: { borderStyle: "solid", borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent" },\n    };\n    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });\n    setSelectedExcerptId(excerpt.id);\n    setActiveTool("text");\n    setNotePanel("text");\n    setTextInsertPopover(null);\n    setToast(\`Đã chèn \${preset.label} — nhập chữ trực tiếp, dùng Chọn để kéo và đổi kích thước\`);\n  };\n\n${anchor}`;
  page = required(page, anchor, replacement, 'addSticker');
}
page = page.replace(
  'className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}',
  'className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.stickerStyle ? `excerpt-sticker sticker-${excerpt.stickerStyle}` : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}');
page = page.replace(
  'placeholder={isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}',
  'placeholder={excerpt.stickerStyle ? "Nhập ghi chú…" : isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}');
page = page.replace(
  '{editable ? "Đang sửa" : isCallout ? "Callout" : "Chữ"}',
  '{editable ? "Đang sửa" : isCallout ? "Callout" : excerpt.stickerStyle ? "Sticker" : "Chữ"}');
if (!page.includes('sticker-primary-button')) {
  const anchor = [
    '                {tools.map(({ id, label, icon: Icon }) => {',
    '                  const hasPanel = ["pen", "highlight", "shape", "text", "textbox", "callout"].includes(id);',
    '                  const shortLabel = id === "text" ? "Type" : id === "textbox" ? "Text box" : id === "callout" ? "Callout" : label;',
    '                  return <button key={id} className={`tool-button ${hasPanel ? "expandable" : ""} ${activeTool === id ? "active show-label" : ""}`} onClick={() => chooseNoteTool(id)} aria-label={label} title={label} aria-expanded={hasPanel ? ((id === "pen" || id === "highlight") ? notePanel === "ink" : (id === "text" || id === "textbox" || id === "callout") ? notePanel === "text" : notePanel === id) : undefined}><Icon size={20} />{activeTool === id && <span className="tool-label">{shortLabel}</span>}{hasPanel && <ChevronDown className="tool-chevron" size={11} />}</button>;',
    '                })}',
  ].join('\n');
  page = required(page, anchor, `${anchor}\n                <button className={\`tool-button expandable sticker-primary-button \${textInsertPopover === "stickers" ? "active show-label" : ""}\`} onClick={(event) => { setActiveTool("text"); setNotePanel("text"); openTextPopover("stickers", event.currentTarget); }} aria-label="Sticker note" title="Sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={20} />{textInsertPopover === "stickers" && <span className="tool-label">Sticker</span>}<ChevronDown className="tool-chevron" size={11} /></button>`, 'sticker toolbar button');
}
if (!page.includes('sticker-menu-trigger')) {
  const anchor = '<button className={`word-command-button labeled ${textInsertPopover === "symbols" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("symbols", event.currentTarget)} title="Chèn ký hiệu"><Omega size={16} /><span>Ký hiệu</span></button>';
  page = required(page, anchor, `${anchor}\n                  <button className={\`word-command-button labeled sticker-menu-trigger \${textInsertPopover === "stickers" ? "selected" : ""}\`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("stickers", event.currentTarget)} title="Chèn sticker note" aria-label="Mở thư viện sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={16} /><span>Sticker</span></button>`, 'sticker menu trigger');
}
if (!page.includes('note-sticker-popover')) {
  const anchor = '{notePanel === "text" && textInsertPopover === "symbols" && <div className="text-insert-popover symbol-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn ký hiệu"><header><strong>Ký hiệu</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>{SYMBOL_GROUPS.map((group) => <section key={group.label}><label>{group.label}</label><div>{group.symbols.map((symbol) => <button key={symbol} onPointerDown={(event) => event.preventDefault()} onClick={() => insertTextAtSelection(symbol)}>{symbol}</button>)}</div></section>)}</div>}';
  const popover = `{notePanel === "text" && textInsertPopover === "stickers" && (\n            <div className="text-insert-popover note-sticker-popover" style={{ "--popover-left": \`\${textPopoverLeft}px\` } as React.CSSProperties} role="dialog" aria-label="Thư viện sticker note">\n              <header><div><strong>Sticker note</strong><small>Mỗi mẫu là một textbox có thể kéo và đổi kích thước</small></div><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>\n              <div className="note-sticker-grid">\n                {STICKER_PRESETS.map((preset) => <button key={preset.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => addSticker(preset.id)} title={preset.description}><span className={\`note-sticker-preview sticker-\${preset.id}\`}><i>Ghi chú…</i></span><b>{preset.label}</b><small>{preset.description}</small></button>)}\n              </div>\n              <footer>Chèn xong có thể gõ ngay · chuyển sang Chọn để kéo, co giãn và sắp xếp lớp</footer>\n            </div>\n          )}\n\n          ${anchor}`;
  page = required(page, anchor, popover, 'sticker popover');
}

// P8.2 direct First Aid integration.
if (!page.includes('import { FirstAidBlockEditor } from "./first-aid-block-editor";')) {
  page = required(page,
    'import type { PDFiumDocument } from "./pdfium-renderer";',
    'import type { PDFiumDocument } from "./pdfium-renderer";\nimport { FirstAidBlockEditor } from "./first-aid-block-editor";',
    'FirstAid import');
}
const normalBodyEditor = '<RichTextEditor key={`body:${activeNote.id}`} editorId={`body:${activeNote.id}`} className="note-editor" html={activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />';
if (!page.includes('<FirstAidBlockEditor')) {
  const replacement = '{activeNote.paper.template === "first-aid" ? <FirstAidBlockEditor key={activeNote.id} html={activeNote.bodyHtml ?? ""} plainText={activeNote.body} mode={activeTool === "text" || activeTool === "pointer" ? "edit" : "view"} onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })} onInsertImage={addFirstAidImage} onRemoveImage={deleteExcerpt} onRequestPdfCrop={requestFirstAidPdfCrop} pdfCropResult={firstAidCropResult} onPdfCropHandled={finishFirstAidPdfCrop} pageObjectIds={activeNote.excerpts.map((excerpt) => excerpt.id)} pageObjectLayouts={Object.fromEntries(activeNote.excerpts.map((excerpt) => [excerpt.id, { height: excerpt.layout?.height ?? 0 }]))} pageHeightCss={basePaperMaxWidth * (paperHeight / paperWidth)} onTextActivate={(editorId, editor, range) => { if (activeTool === "pointer") { setActiveTool("text"); setNotePanel("text"); } activateTextEditor(editorId, editor, range); }} onNormalizeTextInput={normalizeTextEditorInput} /> : ' + normalBodyEditor + '}';
  page = required(page, normalBodyEditor, replacement, 'FirstAid body render');
}

// P8.3 page uses canonical controller + external RichTextEditor.
if (!page.includes('import { RichTextEditor } from "./rich-text-editor";')) {
  page = required(page, 'import PageTitleEditor from "./page-title-editor";', 'import PageTitleEditor from "./page-title-editor";\nimport { RichTextEditor } from "./rich-text-editor";\nimport { NoteRichTextController } from "./note-rich-text-controller";\nimport { NoteInkSession } from "./note-ink-session";\nimport { NoteInkCanvas } from "./note-ink-canvas";\nimport { NoteObjectLayer } from "./note-object-layer";\nimport { useNoteZoomController } from "./note-zoom-controller";', 'P8 imports');
}
if (page.includes('type RichTextEditorProps =')) {
  page = removeRange(page, 'type RichTextEditorProps = {', 'function StoredAssetImage', 'local RichTextEditor');
}
page = page.replace('type StrokeHistory = Record<string, { undo: Stroke[][]; redo: Stroke[][] }>;\n', '');
page = page.replace(
  '  const activeTextEditorRef = useRef<{ id: string; editor: HTMLElement } | null>(null);\n  const savedTextRangeRef = useRef<Range | null>(null);',
  '  const richTextController = useMemo(() => new NoteRichTextController(), []);\n  const activeTextEditorRef = richTextController.activeEditorRef;\n  const savedTextRangeRef = richTextController.savedRangeRef;');

// Extract P8.6 object layer from source after sticker materialization.
if (page.includes('function StoredAssetImage')) {
  const start = page.indexOf('function StoredAssetImage');
  const end = page.indexOf('function DemoDocument', start);
  if (end < 0) throw new Error('Cannot locate object layer end');
  let objectBlock = page.slice(start, end);
  objectBlock = objectBlock.replace('function DraggableExcerpt(', 'function DraggableExcerpt(');
  objectBlock = objectBlock.replace(
    'const next = { ...layout, contentScale: Math.min(2.4, Math.max(.65, Number((layout.contentScale + step).toFixed(2)))) };',
    'const next = objectSession.contentScale(layout, step);');
  objectBlock = objectBlock.replace(
    'const next = { ...layout, opacity: Math.min(1, Math.max(.1, opacity)) };',
    'const next = objectSession.opacity(layout, opacity);');
  objectBlock = objectBlock.replace(
    'const rotation = (((layout.rotation + degrees + 180) % 360) + 360) % 360 - 180;\n    const next = { ...layout, rotation };',
    'const next = objectSession.rotate(layout, degrees);');
  const objectFile = `import { Blend, Maximize2, Minus, Move, Pencil, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";\nimport { useEffect, useRef, useState } from "react";\nimport { localBinaryStorage } from "./local-binary-storage";\nimport type { ResolvedDocumentSource } from "./note-document-source";\nimport { DEFAULT_CALLOUT_APPEARANCE, normalizeCalloutSettings, normalizeExcerptAppearance, normalizeExcerptLayout, plainTextToRichHtml, type CalloutSettings, type ExcerptLayout, type NoteExcerpt } from "./note-runtime-adapter";\nimport type { PdfRect } from "./pdf-domain";\nimport { RichTextEditor } from "./rich-text-editor";\nimport { NoteObjectSession } from "./note-object-session";\n\nconst objectSession = new NoteObjectSession();\n\n${objectBlock}\nexport type NoteObjectLayerProps = {\n  excerpts: NoteExcerpt[];\n  resolveSource: (excerpt: NoteExcerpt) => ResolvedDocumentSource<PdfRect> | null;\n  selectedId: string | null;\n  activeTool: "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";\n  interactive?: boolean;\n  onSelect: (excerptId: string) => void;\n  onMove: (excerptId: string, layout: ExcerptLayout) => void;\n  onEdit: (excerptId: string, changes: Partial<NoteExcerpt>) => void;\n  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;\n  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;\n  onOpenSource: (excerpt: NoteExcerpt) => void;\n  onDelete: (excerptId: string) => void;\n};\n\nexport function NoteObjectLayer({ excerpts, resolveSource, selectedId, activeTool, interactive = true, onSelect, onMove, onEdit, onTextActivate, onNormalizeTextInput, onOpenSource, onDelete }: NoteObjectLayerProps) {\n  return <div className="note-excerpts" aria-label={interactive ? "Khung chữ và ảnh trên trang note" : undefined} aria-hidden={interactive ? undefined : true}>\n    {excerpts.map((excerpt, index) => {\n      const selected = interactive && excerpt.id === selectedId;\n      const calloutTextMode = selected && excerpt.annotationKind === "callout" && activeTool === "text";\n      return <DraggableExcerpt key={excerpt.id} excerpt={excerpt} source={resolveSource(excerpt)} index={index} selected={selected} selectable={interactive && (activeTool === "pointer" || activeTool === "text")} movable={interactive && (activeTool === "pointer" || calloutTextMode || (selected && activeTool === "text" && excerpt.kind === "text"))} editable={interactive && activeTool === "text" && selected && excerpt.kind === "text"} onSelect={onSelect} onMove={onMove} onEdit={onEdit} onTextActivate={onTextActivate} onNormalizeTextInput={onNormalizeTextInput} onOpenSource={onOpenSource} onDelete={onDelete} />;\n    })}\n  </div>;\n}\n`;
  write('app/note-object-layer.tsx', objectFile);
  page = page.slice(0, start) + page.slice(end);
}

// Extract P8.5 ink view and pure geometry helpers.
if (page.includes('function drawStroke')) {
  const start = page.indexOf('function drawStroke');
  const end = page.indexOf('function NoteSheetPreview', start);
  if (end < 0) throw new Error('Cannot locate InkCanvas end');
  let inkBlock = page.slice(start, end);
  inkBlock = inkBlock.replace('  tool: Tool;', '  tool: NoteInkTool;');
  inkBlock = inkBlock.replace('function InkCanvas(', 'export function NoteInkCanvas(');
  const inkFile = `import { Copy, Trash2 } from "lucide-react";\nimport { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport type { PenStyle, Point, ShapeKind, Stroke } from "./note-runtime-adapter";\n\nexport type NoteInkTool = "pointer" | "pen" | "highlight" | "eraser" | "lasso" | "shape" | "text" | "textbox" | "callout";\nfunction uid(prefix: string) { return \`\${prefix}-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`; }\n\n${inkBlock}`;
  write('app/note-ink-canvas.tsx', inkFile);
  page = page.slice(0, start) + page.slice(end);
}
page = page.replaceAll('<InkCanvas ', '<NoteInkCanvas ');

// Replace object maps with NoteObjectLayer.
page = page.replace(/<div className="note-excerpts" aria-hidden="true">\s*\{note\.excerpts\.map\(\(excerpt, index\) => <DraggableExcerpt[\s\S]*?<\/div>/, `<NoteObjectLayer excerpts={note.excerpts} resolveSource={resolveSource} selectedId={null} activeTool="pointer" interactive={false} onSelect={() => undefined} onMove={() => undefined} onEdit={() => undefined} onTextActivate={() => undefined} onNormalizeTextInput={() => undefined} onOpenSource={() => undefined} onDelete={() => undefined} />`);
page = page.replace(/<div className="note-excerpts" aria-label="Khung chữ và ảnh trên trang note">\s*\{activeNote\.excerpts\.map\(\(excerpt, index\) => \{[\s\S]*?\}\)\}\s*<\/div>/, `<NoteObjectLayer excerpts={activeNote.excerpts} resolveSource={resolveExcerptSource} selectedId={selectedExcerptId} activeTool={activeTool} onSelect={setSelectedExcerptId} onMove={moveExcerpt} onEdit={editExcerpt} onTextActivate={activateTextEditor} onNormalizeTextInput={normalizeTextEditorInput} onOpenSource={openExcerptSource} onDelete={deleteExcerpt} />`);

// P8.5 history is session-owned and never persisted.
page = page.replace(
  '  const [strokeHistory, setStrokeHistory] = useState<StrokeHistory>({});',
  '  const noteInkSession = useMemo(() => new NoteInkSession(60), []);\n  const [inkHistoryVersion, setInkHistoryVersion] = useState(0);');
const historyStart = page.indexOf('  const commitStrokes = (next: Stroke[], previous: Stroke[]) => {');
const historyEnd = page.indexOf('  const addTextBoxAt =', historyStart);
if (historyStart >= 0 && historyEnd > historyStart) {
  const historyCode = `  const commitStrokes = (next: Stroke[], previous: Stroke[]) => {\n    if (!noteInkSession.commit(activeNote.id, next, previous)) return;\n    updateActiveNote({ strokes: next });\n    setInkHistoryVersion((value) => value + 1);\n  };\n\n  const undo = () => {\n    const previous = noteInkSession.undo(activeNote.id, activeNote.strokes);\n    if (!previous) return;\n    updateActiveNote({ strokes: previous });\n    setInkHistoryVersion((value) => value + 1);\n  };\n\n  const redo = () => {\n    const next = noteInkSession.redo(activeNote.id, activeNote.strokes);\n    if (!next) return;\n    updateActiveNote({ strokes: next });\n    setInkHistoryVersion((value) => value + 1);\n  };\n\n`;
  page = page.slice(0, historyStart) + historyCode + page.slice(historyEnd);
}
page = page.replace('disabled={!(strokeHistory[activeNote.id]?.undo.length)}', 'disabled={!noteInkSession.canUndo(activeNote.id)} data-ink-history-version={inkHistoryVersion}');
page = page.replace('disabled={!(strokeHistory[activeNote.id]?.redo.length)}', 'disabled={!noteInkSession.canRedo(activeNote.id)} data-ink-history-version={inkHistoryVersion}');

// All page rich text commands route through one controller.
page = page.replaceAll('document.execCommand(', 'richTextController.execCommand(');

// P8.7 React zoom controller replaces DOM shim.
const fitAnchor = `  const fitNoteToView = () => {\n    const available = (noteStageRef.current?.clientWidth ?? basePaperMaxWidth) - 72;\n    setNoteViewZoom(available / basePaperMaxWidth);\n  };`;
if (page.includes(fitAnchor) && !page.includes('useNoteZoomController(noteStageRef')) {
  page = page.replace(fitAnchor, `${fitAnchor}\n  useNoteZoomController(noteStageRef, noteZoom, setNoteViewZoom, fitNoteToView);`);
}

write('app/page.tsx', page);

// P8.2/P8.4/P8.8 First Aid source integration, common RichTextEditor and canonical assets.
{
  let code = read('app/first-aid-block-editor.tsx');
  if (!code.includes('import { RichTextEditor } from "./rich-text-editor";')) {
    code = code.replace('import "./first-aid-block-editor.css";', 'import "./first-aid-block-editor.css";\nimport { RichTextEditor } from "./rich-text-editor";\nimport { localBinaryStorage } from "./local-binary-storage";');
  }
  code = code.replace(
    '  pageObjectIds: string[];\n  onTextActivate:',
    '  pageObjectIds: string[];\n  pageObjectLayouts: Record<string, { height: number }>;\n  pageHeightCss: number;\n  onTextActivate:');
  code = code.replace(
    'export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, onRequestPdfCrop, pdfCropResult, onPdfCropHandled, pageObjectIds, onTextActivate, onNormalizeTextInput }: FirstAidBlockEditorProps) {',
    'export function FirstAidBlockEditor({ html, plainText, mode, onChange, onInsertImage, onRemoveImage, onRequestPdfCrop, pdfCropResult, onPdfCropHandled, pageObjectIds, pageObjectLayouts, pageHeightCss, onTextActivate, onNormalizeTextInput }: FirstAidBlockEditorProps) {');
  if (!code.includes('const pageObjectLayoutKey')) {
    code = code.replace('  const pageObjectKey = [...pageObjectIds].sort().join("|");', '  const pageObjectKey = [...pageObjectIds].sort().join("|");\n  const pageObjectLayoutKey = pageObjectIds.map((id) => `${id}:${pageObjectLayouts[id]?.height ?? 0}`).join("|");');
  }
  // Canonical asset read-through: canonical first, legacy fallback, then copy.
  code = code.replace('async function readAsset(id: string) {\n  const database = await openAssetDb();', 'async function readLegacyAsset(id: string) {\n  const database = await openAssetDb();');
  if (!code.includes('async function readAsset(id: string) {\n  const canonical')) {
    const legacyEnd = '  database.close();\n  return blob;\n}\n\nasync function compressImage';
    code = code.replace(legacyEnd, '  database.close();\n  return blob;\n}\n\nasync function readAsset(id: string) {\n  const canonical = await localBinaryStorage.readAsset(id);\n  if (canonical) return canonical;\n  const legacy = await readLegacyAsset(id);\n  if (legacy) await localBinaryStorage.saveAsset(id, legacy);\n  return legacy;\n}\n\nasync function compressImage');
  }
  // Replace duplicate contentEditable implementation by a thin adapter over shared RichTextEditor.
  const blockStart = code.indexOf('function BlockRichEditor(');
  const blockEnd = code.indexOf('function InsertMenu(', blockStart);
  if (blockStart >= 0 && blockEnd > blockStart && code.slice(blockStart, blockEnd).includes('document.execCommand')) {
    const wrapper = `function BlockRichEditor({ editorId, className = "", html, text, textStyle = "paragraph", editable, singleLine = false, placeholder, ariaLabel, onChange, onActivate, onNormalizeInput }: {\n  editorId: string; className?: string; html?: string; text?: string; textStyle?: TextStyle; editable: boolean; singleLine?: boolean; placeholder?: string; ariaLabel: string;\n  onChange: (html: string, text: string) => void; onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void; onNormalizeInput: (editorId: string, editor: HTMLElement) => void;\n}) {\n  return <RichTextEditor editorId={editorId} className={\`fa-rich-editor \${className}\`} html={richBlockHtml(html, text, textStyle)} editable={editable} singleLine={singleLine} placeholder={placeholder} ariaLabel={ariaLabel} onChange={(nextHtml, nextText) => onChange(sanitizeBlockRichTextHtml(nextHtml), nextText)} onActivate={onActivate} onNormalizeInput={onNormalizeInput} />;\n}\n\n`;
    code = code.slice(0, blockStart) + wrapper + code.slice(blockEnd);
  }
  // Linked image placeholder follows canonical object layout, no CustomEvent/global bus.
  code = code.replace(
    '    if (block.imageObjectId) {\n      return <div className="fa-linked-image-space" style={{ aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;\n    }',
    '    if (block.imageObjectId) {\n      const objectHeight = pageObjectLayouts[block.imageObjectId]?.height;\n      const linkedHeight = objectHeight && pageHeightCss > 0 ? Math.max(28, Math.round(objectHeight * pageHeightCss)) : undefined;\n      return <div className="fa-linked-image-space" data-layout-key={pageObjectLayoutKey} style={linkedHeight ? { height: `${linkedHeight}px` } : { aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;\n    }');
  write('app/first-aid-block-editor.tsx', code);
}

// P8.7 symbol module is now catalog/recent state only; insertion is page controller-owned.
{
  const current = read('app/note-symbol-library.ts');
  const groupsStart = current.indexOf('const GROUPS:');
  const groupsEnd = current.indexOf('\n\nconst allItems', groupsStart);
  if (groupsStart >= 0 && groupsEnd > groupsStart) {
    const groups = current.slice(groupsStart, groupsEnd).replace('const GROUPS:', 'export const NOTE_SYMBOL_GROUPS:');
    write('app/note-symbol-library.ts', `export type NoteSymbolLibraryKind = "icon" | "emoji";\nexport type NoteSymbolLibraryItem = { value: string; name: string; keywords: string };\nexport type NoteSymbolLibraryGroup = { label: string; kind: NoteSymbolLibraryKind; items: NoteSymbolLibraryItem[] };\n\nconst RECENT_KEY = "mednote-recent-note-symbols";\n\n${groups.replaceAll('LibraryGroup', 'NoteSymbolLibraryGroup')}\n\nexport function readRecentNoteSymbols() {\n  try {\n    const values = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");\n    return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 16) : [];\n  } catch { return []; }\n}\n\nexport function rememberRecentNoteSymbol(value: string) {\n  const next = [value, ...readRecentNoteSymbols().filter((item) => item !== value)].slice(0, 16);\n  localStorage.setItem(RECENT_KEY, JSON.stringify(next));\n}\n`);
  }
}

// Remove runtime shims from entry; page/controller now owns behavior.
{
  let main = read('src/main.tsx');
  main = main.replace('import "../app/note-zoom-runtime";\n', '');
  main = main.replace('import "../app/note-symbol-library";\n', '');
  write('src/main.tsx', main);
}

// Remove source-transform plugins from web/desktop Vite configs.
for (const file of ['vite.github.config.ts', 'vite.desktop.config.ts']) {
  let code = read(file);
  code = code.replace('import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";\n', '');
  code = code.replace('import { noteStickersPlugin } from "./vite.note-stickers";\n', '');
  code = code.replace(/firstAidBlocksPlugin\(\),\s*/g, '');
  code = code.replace(/noteStickersPlugin\(\),\s*/g, '');
  write(file, code);
}

console.log('P8 source refactor applied');
