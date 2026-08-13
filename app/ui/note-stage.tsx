import { Check, Sigma, Table2, X, type LucideIcon } from "lucide-react";
import type { CSSProperties, ComponentProps, Dispatch, MutableRefObject, PointerEvent, RefObject, SetStateAction } from "react";
import { FirstAidBlockEditor } from "../first-aid-block-editor";
import { createFirstAidDocument, regularTemplateRichText, stripFirstAidBlockMetadata } from "../first-aid-block-model";
import type { Page } from "../note-domain";
import { NoteInkCanvas } from "../note-ink-canvas";
import { NoteObjectLayer, type NoteObjectLayerProps } from "../note-object-layer";
import type { ActiveRichTextEditor } from "../note-rich-text-controller";
import {
  plainTextToRichHtml,
  type ExcerptAppearance,
  type NotePage,
  type NotePageContentPatch,
  type PaperColor,
  type PaperSettings,
  type PaperSize,
  type PaperTemplate,
  type PenStyle,
  type ShapeKind,
  type Stroke,
  type TableBorderStyle,
} from "../note-runtime-adapter";
import type { NoteStoreSnapshot } from "../note-store";
import PageTitleEditor from "../page-title-editor";
import { RichTextEditor, type RichTextEditorProps } from "../rich-text-editor";
import { NoteSheetPreview, type NoteSheetPreviewProps } from "./note-sheet-preview";
import type { BulletStyle, EquationTemplate, FirstAidCropResult, NotePanel, NoteSheetViewMode, NumberingStyle, StickerPresetId, TableBorderSettings, TextCommand, TextInsertPopover, TextToolbarState, Tool } from "./ui-contracts";

type LinePreset = { id: string; label: string; style: TableBorderStyle; width: number };
type EquationOption = { id: EquationTemplate; label: string; sample: string; fields: string[]; defaults: string[] };

