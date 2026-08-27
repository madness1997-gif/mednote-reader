import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BringToFront, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, IndentDecrease, IndentIncrease, Italic, Layers2, List, ListOrdered, Maximize2, MessageSquareText, Minus, NotebookTabs, Omega, PaintBucket, PanelRightOpen, Plus, Redo2, RemoveFormatting, Rows3, ScanText, SendToBack, Sigma, Square, Strikethrough, Subscript, Superscript, Table2, Underline, Undo2, type LucideIcon } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { ExcerptAppearance, NoteExcerpt, NotePage } from "../note-runtime-adapter";
import type { NoteEditorController } from "../use-note-editor-controller";
import type { NotePanel, NoteSheetViewMode, TextLineHeight, Tool } from "./ui-contracts";

export type NoteToolbarScope = {
  NOTE_ZOOM_PRESETS: number[];
  activeNote: NotePage;
  activeTool: Tool;
  canRedo: boolean;
  canUndo: boolean;
  chooseNoteTool: (tool: Tool) => void;
  editor: NoteEditorController;
  exportNotebook: () => void | Promise<unknown>;
  fitNoteToView: () => void;
  inkHistoryVersion: number;
  notePanel: NotePanel;
  noteSheetViewMode: NoteSheetViewMode;
  noteZoom: number;
  noteZoomPercent: number;
  redo: () => void;
  selectedExcerpt: NoteExcerpt | null;
  selectedExcerptIndex: number;
  selectedTextBoxAppearance: ExcerptAppearance | null;
  setActiveTool: Dispatch<SetStateAction<Tool>>;
  setNotePanel: Dispatch<SetStateAction<NotePanel>>;
  setNoteSheetViewMode: Dispatch<SetStateAction<NoteSheetViewMode>>;
  setNoteSidebarVisibility: (visible: boolean) => void;
  setNoteViewZoom: (zoom: number) => void;
  shiftExcerptLayer: (direction: "front" | "forward" | "backward" | "back") => void;
  showNoteSidebar: boolean;
  tools: { id: Tool; label: string; icon: LucideIcon }[];
  undo: () => void;
};

