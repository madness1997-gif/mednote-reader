import {
  Columns2,
  Crop,
  GitBranch,
  Heading2,
  Image as ImageIcon,
  LayoutList,
  Lightbulb,
  List,
  Minus,
  Plus,
  Rows3,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RichTextEditor } from "./rich-text-editor";
import { FirstAidHeadingInput } from "./first-aid-heading-input";
import {
  type BlockType,
  type FirstAidBlock,
  type TextStyle,
} from "./first-aid-block-domain";
import {
  plainTextToRichHtml,
  richBlockHtml,
  sanitizeBlockRichTextHtml,
} from "./first-aid-block-renderer";
import {
  normalizeFirstAidImageWidthRatio,
  resizeFirstAidImageWidthRatio,
} from "./first-aid-figure-layout";
import {
  DEFAULT_FIRST_AID_ROW_HEIGHT,
  appendEmptyTableColumn,
  appendEmptyTableRow,
  firstAidTableLayout,
  normalizeTableColumnWidths,
  resizeTableColumn,
  resizeTableRow,
} from "./first-aid-table-layout";

export type BlockOption = { type: BlockType; label: string; description: string; icon: LucideIcon };

export const FIRST_AID_BLOCK_OPTIONS: BlockOption[] = [
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
  editorId: string;
  className?: string;
  html?: string;
  text?: string;
  textStyle?: TextStyle;
  editable: boolean;
  singleLine?: boolean;
  placeholder?: string;
  ariaLabel: string;
  onChange: (html: string, text: string) => void;
  onActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeInput: (editorId: string, editor: HTMLElement) => void;
}) {
  return <RichTextEditor
    editorId={editorId}
    className={`fa-rich-editor ${className}`}
    html={richBlockHtml(html, text, textStyle)}
    editable={editable}
    singleLine={singleLine}
    placeholder={placeholder}
    ariaLabel={ariaLabel}
    onChange={(nextHtml, nextText) => onChange(sanitizeBlockRichTextHtml(nextHtml), nextText)}
    onActivate={onActivate}
    onNormalizeInput={onNormalizeInput}
  />;
}

export function FirstAidInsertMenu({ onInsert, onClose }: { onInsert: (type: BlockType) => void; onClose: () => void }) {
  return <div className="fa-block-menu" role="dialog" aria-label="Chọn loại block">
    <header><strong>Thêm block</strong><button type="button" onClick={onClose} aria-label="Đóng"><X size={15} /></button></header>
    <div className="fa-block-menu-grid">{FIRST_AID_BLOCK_OPTIONS.map(({ type, label, description, icon: Icon }) =>
      <button type="button" key={type} onClick={() => onInsert(type)}><Icon size={18} /><span><b>{label}</b><small>{description}</small></span></button>)}</div>
  </div>;
}

function tableRows(block: FirstAidBlock) {
  return block.rows?.length ? block.rows : [["", ""]];
}

function tableRowsHtml(block: FirstAidBlock) {
  return tableRows(block).map((row, rowIndex) => row.map((cell, columnIndex) => block.rowsHtml?.[rowIndex]?.[columnIndex] ?? plainTextToRichHtml(cell)));
}