export type NoteStageScope = {
  BORDER_COLORS: string[];
  BULLET_STYLES: { id: BulletStyle; label: string; glyph: string }[];
  EQUATION_PRESETS: string[];
  EQUATION_TEMPLATES: EquationOption[];
  INK_COLORS: string[];
  LINE_PRESETS: LinePreset[];
  NUMBERING_STYLES: { id: NumberingStyle; label: string; sample: string }[];
  PAPER_COLORS: { id: PaperColor; label: string; swatch: string }[];
  PAPER_SIZES: Record<PaperSize, { label: string; dimensions: string; width: number; height: number; maxWidth: number }>;
  PAPER_TEMPLATES: { id: PaperTemplate; label: string }[];
  PEN_STYLES: { id: PenStyle; label: string; icon: LucideIcon }[];
  STICKER_PRESETS: { id: StickerPresetId; label: string; description: string }[];
  SYMBOL_GROUPS: { label: string; symbols: string[] }[];
  TEXT_BACKGROUND_COLORS: string[];
  TEXT_BOX_BACKGROUND_COLORS: string[];
  TEXT_COLORS: string[];
  activateContinuousSheet: (sheetId: string) => void | Promise<unknown>;
  activateTextEditor: RichTextEditorProps["onActivate"];
  activeLogicalPage: Page | undefined;
  activeNote: NotePage;
  activeNoteHydrating: boolean;
  activeSheetIndex: number;
  activeTextEditorRef: MutableRefObject<ActiveRichTextEditor | null>;
  activeTool: Tool;
  addCalloutAt: (event: PointerEvent<HTMLElement>) => void;
  addFirstAidImage: ComponentProps<typeof FirstAidBlockEditor>["onInsertImage"];
  addSticker: (presetId: StickerPresetId) => void;
  addTextBoxAt: (event: PointerEvent<HTMLElement>) => void;
  applyBulletStyle: (style: BulletStyle) => void;
  applyNumberingStyle: (style: NumberingStyle) => void;
  applyTableLinePreset: (preset: LinePreset) => void;
  applyTextCommand: (command: TextCommand, value?: string | number) => void;
  basePaperMaxWidth: number;
  commitStrokes: (next: Stroke[], previous: Stroke[]) => void;
  continuousNotes: NotePage[];
  deleteExcerpt: NoteObjectLayerProps["onDelete"];
  editExcerpt: NoteObjectLayerProps["onEdit"];
  equationDraft: string;
  equationMarkup: (template: EquationTemplate, parts: string[]) => string;
  equationParts: string[];
  equationTemplate: EquationTemplate;
  equationTemplateById: (template: EquationTemplate) => EquationOption;
  finishFirstAidPdfCrop: (token: string) => void;
  firstAidCropResult: FirstAidCropResult | null;
  goToPage: (page: number) => void;
  highlighterWidth: number;
  inkColor: string;
  inkWidth: number;
  insertEquation: () => void;
  insertTable: () => void;
  insertTextAtSelection: (text: string, message?: string) => void;
  moveExcerpt: NoteObjectLayerProps["onMove"];
  normalizeTextEditorInput: RichTextEditorProps["onNormalizeInput"];
  notePanel: NotePanel;
  noteSheetViewMode: NoteSheetViewMode;
  noteStageRef: RefObject<HTMLDivElement | null>;
  noteState: NoteStoreSnapshot;
  noteZoom: number;
  openExcerptSource: NoteObjectLayerProps["onOpenSource"];
  paperHeight: number;
  paperStyle: CSSProperties;
  paperWidth: number;
  penStyle: PenStyle;
  requestFirstAidPdfCrop: ComponentProps<typeof FirstAidBlockEditor>["onRequestPdfCrop"];
  resolveExcerptSource: NoteSheetPreviewProps["resolveSource"];
  savedTextRangeRef: MutableRefObject<Range | null>;
  selectedExcerptId: string | null;
  selectedPaperSize: { label: string; dimensions: string };
  selectedTextBoxAppearance: ExcerptAppearance | null;
  setActiveTool: Dispatch<SetStateAction<Tool>>;
  setEquationDraft: Dispatch<SetStateAction<string>>;
  setEquationParts: Dispatch<SetStateAction<string[]>>;
  setEquationTemplate: Dispatch<SetStateAction<EquationTemplate>>;
  setHighlighterWidth: Dispatch<SetStateAction<number>>;
  setInkColor: Dispatch<SetStateAction<string>>;
  setInkWidth: Dispatch<SetStateAction<number>>;
  setNotePanel: Dispatch<SetStateAction<NotePanel>>;
  setPenStyle: Dispatch<SetStateAction<PenStyle>>;
  setSelectedExcerptId: Dispatch<SetStateAction<string | null>>;
  setShapeKind: Dispatch<SetStateAction<ShapeKind>>;
  setTableColumns: Dispatch<SetStateAction<number>>;
  setTableRows: Dispatch<SetStateAction<number>>;
  setTextInsertPopover: Dispatch<SetStateAction<TextInsertPopover>>;
  setToast: Dispatch<SetStateAction<string>>;
  shapeKind: ShapeKind;
  tableBorder: TableBorderSettings;
  tableColumns: number;
  tableRows: number;
  textInsertPopover: TextInsertPopover;
  textLayerStyle: CSSProperties;
  textPopoverLeft: number;
  textToolbar: TextToolbarState;
  updateActiveNote: (changes: NotePageContentPatch) => void;
  updatePaper: (changes: Partial<PaperSettings>) => void;
  updatePaperTemplate: (template: PaperTemplate) => void;
  updateSelectedTextBoxAppearance: (changes: Partial<ExcerptAppearance>, closePopover?: boolean) => void;
  updateTableBorder: (changes: Partial<TableBorderSettings>) => void;
};