export function NoteToolbar({ scope }: { scope: NoteToolbarScope }) {
  const { NOTE_ZOOM_PRESETS, activeNote, activeTool, canRedo, canUndo, chooseNoteTool, editor, exportNotebook, fitNoteToView, inkHistoryVersion, notePanel, noteSheetViewMode, noteZoom, noteZoomPercent, redo, selectedExcerpt, selectedExcerptIndex, selectedTextBoxAppearance, setActiveTool, setNotePanel, setNoteSheetViewMode, setNoteSidebarVisibility, setNoteViewZoom, shiftExcerptLayer, showNoteSidebar, tools, undo } = scope;
  const { TEXT_FONTS, applyTextCommand, applyTextLineHeight, changeListLevel, openTextPopover, scrollTextToolbar, scrollTextToolbarWithWheel, selectedToolbarFont, tableBorder, textCharacterToolbarRef, textInsertPopover, textParagraphToolbarRef, textToolbar } = editor;
  return (<><div className={`note-toolbar two-row-toolbar ${notePanel === "text" ? "text-tools-open" : ""}`} role="toolbar" aria-label="Công cụ ghi chú">
            <div className="toolbar-row toolbar-row-primary">
              <div className="toolbar-cluster note-file-actions">
                <button className="note-create-button" onClick={() => { void exportNotebook(); }}><Download size={16} /><span>Xuất note</span></button>
              </div>
              <span className="toolbar-spacer" />
              <div className="note-sheet-view-control" role="group" aria-label="Cách xem các tờ trong Page">
                <button className={noteSheetViewMode === "single" ? "selected" : ""} onClick={() => setNoteSheetViewMode("single")} aria-pressed={noteSheetViewMode === "single"} title="Chỉ hiện tờ đang mở"><Square size={14} /><span>Từng trang</span></button>
                <button className={noteSheetViewMode === "continuous" ? "selected" : ""} onClick={() => setNoteSheetViewMode("continuous")} aria-pressed={noteSheetViewMode === "continuous"} title="Cuộn tất cả tờ trong Page"><Rows3 size={14} /><span>Liên tục</span></button>
              </div>
              <div className="note-view-control" aria-label="Tỷ lệ xem trang note">
                <button onClick={() => setNoteViewZoom(noteZoom - .1)} disabled={noteZoom <= .5} aria-label="Thu nhỏ trang note" title="Thu nhỏ trang note"><Minus size={14} /></button>
                <select value={noteZoomPercent} onChange={(event) => setNoteViewZoom(Number(event.target.value) / 100)} aria-label="Chọn tỷ lệ xem trang note" title="Tỷ lệ xem trang note">
                  {!NOTE_ZOOM_PRESETS.includes(noteZoomPercent) && <option value={noteZoomPercent}>{noteZoomPercent}%</option>}
                  {NOTE_ZOOM_PRESETS.map((percent) => <option key={percent} value={percent}>{percent}%</option>)}
                </select>
                <button onClick={() => setNoteViewZoom(noteZoom + .1)} disabled={noteZoom >= 2} aria-label="Phóng to trang note" title="Phóng to trang note"><Plus size={14} /></button>
                <button onClick={fitNoteToView} aria-label="Vừa chiều rộng khung note" title="Vừa chiều rộng khung note"><Maximize2 size={14} /></button>
              </div>
              <div className="toolbar-cluster history-cluster">
                <button className="icon-button compact" aria-label="Hoàn tác" onClick={undo} disabled={!canUndo} data-ink-history-version={inkHistoryVersion}><Undo2 size={19} /></button>
                <button className="icon-button compact" aria-label="Làm lại" onClick={redo} disabled={!canRedo} data-ink-history-version={inkHistoryVersion}><Redo2 size={19} /></button>
              </div>
              <button className={`paper-button ${notePanel === "paper" ? "active" : ""}`} onClick={() => setNotePanel((panel) => panel === "paper" ? null : "paper")} aria-expanded={notePanel === "paper"}><NotebookTabs size={17} /><span>Giấy</span><ChevronDown size={11} /></button>
              {!showNoteSidebar && <button className="note-sidebar-show-button" onClick={() => setNoteSidebarVisibility(true)} aria-label="Hiện thanh điều hướng Note" title="Hiện thanh điều hướng Note"><PanelRightOpen size={16} /><span>Điều hướng Note</span></button>}
            </div>
            <div className="toolbar-row toolbar-row-tools">
              <div className="toolbar-cluster note-tool-cluster">
                {tools.map(({ id, label, icon: Icon }) => {
                  const hasPanel = ["pen", "highlight", "shape", "text", "textbox", "callout"].includes(id);
                  const shortLabel = id === "text" ? "Type" : id === "textbox" ? "Text box" : id === "callout" ? "Callout" : label;
                  return <button key={id} className={`tool-button ${hasPanel ? "expandable" : ""} ${activeTool === id ? "active show-label" : ""}`} onClick={() => chooseNoteTool(id)} aria-label={label} title={label} aria-expanded={hasPanel ? ((id === "pen" || id === "highlight") ? notePanel === "ink" : (id === "text" || id === "textbox" || id === "callout") ? notePanel === "text" : notePanel === id) : undefined}><Icon size={20} />{activeTool === id && <span className="tool-label">{shortLabel}</span>}{hasPanel && <ChevronDown className="tool-chevron" size={11} />}</button>;
                })}
                <button className={`tool-button expandable sticker-primary-button ${textInsertPopover === "stickers" ? "active show-label" : ""}`} onClick={(event) => { setActiveTool("text"); setNotePanel("text"); openTextPopover("stickers", event.currentTarget); }} aria-label="Sticker note" title="Sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={20} />{textInsertPopover === "stickers" && <span className="tool-label">Sticker</span>}<ChevronDown className="tool-chevron" size={11} /></button>
              </div>
              <span className="toolbar-spacer" />
              <div className={`toolbar-cluster object-layer-cluster ${selectedExcerpt ? "has-selection" : ""}`} aria-label="Sắp xếp lớp đối tượng">
                <span className="layer-control-label" title={selectedExcerpt ? "Đối tượng đang chọn" : "Chọn một khung chữ hoặc ảnh để sắp xếp lớp"}><Layers2 size={16} /><span>Lớp</span></span>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === 0} onClick={() => shiftExcerptLayer("back")} aria-label="Đưa đối tượng xuống dưới cùng" title="Xuống dưới cùng"><SendToBack size={17} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === 0} onClick={() => shiftExcerptLayer("backward")} aria-label="Đưa đối tượng xuống một lớp" title="Đưa xuống một lớp"><ChevronDown size={18} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === activeNote.excerpts.length - 1} onClick={() => shiftExcerptLayer("forward")} aria-label="Đưa đối tượng lên một lớp" title="Đưa lên một lớp"><ChevronUp size={18} /></button>
                <button className="icon-button compact" disabled={!selectedExcerpt || selectedExcerptIndex === activeNote.excerpts.length - 1} onClick={() => shiftExcerptLayer("front")} aria-label="Đưa đối tượng lên trên cùng" title="Lên trên cùng"><BringToFront size={17} /></button>
              </div>
            </div>
            {notePanel === "text" && <>
              <div className="toolbar-scroll-shell">
                <button className="toolbar-scroll-button scroll-left" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textCharacterToolbarRef.current, -1)} aria-label="Cuộn công cụ sang trái"><ChevronLeft size={15} /></button>
                <div ref={textCharacterToolbarRef} className="toolbar-row text-command-row text-character-row" onWheel={scrollTextToolbarWithWheel} aria-label="Định dạng ký tự">
                  <span className="type-row-label">Type</span>
                  <select className="word-font-select" value={textToolbar.font} style={{ fontFamily: selectedToolbarFont.family }} onChange={(event) => applyTextCommand("font", event.target.value)} aria-label="Font chữ">{TEXT_FONTS.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.label}</option>)}</select>
                  <select className="word-size-select" value={textToolbar.size} onChange={(event) => applyTextCommand("size", Number(event.target.value))} aria-label="Cỡ chữ">{[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72].map((size) => <option key={size} value={size}>{size}</option>)}</select>
                  <div className="text-style-buttons compact-style-buttons" aria-label="Kiểu chữ">
                    <button className={textToolbar.bold ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("bold")} title="Đậm"><Bold size={16} /></button>
                    <button className={textToolbar.italic ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("italic")} title="Nghiêng"><Italic size={16} /></button>
                    <button className={textToolbar.underline ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("underline")} title="Gạch chân"><Underline size={16} /></button>
                    <button className={textToolbar.strike ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("strike")} title="Gạch ngang"><Strikethrough size={16} /></button>
                    <button className={textToolbar.subscript ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("subscript")} title="Chỉ số dưới"><Subscript size={16} /></button>
                    <button className={textToolbar.superscript ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("superscript")} title="Chỉ số trên"><Superscript size={16} /></button>
                  </div>
                  <span className="toolbar-mini-divider" />
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "textColor" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("textColor", event.currentTarget)} title="Màu chữ" aria-label="Mở bảng màu chữ" aria-expanded={textInsertPopover === "textColor"}><span className="color-letter" style={{ borderBottomColor: textToolbar.color === "auto" ? "#26343a" : textToolbar.color }}>A</span><ChevronDown size={10} /></button>
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "backgroundColor" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("backgroundColor", event.currentTarget)} title="Màu nền chữ" aria-label="Mở bảng màu nền chữ" aria-expanded={textInsertPopover === "backgroundColor"}><PaintBucket size={15} /><i className={`current-fill-sample ${textToolbar.backgroundColor === "transparent" ? "transparent" : ""}`} style={textToolbar.backgroundColor === "transparent" ? undefined : { background: textToolbar.backgroundColor }} /><ChevronDown size={10} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("clear")} title="Xóa định dạng"><RemoveFormatting size={16} /></button>
                </div>
                <button className="toolbar-scroll-button scroll-right" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textCharacterToolbarRef.current, 1)} aria-label="Cuộn công cụ sang phải"><ChevronRight size={15} /></button>
              </div>
              <div className="toolbar-scroll-shell">
                <button className="toolbar-scroll-button scroll-left" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textParagraphToolbarRef.current, -1)} aria-label="Cuộn công cụ sang trái"><ChevronLeft size={15} /></button>
                <div ref={textParagraphToolbarRef} className="toolbar-row text-command-row text-paragraph-row" onWheel={scrollTextToolbarWithWheel} aria-label="Định dạng đoạn, ký hiệu và bảng">
                  <div className="text-style-buttons compact-style-buttons" aria-label="Căn chữ"><button className={textToolbar.align === "left" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("left")} title="Căn trái"><AlignLeft size={16} /></button><button className={textToolbar.align === "center" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("center")} title="Căn giữa"><AlignCenter size={16} /></button><button className={textToolbar.align === "right" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("right")} title="Căn phải"><AlignRight size={16} /></button><button className={textToolbar.align === "justify" ? "selected" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextCommand("justify")} title="Căn đều hai bên"><AlignJustify size={16} /></button></div>
                  <label className="word-select-with-icon" title="Khoảng cách dòng"><Rows3 size={15} /><select value={textToolbar.lineHeight} onChange={(event) => applyTextLineHeight(event.target.value as TextLineHeight)} aria-label="Khoảng cách dòng"><option value="1">1,0</option><option value="1.15">1,15</option><option value="1.5">1,5</option><option value="1.8">1,8</option><option value="2">2,0</option></select></label>
                  <button className={`word-command-button list-menu-trigger ${textToolbar.unordered || textInsertPopover === "bullets" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("bullets", event.currentTarget)} title="Thư viện dấu đầu dòng" aria-label="Mở thư viện dấu đầu dòng" aria-expanded={textInsertPopover === "bullets"}><List size={16} /><ChevronDown size={10} /></button>
                  <button className={`word-command-button list-menu-trigger ${textToolbar.ordered || textInsertPopover === "numbering" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("numbering", event.currentTarget)} title="Thư viện đánh số" aria-label="Mở thư viện đánh số" aria-expanded={textInsertPopover === "numbering"}><ListOrdered size={16} /><ChevronDown size={10} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => changeListLevel("decrease")} title="Giảm một cấp danh sách" aria-label="Giảm một cấp danh sách"><IndentDecrease size={16} /></button>
                  <button className="word-command-button" onPointerDown={(event) => event.preventDefault()} onClick={() => changeListLevel("increase")} title="Tăng một cấp danh sách" aria-label="Tăng một cấp danh sách"><IndentIncrease size={16} /></button>
                  <span className="toolbar-mini-divider" />
                  <button className={`word-command-button labeled ${textInsertPopover === "symbols" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("symbols", event.currentTarget)} title="Chèn ký hiệu"><Omega size={16} /><span>Ký hiệu</span></button>
                  <button className={`word-command-button labeled sticker-menu-trigger ${textInsertPopover === "stickers" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("stickers", event.currentTarget)} title="Chèn sticker note" aria-label="Mở thư viện sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={16} /><span>Sticker</span></button>
                  <button className={`word-command-button labeled ${textInsertPopover === "equation" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("equation", event.currentTarget)} title="Chèn công thức"><Sigma size={16} /><span>Công thức</span></button>
                  <button className={`word-command-button labeled ${textInsertPopover === "table" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("table", event.currentTarget)} title="Chèn bảng"><Table2 size={16} /><span>Bảng</span></button>
                  <button className={`word-command-button line-menu-trigger ${textInsertPopover === "tableLines" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("tableLines", event.currentTarget)} title="Kiểu đường kẻ bảng" aria-label="Mở thư viện đường kẻ bảng" aria-expanded={textInsertPopover === "tableLines"}><Table2 size={14} /><i style={{ borderTopStyle: tableBorder.style, borderTopWidth: `${Math.max(1, Math.min(tableBorder.width, 4))}px`, borderTopColor: tableBorder.color }} /><ChevronDown size={10} /></button>
                  <button className={`word-command-button color-menu-trigger ${textInsertPopover === "textBoxStyle" ? "selected" : ""}`} disabled={!selectedTextBoxAppearance} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("textBoxStyle", event.currentTarget)} title={selectedTextBoxAppearance ? "Viền và nền hộp chữ" : "Chọn một hộp chữ để chỉnh viền và nền"} aria-label="Chỉnh viền và nền hộp chữ" aria-expanded={textInsertPopover === "textBoxStyle"}><ScanText size={15} /><i className={`current-fill-sample ${selectedTextBoxAppearance?.backgroundColor === "transparent" ? "transparent" : ""}`} style={!selectedTextBoxAppearance || selectedTextBoxAppearance.backgroundColor === "transparent" ? undefined : { background: selectedTextBoxAppearance.backgroundColor }} /><ChevronDown size={10} /></button>
                  <span className="selection-format-hint">Bôi chọn chữ để định dạng cục bộ</span>
                </div>
                <button className="toolbar-scroll-button scroll-right" onPointerDown={(event) => event.preventDefault()} onClick={() => scrollTextToolbar(textParagraphToolbarRef.current, 1)} aria-label="Cuộn công cụ sang phải"><ChevronRight size={15} /></button>
              </div>
            </>}
          </div></>);
}