export function FirstAidTableToolbar({ block, canEdit, updateBlock }: { block: FirstAidBlock; canEdit: boolean; updateBlock: (id: string, changes: Partial<FirstAidBlock>) => void }) {
  const rows = tableRows(block);
  const columns = Math.max(1, rows[0]?.length ?? 2);
  const layout = firstAidTableLayout(block, rows.length, columns);
  const addRow = () => updateBlock(block.id, {
    rows: appendEmptyTableRow(rows, columns, () => ""),
    rowsHtml: appendEmptyTableRow(tableRowsHtml(block), columns, () => ""),
    columnWidths: layout.columnWidths,
    rowHeights: [...layout.rowHeights, DEFAULT_FIRST_AID_ROW_HEIGHT],
  });
  const addColumn = () => updateBlock(block.id, {
    rows: appendEmptyTableColumn(rows, () => ""),
    rowsHtml: appendEmptyTableColumn(tableRowsHtml(block), () => ""),
    columnWidths: normalizeTableColumnWidths([...layout.columnWidths, 1 / columns], columns + 1),
    rowHeights: layout.rowHeights,
  });
  const removeRow = () => {
    if (rows.length > 1) updateBlock(block.id, { rows: rows.slice(0, -1), rowsHtml: tableRowsHtml(block).slice(0, -1), rowHeights: layout.rowHeights.slice(0, -1), columnWidths: layout.columnWidths });
  };
  const removeColumn = () => {
    if (columns > 1) updateBlock(block.id, { rows: rows.map((row) => row.slice(0, -1)), rowsHtml: tableRowsHtml(block).map((row) => row.slice(0, -1)), columnWidths: normalizeTableColumnWidths(layout.columnWidths.slice(0, -1), columns - 1), rowHeights: layout.rowHeights });
  };
  return <div className="fa-table-toolbar-group" role="group" aria-label="Chỉnh hàng và cột">
    <button type="button" className="fa-table-toolbar-action" disabled={!canEdit} onClick={addRow} aria-label="Thêm hàng" title="Thêm hàng"><Plus size={9} /><Rows3 size={13} /></button>
    <button type="button" className="fa-table-toolbar-action" disabled={!canEdit} onClick={addColumn} aria-label="Thêm cột" title="Thêm cột"><Plus size={9} /><Columns2 size={13} /></button>
    <button type="button" className="fa-table-toolbar-action" disabled={!canEdit || rows.length <= 1} onClick={removeRow} aria-label="Bớt hàng" title="Bớt hàng"><Minus size={9} /><Rows3 size={13} /></button>
    <button type="button" className="fa-table-toolbar-action" disabled={!canEdit || columns <= 1} onClick={removeColumn} aria-label="Bớt cột" title="Bớt cột"><Minus size={9} /><Columns2 size={13} /></button>
  </div>;
}

type FirstAidBlockBodyProps = {
  block: FirstAidBlock;
  canEdit: boolean;
  assetUrl?: string;
  pageObjectLayouts: Record<string, { height: number }>;
  pageHeightCss: number;
  pageObjectLayoutKey: string;
  updateBlock: (id: string, changes: Partial<FirstAidBlock>) => void;
  onBrowseImage: (blockId: string, element: HTMLElement) => void;
  onPdfCrop: (blockId: string, element: HTMLElement) => void;
  onDropImage: (blockId: string, file: File, element: HTMLElement) => void;
  onTextActivate: (editorId: string, editor: HTMLElement, range: Range | null) => void;
  onNormalizeTextInput: (editorId: string, editor: HTMLElement) => void;
};