export function NoteStage({ scope }: { scope: NoteStageScope }) {
  const { BORDER_COLORS, BULLET_STYLES, EQUATION_PRESETS, EQUATION_TEMPLATES, INK_COLORS, LINE_PRESETS, NUMBERING_STYLES, PAPER_COLORS, PAPER_SIZES, PAPER_TEMPLATES, PEN_STYLES, STICKER_PRESETS, SYMBOL_GROUPS, TEXT_BACKGROUND_COLORS, TEXT_BOX_BACKGROUND_COLORS, TEXT_COLORS, activateContinuousSheet, activateTextEditor, activeLogicalPage, activeNote, activeNoteHydrating, activeSheetIndex, activeTextEditorRef, activeTool, addCalloutAt, addFirstAidImage, addSticker, addTextBoxAt, applyBulletStyle, applyNumberingStyle, applyTableLinePreset, applyTextCommand, basePaperMaxWidth, commitStrokes, continuousNotes, deleteExcerpt, editExcerpt, equationDraft, equationMarkup, equationParts, equationTemplate, equationTemplateById, finishFirstAidPdfCrop, firstAidCropResult, goToPage, highlighterWidth, inkColor, inkWidth, insertEquation, insertTable, insertTextAtSelection, moveExcerpt, normalizeTextEditorInput, notePanel, noteSheetViewMode, noteStageRef, noteState, noteZoom, openExcerptSource, paperHeight, paperStyle, paperWidth, penStyle, requestFirstAidPdfCrop, resolveExcerptSource, savedTextRangeRef, selectedExcerptId, selectedPaperSize, selectedTextBoxAppearance, setActiveTool, setEquationDraft, setEquationParts, setEquationTemplate, setHighlighterWidth, setInkColor, setInkWidth, setNotePanel, setPenStyle, setSelectedExcerptId, setShapeKind, setTableColumns, setTableRows, setTextInsertPopover, setToast, shapeKind, tableBorder, tableColumns, tableRows, textInsertPopover, textLayerStyle, textPopoverLeft, textToolbar, updateActiveNote, updatePaper, updatePaperTemplate, updateSelectedTextBoxAppearance, updateTableBorder } = scope;
  return (<>{notePanel === "text" && textInsertPopover === "bullets" && (
            <div className="text-insert-popover list-library-popover bullet-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện dấu đầu dòng">
              <div className="list-library-grid">
                {BULLET_STYLES.map((option) => <button key={option.id} className={textToolbar.bulletStyle === option.id ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyBulletStyle(option.id)} title={option.label} aria-label={option.label}><span>{option.glyph}</span></button>)}
              </div>
            </div>
          )}{notePanel === "text" && textInsertPopover === "numbering" && (
            <div className="text-insert-popover list-library-popover numbering-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện đánh số">
              <div className="numbering-library-grid">
                {NUMBERING_STYLES.map((option) => <button key={option.id} className={textToolbar.numberingStyle === option.id ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyNumberingStyle(option.id)} title={option.label} aria-label={option.label}><span>{option.sample}</span></button>)}
              </div>
            </div>
          )}{notePanel === "text" && textInsertPopover === "textColor" && (
            <div className="text-insert-popover color-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Màu chữ">
              <header><strong>Màu chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="popover-color-grid">
                <button className="palette-auto-color" onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("color", activeNote.paper.color === "dark" ? "#edf3f4" : "#26343a"); setTextInsertPopover(null); }} title="Màu tự động" aria-label="Màu chữ tự động"><span>A</span></button>
                {TEXT_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${textToolbar.color === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("color", color); setTextInsertPopover(null); }} title={color} aria-label={`Màu chữ ${color}`} />)}
                <label className="popover-custom-color" title="Màu chữ tùy chỉnh"><input type="color" value={textToolbar.color === "auto" ? "#26343a" : textToolbar.color} onChange={(event) => { applyTextCommand("color", event.target.value); setTextInsertPopover(null); }} /><span>+</span></label>
              </div>
            </div>
          )}{notePanel === "text" && textInsertPopover === "backgroundColor" && (
            <div className="text-insert-popover color-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Màu nền chữ">
              <header><strong>Màu nền chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="popover-color-grid">
                {TEXT_BACKGROUND_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${textToolbar.backgroundColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => { applyTextCommand("background", color); setTextInsertPopover(null); }} title={color === "transparent" ? "Không màu" : color} aria-label={color === "transparent" ? "Nền chữ trong suốt" : `Màu nền chữ ${color}`} />)}
                <label className="popover-custom-color" title="Màu nền chữ tùy chỉnh"><input type="color" value={textToolbar.backgroundColor === "transparent" ? "#fff2a8" : textToolbar.backgroundColor} onChange={(event) => { applyTextCommand("background", event.target.value); setTextInsertPopover(null); }} /><span>+</span></label>
              </div>
            </div>
          )}{notePanel === "text" && textInsertPopover === "tableLines" && (
            <div className="text-insert-popover line-library-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện đường kẻ bảng">
              <div className="line-library-list">
                {LINE_PRESETS.map((preset) => <button key={preset.id} className={tableBorder.style === preset.style && tableBorder.width === preset.width ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTableLinePreset(preset)} title={preset.label} aria-label={preset.label}><i className={preset.width === 0 ? "line-sample-none" : ""} style={preset.width === 0 ? undefined : { borderTopStyle: preset.style, borderTopWidth: `${preset.width}px`, borderTopColor: tableBorder.color }} /></button>)}
              </div>
              <div className="popover-color-strip" aria-label="Màu đường kẻ bảng">
                {BORDER_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${tableBorder.color === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateTableBorder({ color })} title={color === "transparent" ? "Không màu" : color} aria-label={color === "transparent" ? "Đường kẻ trong suốt" : `Màu đường kẻ ${color}`} />)}
                <label className="popover-custom-color" title="Màu đường kẻ tùy chỉnh"><input type="color" value={tableBorder.color === "transparent" ? "#60737d" : tableBorder.color} onChange={(event) => updateTableBorder({ color: event.target.value })} /><span>+</span></label>
              </div>
            </div>
          )}{notePanel === "text" && textInsertPopover === "textBoxStyle" && selectedTextBoxAppearance && (
            <div className="text-insert-popover text-box-style-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Viền và nền hộp chữ">
              <header><strong>Hộp chữ</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="line-library-list">
                {LINE_PRESETS.map((preset) => <button key={preset.id} className={selectedTextBoxAppearance.borderStyle === preset.style && selectedTextBoxAppearance.borderWidth === preset.width ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ borderStyle: preset.style, borderWidth: preset.width })} title={preset.label} aria-label={preset.label}><i className={preset.width === 0 ? "line-sample-none" : ""} style={preset.width === 0 ? undefined : { borderTopStyle: preset.style, borderTopWidth: `${preset.width}px`, borderTopColor: selectedTextBoxAppearance.borderColor }} /></button>)}
              </div>
              <section className="appearance-color-section"><span>Viền</span><div className="popover-color-strip">{BORDER_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${selectedTextBoxAppearance.borderColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ borderColor: color })} title={color === "transparent" ? "Viền trong suốt" : color} aria-label={color === "transparent" ? "Viền trong suốt" : `Màu viền ${color}`} />)}<label className="popover-custom-color" title="Màu viền tùy chỉnh"><input type="color" value={selectedTextBoxAppearance.borderColor === "transparent" ? "#60737d" : selectedTextBoxAppearance.borderColor} onChange={(event) => updateSelectedTextBoxAppearance({ borderColor: event.target.value })} /><span>+</span></label></div></section>
              <section className="appearance-color-section"><span>Nền</span><div className="popover-color-strip">{TEXT_BOX_BACKGROUND_COLORS.map((color) => <button key={color} className={`popover-color-swatch ${selectedTextBoxAppearance.backgroundColor === color ? "selected" : ""} ${color === "transparent" ? "transparent" : ""}`} style={color === "transparent" ? undefined : { "--swatch": color } as React.CSSProperties} onPointerDown={(event) => event.preventDefault()} onClick={() => updateSelectedTextBoxAppearance({ backgroundColor: color })} title={color === "transparent" ? "Nền trong suốt" : color} aria-label={color === "transparent" ? "Nền hộp chữ trong suốt" : `Màu nền hộp chữ ${color}`} />)}<label className="popover-custom-color" title="Màu nền tùy chỉnh"><input type="color" value={selectedTextBoxAppearance.backgroundColor === "transparent" ? "#ffffff" : selectedTextBoxAppearance.backgroundColor} onChange={(event) => updateSelectedTextBoxAppearance({ backgroundColor: event.target.value })} /><span>+</span></label></div></section>
            </div>
          )}{notePanel === "text" && textInsertPopover === "stickers" && (
            <div className="text-insert-popover note-sticker-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Thư viện sticker note">
              <header><div><strong>Sticker note</strong><small>Mỗi mẫu là một textbox có thể kéo và đổi kích thước</small></div><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
              <div className="note-sticker-grid">
                {STICKER_PRESETS.map((preset) => <button key={preset.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => addSticker(preset.id)} title={preset.description}><span className={`note-sticker-preview sticker-${preset.id}`}><i>Ghi chú…</i></span><b>{preset.label}</b><small>{preset.description}</small></button>)}
              </div>
              <footer>Chèn xong có thể gõ ngay · chuyển sang Chọn để kéo, co giãn và sắp xếp lớp</footer>
            </div>
          )}{notePanel === "text" && textInsertPopover === "symbols" && <div className="text-insert-popover symbol-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn ký hiệu"><header><strong>Ký hiệu</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>{SYMBOL_GROUPS.map((group) => <section key={group.label}><label>{group.label}</label><div>{group.symbols.map((symbol) => <button key={symbol} onPointerDown={(event) => event.preventDefault()} onClick={() => insertTextAtSelection(symbol)}>{symbol}</button>)}</div></section>)}</div>}{notePanel === "text" && textInsertPopover === "equation" && <div className="text-insert-popover equation-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn công thức">
            <header><strong>Công thức</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>
            <div className="equation-template-grid">{EQUATION_TEMPLATES.map((option) => <button key={option.id} className={equationTemplate === option.id ? "selected" : ""} onClick={() => { setEquationTemplate(option.id); setEquationParts([...option.defaults]); if (option.id === "plain") setEquationDraft(option.defaults[0]); }}><b>{option.sample}</b><span>{option.label}</span></button>)}</div>
            {equationTemplate === "plain" ? <label className="equation-input-label">Nhập công thức<input value={equationDraft} spellCheck={false} onChange={(event) => setEquationDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") insertEquation(); }} autoFocus /></label> : <div className="equation-field-grid">{equationTemplateById(equationTemplate).fields.map((label, index) => <label key={`${equationTemplate}-${label}`}>{label}<input value={equationParts[index] ?? ""} spellCheck={false} onChange={(event) => setEquationParts((current) => current.map((part, partIndex) => partIndex === index ? event.target.value : part))} /></label>)}</div>}
            <div className="equation-preview" aria-label="Xem trước công thức" dangerouslySetInnerHTML={{ __html: equationMarkup(equationTemplate, equationTemplate === "plain" ? [equationDraft] : equationParts) }} />
            <div className="equation-presets">{EQUATION_PRESETS.map((equation) => <button key={equation} onClick={() => { setEquationTemplate("plain"); setEquationDraft(equation); setEquationParts([equation]); }}>{equation}</button>)}</div>
            <button className="insert-confirm-button" onClick={() => insertEquation()}><Sigma size={15} /> Chèn công thức</button>
          </div>}{notePanel === "text" && textInsertPopover === "table" && <div className="text-insert-popover table-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn bảng"><header><strong>Chèn bảng</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header><div className="table-size-controls"><label>Hàng<input type="number" min="1" max="12" value={tableRows} onChange={(event) => setTableRows(Math.max(1, Math.min(12, Number(event.target.value))))} /></label><span>×</span><label>Cột<input type="number" min="1" max="10" value={tableColumns} onChange={(event) => setTableColumns(Math.max(1, Math.min(10, Number(event.target.value))))} /></label></div><div className="table-preview-grid" style={{ gridTemplateColumns: `repeat(${tableColumns}, 12px)` }} aria-hidden="true">{Array.from({ length: tableRows * tableColumns }, (_, index) => <i key={index} style={{ borderStyle: tableBorder.style, borderWidth: `${Math.min(tableBorder.width, 3)}px`, borderColor: tableBorder.color }} />)}</div><button className="insert-confirm-button" onClick={insertTable}><Table2 size={15} /> Chèn bảng {tableRows} × {tableColumns}</button></div>}{notePanel === "ink" && (
            <div className="floating-tool-panel note-ink-panel" role="dialog" aria-label="Cài đặt bút">
              <div className="tool-panel-heading"><div><strong>{activeTool === "highlight" ? "Bút tô sáng" : "Bút viết"}</strong><span>Chọn màu không làm đổi loại bút</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              {activeTool === "pen" && <div className="panel-setting"><label>Loại bút</label><div className="pen-style-grid">{PEN_STYLES.map(({ id, label, icon: Icon }) => <button key={id} className={penStyle === id ? "selected" : ""} onClick={() => setPenStyle(id)}><Icon size={22} /><span>{label}</span>{penStyle === id && <Check size={13} />}</button>)}</div></div>}
              <div className="panel-setting"><label>Màu mực</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /><span>+</span></label></div></div>
              <div className="panel-setting"><label>Độ dày</label><div className="width-options">{(activeTool === "highlight" ? [8, 14, 20, 28] : [1, 2, 3, 5]).map((width) => { const selected = activeTool === "highlight" ? highlighterWidth === width : inkWidth === width; return <button key={width} className={selected ? "selected" : ""} onClick={() => activeTool === "highlight" ? setHighlighterWidth(width) : setInkWidth(width)}><i style={{ height: Math.min(width, 8) }} />{width}</button>; })}</div></div>
            </div>
          )}{notePanel === "shape" && (
            <div className="floating-tool-panel note-shape-panel" role="dialog" aria-label="Cài đặt hình học">
              <div className="tool-panel-heading"><div><strong>Hình học</strong><span>Chọn hình, màu và độ dày nét</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <div className="shape-option-grid">
                {([['line', 'Đường thẳng'], ['arrow', 'Mũi tên'], ['rectangle', 'Chữ nhật'], ['ellipse', 'Bầu dục'], ['circle', 'Hình tròn']] as [ShapeKind, string][]).map(([id, label]) => <button key={id} className={shapeKind === id ? "selected" : ""} onClick={() => setShapeKind(id)}><span className={`shape-sample shape-${id}`} /><b>{label}</b></button>)}
              </div>
              <div className="panel-setting"><label>Màu nét</label><div className="color-options">{INK_COLORS.map((color) => <button key={color} className={`color-swatch ${inkColor === color ? "selected" : ""}`} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Chọn màu ${color}`} />)}<label className="custom-color" title="Màu tùy chỉnh"><input type="color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /><span>+</span></label></div></div>
              <div className="panel-setting"><label>Độ dày</label><div className="width-options">{[1, 2, 3, 5].map((width) => <button key={width} className={inkWidth === width ? "selected" : ""} onClick={() => setInkWidth(width)}><i style={{ height: width }} />{width}</button>)}</div></div>
            </div>
          )}{notePanel === "paper" && (
            <div className="paper-panel" role="dialog" aria-label="Cài đặt giấy">
              <div className="paper-panel-heading"><div><strong>Mẫu giấy</strong><span>Áp dụng riêng cho trang hiện tại</span></div><button className="icon-button compact" onClick={() => setNotePanel(null)} aria-label="Đóng"><X size={17} /></button></div>
              <section>
                <label>Khổ giấy</label>
                <div className="paper-size-grid">
                  {(Object.keys(PAPER_SIZES) as PaperSize[]).map((size) => {
                    const option = PAPER_SIZES[size];
                    return <button key={size} className={activeNote.paper.size === size ? "selected" : ""} onClick={() => updatePaper({ size })}><b>{option.label}</b><small>{option.dimensions}</small>{activeNote.paper.size === size && <Check size={14} />}</button>;
                  })}
                </div>
              </section>
              <section>
                <label>Hướng giấy</label>
                <div className="segmented-control"><button className={activeNote.paper.orientation === "portrait" ? "selected" : ""} onClick={() => updatePaper({ orientation: "portrait" })}>Dọc</button><button className={activeNote.paper.orientation === "landscape" ? "selected" : ""} onClick={() => updatePaper({ orientation: "landscape" })}>Ngang</button></div>
              </section>
              <section>
                <label>Dòng kẻ & bố cục</label>
                <div className="template-grid">
                  {PAPER_TEMPLATES.map((template) => <button key={template.id} className={activeNote.paper.template === template.id ? "selected" : ""} onClick={() => updatePaperTemplate(template.id)}><span className={`template-preview template-${template.id}`} /><b>{template.label}</b></button>)}
                </div>
                <p className="paper-template-help">Mẫu First Aid dùng đầu mục xanh, đường phân cách mảnh và dải tiêu đề tím–xanh; trang trống sẽ được tạo sẵn khung nội dung để điền.</p>
              </section>
              <section>
                <label>Màu giấy</label>
                <div className="paper-color-row">
                  {PAPER_COLORS.map((paperColor) => <button key={paperColor.id} className={activeNote.paper.color === paperColor.id ? "selected" : ""} onClick={() => updatePaper({ color: paperColor.id })} title={paperColor.label} aria-label={paperColor.label}><span style={{ background: paperColor.swatch }} />{activeNote.paper.color === paperColor.id && <Check size={13} />}</button>)}
                </div>
              </section>
            </div>
          )}<div className={`note-stage workspace-frame note-stage-${noteSheetViewMode} ${activeNoteHydrating ? "note-stage-hydrating" : ""}`} ref={noteStageRef} aria-busy={activeNoteHydrating || noteState.hydratingPageId === noteState.structure?.active.activePageId}>
            {activeNoteHydrating && <div className="note-hydration-status" role="status" aria-live="polite">Đang mở nội dung tờ…</div>}
            {noteSheetViewMode === "continuous" && continuousNotes.slice(0, activeSheetIndex).map((note, index) => <NoteSheetPreview
              key={note.id}
              note={note}
              sheetNumber={index + 1}
              zoom={noteZoom}
              loaded={Object.hasOwn(noteState.pageSheetContents, note.id) && !note.__mednoteLazyPage}
              onActivate={() => { void activateContinuousSheet(note.id); }}
              resolveSource={resolveExcerptSource}
            />)}
            {noteSheetViewMode === "continuous" && <div className="note-sheet-active-label" data-note-sheet-frame={activeNote.id} style={{ "--paper-max-width": `${basePaperMaxWidth}px`, "--note-view-zoom": noteZoom } as React.CSSProperties}><span>Tờ {activeSheetIndex + 1}</span><b>Đang chỉnh sửa</b></div>}
            <article data-note-page-id={activeNote.id} className={`note-paper interactive ${activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer") ? "typing" : ""} ${activeTool === "pointer" || activeTool === "text" || activeTool === "textbox" || activeTool === "callout" ? "object-mode" : ""} paper-${activeNote.paper.color} template-${activeNote.paper.template}`} style={{ ...paperStyle, pointerEvents: activeNoteHydrating ? "none" : undefined, opacity: activeNoteHydrating ? .72 : 1 }} onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest(".note-excerpt")) return;
              setSelectedExcerptId(null);
              if (!(event.target as HTMLElement).closest("[data-rich-editor-id]")) {
                activeTextEditorRef.current = null;
                savedTextRangeRef.current = null;
              }
              if (activeTool === "textbox") addTextBoxAt(event);
              if (activeTool === "callout") addCalloutAt(event);
            }}>
              <div className="paper-background" />
              <div className={`typed-layer ${activeNote.excerpts.length ? "has-excerpts" : ""}`} style={textLayerStyle}>
                <PageTitleEditor
                  key={`page-title:${activeLogicalPage?.id ?? activeNote.id}`}
                  pageId={activeLogicalPage?.id ?? ""}
                  title={activeLogicalPage?.title ?? activeNote.title}
                  className="note-title-input"
                  editable={Boolean(activeLogicalPage?.id) && (activeTool === "text" || (activeNote.paper.template === "first-aid" && activeTool === "pointer"))}
                  placeholder="Nhập tiêu đề"
                  ariaLabel="Tiêu đề ghi chú"
                  onActivate={() => {
                    if (activeNote.paper.template === "first-aid" && activeTool === "pointer") {
                      setActiveTool("text");
                      setNotePanel("text");
                    }
                  }}
                  onError={(message) => setToast(message)}
                />
                {activeNote.paper.template === "first-aid" ? <FirstAidBlockEditor key={activeNote.id} document={activeNote.firstAid ?? createFirstAidDocument()} mode={activeTool === "text" || activeTool === "pointer" ? "edit" : "view"} onChange={(firstAid) => updateActiveNote({ firstAid })} onInsertImage={addFirstAidImage} onRemoveImage={deleteExcerpt} onRequestPdfCrop={requestFirstAidPdfCrop} pdfCropResult={firstAidCropResult} onPdfCropHandled={finishFirstAidPdfCrop} pageObjectIds={activeNote.excerpts.map((excerpt) => excerpt.id)} pageObjectLayouts={Object.fromEntries(activeNote.excerpts.map((excerpt) => [excerpt.id, { height: excerpt.layout?.height ?? 0 }]))} pageHeightCss={basePaperMaxWidth * (paperHeight / paperWidth)} onTextActivate={(editorId, editor, range) => { if (activeTool === "pointer") { setActiveTool("text"); setNotePanel("text"); } activateTextEditor(editorId, editor, range); }} onNormalizeTextInput={normalizeTextEditorInput} /> : <RichTextEditor key={`body:${activeNote.id}`} editorId={`body:${activeNote.id}`} className="note-editor" html={regularTemplateRichText(activeNote.bodyHtml ?? plainTextToRichHtml(activeNote.body), activeNote.body)} editable={activeTool === "text"} placeholder="Bắt đầu nhập nội dung tại đây…" ariaLabel="Nội dung ghi chú" onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml: stripFirstAidBlockMetadata(bodyHtml), body, firstAid: undefined })} onActivate={activateTextEditor} onNormalizeInput={normalizeTextEditorInput} />}
                <NoteObjectLayer excerpts={activeNote.excerpts} resolveSource={resolveExcerptSource} selectedId={selectedExcerptId} activeTool={activeTool} onSelect={setSelectedExcerptId} onMove={moveExcerpt} onEdit={editExcerpt} onTextActivate={activateTextEditor} onNormalizeTextInput={normalizeTextEditorInput} onOpenSource={openExcerptSource} onDelete={deleteExcerpt} />
                {activeNote.citationPage && !activeNote.excerpts.length && <button className="citation-chip" onClick={() => { goToPage(activeNote.citationPage!); setToast(`Đã quay lại trang ${activeNote.citationPage}`); }}>Trang {activeNote.citationPage}</button>}
              </div>
              <NoteInkCanvas key={activeNote.id} tool={activeTool} color={inkColor} width={activeTool === "highlight" ? highlighterWidth : inkWidth} penStyle={penStyle} shape={shapeKind} strokes={activeNote.strokes} onCommit={commitStrokes} />
              {activeTool === "text" && <div className="mode-hint">Nhập chữ hoặc sửa đoạn trích</div>}
              {activeTool === "textbox" && <div className="mode-hint">Bấm vị trí muốn đặt hộp chữ</div>}
              {activeTool === "callout" && <div className="mode-hint">Bấm đúng vị trí muốn callout chỉ tới</div>}
              {activeTool === "pointer" && activeNote.excerpts.length > 0 && <div className="mode-hint">Kéo đối tượng · kéo góc đổi cỡ · callout: kéo đầu mũi tên</div>}
            </article>
            <div className="paper-size">{selectedPaperSize.label} ({selectedPaperSize.dimensions}) · {activeNote.paper.orientation === "portrait" ? "Dọc" : "Ngang"} · {activeTool === "pointer" ? "Chọn đối tượng để di chuyển, đổi cỡ hoặc sắp xếp lớp" : activeTool === "text" ? "Nhập nội dung trang hoặc sửa trực tiếp đoạn chữ từ PDF" : activeTool === "textbox" ? "Bấm trên trang để tạo hộp chữ" : activeTool === "callout" ? "Bấm vị trí cần chú thích để tạo hộp callout có mũi tên" : activeTool === "lasso" ? "Khoanh quanh nét cần chọn" : activeTool === "eraser" ? "Lướt để tẩy đúng phần nét chạm vào" : "Dùng chuột hoặc bút cảm ứng để viết"}</div>
            {noteSheetViewMode === "continuous" && continuousNotes.slice(activeSheetIndex + 1).map((note, offset) => <NoteSheetPreview
              key={note.id}
              note={note}
              sheetNumber={activeSheetIndex + offset + 2}
              zoom={noteZoom}
              loaded={Object.hasOwn(noteState.pageSheetContents, note.id) && !note.__mednoteLazyPage}
              onActivate={() => { void activateContinuousSheet(note.id); }}
              resolveSource={resolveExcerptSource}
            />)}
          </div></>);
}