export function FirstAidBlockBody({ block, canEdit, assetUrl, pageObjectLayouts, pageHeightCss, pageObjectLayoutKey, updateBlock, onBrowseImage, onPdfCrop, onDropImage, onTextActivate, onNormalizeTextInput }: FirstAidBlockBodyProps) {
  const [tableResizePreview, setTableResizePreview] = useState<{ columnWidths: number[]; rowHeights: number[] } | null>(null);
  const [figureWidthPreview, setFigureWidthPreview] = useState<number | null>(null);
  const tableResizeRef = useRef<{
    axis: "column" | "row";
    pointerId: number;
    index: number;
    start: number;
    gridSize: number;
    initial: { columnWidths: number[]; rowHeights: number[] };
    current: { columnWidths: number[]; rowHeights: number[] };
  } | null>(null);
  const tableResizeCleanupRef = useRef<(() => void) | null>(null);
  const figureResizeRef = useRef<{ pointerId: number; startX: number; containerWidth: number; initial: number; current: number } | null>(null);
  const figureResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    tableResizeCleanupRef.current?.();
    figureResizeCleanupRef.current?.();
  }, []);

  const commitFigureWidth = (ratio: number) => updateBlock(block.id, { imageWidthRatio: normalizeFirstAidImageWidthRatio(ratio) });

  const startFigureResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canEdit) return;
    const layout = event.currentTarget.closest<HTMLElement>(".fa-figure-text");
    if (!layout) return;
    event.preventDefault();
    event.stopPropagation();
    const initial = normalizeFirstAidImageWidthRatio(block.imageWidthRatio);
    figureResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      containerWidth: layout.getBoundingClientRect().width,
      initial,
      current: initial,
    };
    setFigureWidthPreview(initial);
    const finish = (commit: boolean) => {
      const state = figureResizeRef.current;
      figureResizeCleanupRef.current?.();
      figureResizeCleanupRef.current = null;
      figureResizeRef.current = null;
      setFigureWidthPreview(null);
      if (commit && state) commitFigureWidth(state.current);
    };
    const move = (moveEvent: PointerEvent) => {
      const state = figureResizeRef.current;
      if (!state || state.pointerId !== moveEvent.pointerId) return;
      moveEvent.preventDefault();
      state.current = resizeFirstAidImageWidthRatio(state.initial, moveEvent.clientX - state.startX, state.containerWidth, block.imageSide);
      setFigureWidthPreview(state.current);
    };
    const up = (upEvent: PointerEvent) => { if (upEvent.pointerId === event.pointerId) finish(true); };
    const cancel = (cancelEvent: PointerEvent) => { if (cancelEvent.pointerId === event.pointerId) finish(false); };
    figureResizeCleanupRef.current?.();
    figureResizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const startTableResize = (event: ReactPointerEvent<HTMLButtonElement>, axis: "column" | "row", index: number, layout: { columnWidths: number[]; rowHeights: number[] }) => {
    if (!canEdit) return;
    const grid = event.currentTarget.closest<HTMLElement>(".fa-table-grid");
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    const initial = { columnWidths: [...layout.columnWidths], rowHeights: [...layout.rowHeights] };
    tableResizeRef.current = {
      axis,
      pointerId: event.pointerId,
      index,
      start: axis === "column" ? event.clientX : event.clientY,
      gridSize: axis === "column" ? rect.width : rect.height,
      initial,
      current: initial,
    };
    setTableResizePreview(initial);
    const finish = (commit: boolean) => {
      const state = tableResizeRef.current;
      tableResizeCleanupRef.current?.();
      tableResizeCleanupRef.current = null;
      tableResizeRef.current = null;
      setTableResizePreview(null);
      if (commit && state) updateBlock(block.id, state.current);
    };
    const move = (moveEvent: PointerEvent) => {
      const state = tableResizeRef.current;
      if (!state || state.pointerId !== moveEvent.pointerId) return;
      moveEvent.preventDefault();
      const delta = (state.axis === "column" ? moveEvent.clientX : moveEvent.clientY) - state.start;
      state.current = state.axis === "column"
        ? { ...state.initial, columnWidths: resizeTableColumn(state.initial.columnWidths, state.index, delta, state.gridSize) }
        : { ...state.initial, rowHeights: resizeTableRow(state.initial.rowHeights, state.index, delta) };
      setTableResizePreview(state.current);
    };
    const up = (upEvent: PointerEvent) => { if (upEvent.pointerId === event.pointerId) finish(true); };
    const cancel = (cancelEvent: PointerEvent) => { if (cancelEvent.pointerId === event.pointerId) finish(false); };
    tableResizeCleanupRef.current?.();
    tableResizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const renderRichField = (field: "title" | "label" | "text" | "caption", htmlField: "titleHtml" | "labelHtml" | "textHtml" | "captionHtml", className: string, ariaLabel: string, options?: { singleLine?: boolean; placeholder?: string; textStyle?: TextStyle }) =>
    <BlockRichEditor
      editorId={`first-aid:${block.id}:${field}`}
      className={className}
      html={block[htmlField]}
      text={block[field]}
      textStyle={options?.textStyle}
      editable={canEdit}
      singleLine={options?.singleLine}
      placeholder={options?.placeholder}
      ariaLabel={ariaLabel}
      onChange={(fieldHtml, fieldText) => updateBlock(block.id, { [field]: fieldText, [htmlField]: fieldHtml } as Partial<FirstAidBlock>)}
      onActivate={onTextActivate}
      onNormalizeInput={onNormalizeTextInput}
    />;

  const renderImageZone = () => {
    if (block.imageObjectId) {
      const objectHeight = pageObjectLayouts[block.imageObjectId]?.height;
      const linkedHeight = objectHeight && pageHeightCss > 0 ? Math.max(28, Math.round(objectHeight * pageHeightCss)) : undefined;
      return <div className="fa-linked-image-space" data-layout-key={pageObjectLayoutKey} style={linkedHeight ? { height: `${linkedHeight}px` } : { aspectRatio: String(Math.max(.05, block.imageAspectRatio ?? 1.5)) }} aria-label="Ảnh là đối tượng có thể chọn và thao tác trên trang"><span>Ảnh đã là đối tượng trên trang</span></div>;
    }
    return <div className={`fa-image-zone ${assetUrl ? "has-image" : ""}`} onDragOver={(event) => { if (canEdit) event.preventDefault(); }} onDrop={(event) => {
      if (!canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
      if (file) onDropImage(block.id, file, event.currentTarget);
    }}>
      {assetUrl ? <img src={assetUrl} alt={block.imageName || "Hình trong note"} /> : <>
        <ImageIcon size={24} /><b>Thả hình vào đây</b>
        <div className="fa-image-actions">
          <button
            type="button"
            disabled={!canEdit}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onBrowseImage(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget);
            }}
          ><ImageIcon size={14} /> Browse từ máy</button>
          <button
            type="button"
            disabled={!canEdit}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPdfCrop(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget);
            }}
          ><Crop size={14} /> Crop từ PDF</button>
        </div>
        <small>Ảnh sẽ thành đối tượng kéo, resize, xoay và xếp lớp được</small>
      </>}
    </div>;
  };

  if (block.type === "heading") return <FirstAidHeadingInput block={block} canEdit={canEdit} updateBlock={updateBlock} />;

  if (block.type === "label") return <div className="fa-label-layout">
    {renderRichField("label", "labelHtml", "fa-label-input", "Nhãn block", { placeholder: "NHÃN" })}
    {renderRichField("text", "textHtml", "fa-content-input", "Nội dung block", { placeholder: "Nhập nội dung…" })}
  </div>;

  if (block.type === "text") return <div className="fa-text-block">
    <div className="fa-text-style-switch">{(["paragraph", "bullets", "numbered"] as TextStyle[]).map((style) =>
      <button type="button" key={style} className={block.textStyle === style ? "selected" : ""} disabled={!canEdit} onClick={() => updateBlock(block.id, { textStyle: style, textHtml: richBlockHtml(undefined, block.text, style) })}>{style === "paragraph" ? "Đoạn" : style === "bullets" ? "• Danh sách" : "1. Đánh số"}</button>)}</div>
    {renderRichField("text", "textHtml", "fa-content-input", "Đoạn hoặc danh sách", { placeholder: "Nhập đoạn văn hoặc dùng Bullet / Đánh số trên thanh Type…", textStyle: block.textStyle })}
  </div>;

  if (block.type === "figure") return <div className="fa-figure-block">{renderImageZone()}{renderRichField("caption", "captionHtml", "fa-caption-input", "Chú thích hình", { placeholder: "Nhập chú thích hình…" })}</div>;

  if (block.type === "figure-text") {
    const imageWidth = figureWidthPreview ?? normalizeFirstAidImageWidthRatio(block.imageWidthRatio);
    return <div className={`fa-figure-text ${block.imageSide === "right" ? "image-right" : ""}`} style={{ gridTemplateColumns: block.imageSide === "right" ? `minmax(0, 1fr) 5px ${imageWidth * 100}%` : `${imageWidth * 100}% 5px minmax(0, 1fr)` }}>
    <div className="fa-figure-block">{renderImageZone()}{renderRichField("caption", "captionHtml", "fa-caption-input", "Chú thích hình", { placeholder: "Chú thích hình…" })}</div>
    <button
      type="button"
      className="fa-figure-resizer"
      disabled={!canEdit}
      onPointerDown={startFigureResize}
      onKeyDown={(event) => {
        if (!canEdit || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        const visualDirection = event.key === "ArrowRight" ? 1 : -1;
        commitFigureWidth(imageWidth + visualDirection * (block.imageSide === "right" ? -.02 : .02));
      }}
      aria-label={`Đổi độ rộng vùng hình, hiện ${Math.round(imageWidth * 100)}%`}
      title="Kéo để đổi độ rộng vùng hình"
    ><span /></button>
    <div className="fa-figure-copy"><button type="button" className="fa-side-toggle" disabled={!canEdit} onClick={() => updateBlock(block.id, { imageSide: block.imageSide === "right" ? "left" : "right" })}>{block.imageSide === "right" ? "Đưa hình sang trái" : "Đưa hình sang phải"}</button>{renderRichField("text", "textHtml", "fa-content-input", "Nội dung cạnh hình", { placeholder: "Nhập nội dung liên quan…" })}</div>
  </div>;
  }

  if (block.type === "table") {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    const rowsHtml = tableRowsHtml(block);
    const savedLayout = firstAidTableLayout(block, rows.length, columns);
    const layout = tableResizePreview && tableResizePreview.columnWidths.length === columns && tableResizePreview.rowHeights.length === rows.length ? tableResizePreview : savedLayout;
    return <div className="fa-table-block"><div className="fa-table-grid" style={{
      gridTemplateColumns: layout.columnWidths.map((width) => `minmax(0, ${width}fr)`).join(" "),
      gridTemplateRows: layout.rowHeights.map((height) => `minmax(${height}px, auto)`).join(" "),
    }}>{rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) =>
      <div className="fa-table-cell-wrap" key={`${rowIndex}-${columnIndex}`}>
        <BlockRichEditor
          editorId={`first-aid:${block.id}:cell:${rowIndex}:${columnIndex}`}
          className={rowIndex === 0 ? "fa-table-head" : "fa-table-cell"}
          html={block.rowsHtml?.[rowIndex]?.[columnIndex]}
          text={cell}
          editable={canEdit}
          ariaLabel={`Ô ${rowIndex + 1}, ${columnIndex + 1}`}
          onChange={(cellHtml, value) => {
            const nextRows = rows.map((tableRow) => [...tableRow]);
            const nextRowsHtml = rowsHtml.map((tableRow) => [...tableRow]);
            nextRows[rowIndex][columnIndex] = value;
            nextRowsHtml[rowIndex][columnIndex] = cellHtml;
            updateBlock(block.id, { rows: nextRows, rowsHtml: nextRowsHtml, ...savedLayout });
          }}
          onActivate={onTextActivate}
          onNormalizeInput={onNormalizeTextInput}
        />
        {columnIndex < columns - 1 && <button
          type="button"
          className="fa-table-resizer fa-table-column-resizer"
          onPointerDown={(event) => startTableResize(event, "column", columnIndex, layout)}
          tabIndex={-1}
          aria-hidden={rowIndex === 0 ? undefined : true}
          aria-label={rowIndex === 0 ? `Đổi độ rộng cột ${columnIndex + 1}` : undefined}
          title="Kéo để đổi độ rộng cột"
        />}
        <button
          type="button"
          className="fa-table-resizer fa-table-row-resizer"
          onPointerDown={(event) => startTableResize(event, "row", rowIndex, layout)}
          tabIndex={-1}
          aria-hidden={columnIndex === 0 ? undefined : true}
          aria-label={columnIndex === 0 ? `Đổi chiều cao hàng ${rowIndex + 1}` : undefined}
          title="Kéo để đổi chiều cao hàng"
        />
      </div>))}
    </div></div>;
  }

  if (block.type === "flow") {
    const steps = block.steps ?? [""];
    return <div className="fa-flow-layout">
      {renderRichField("label", "labelHtml", "fa-flow-label", "Nhãn diễn tiến", { placeholder: "CƠ CHẾ" })}
      <div className="fa-flow-block">{steps.map((step, index) => <div className="fa-flow-item" key={`${block.id}-${index}`}>
        <BlockRichEditor
          editorId={`first-aid:${block.id}:step:${index}`}
          html={block.stepsHtml?.[index]}
          text={step}
          editable={canEdit}
          ariaLabel={`Bước ${index + 1}`}
          onChange={(stepHtml, value) => updateBlock(block.id, {
            steps: steps.map((item, itemIndex) => itemIndex === index ? value : item),
            stepsHtml: steps.map((item, itemIndex) => itemIndex === index ? stepHtml : block.stepsHtml?.[itemIndex] ?? plainTextToRichHtml(item)),
          })}
          onActivate={onTextActivate}
          onNormalizeInput={onNormalizeTextInput}
        />
        {canEdit && steps.length > 1 && <button type="button" onClick={() => updateBlock(block.id, { steps: steps.filter((_, itemIndex) => itemIndex !== index), stepsHtml: block.stepsHtml?.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Xóa bước ${index + 1}`}><X size={13} /></button>}
        {index < steps.length - 1 && <span>↓</span>}
      </div>)}
      <button type="button" className="fa-add-step" disabled={!canEdit} onClick={() => updateBlock(block.id, { steps: [...steps, ""], stepsHtml: [...(block.stepsHtml ?? steps.map((step) => plainTextToRichHtml(step))), ""] })}><Plus size={14} /> Thêm bước</button></div>
    </div>;
  }

  return <div className="fa-pearl-layout">
    {renderRichField("label", "labelHtml", "fa-pearl-label", "Nhãn pearl", { placeholder: "HIGH-YIELD" })}
    {renderRichField("text", "textHtml", "fa-pearl-text", "Nội dung pearl", { placeholder: "Điểm dễ nhầm hoặc mẹo nhớ…" })}
  </div>;
}
