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
  const addRow = () => updateBlock(block.id, {
    rows: [...rows, Array.from({ length: columns }, () => "Nội dung")],
    rowsHtml: [...tableRowsHtml(block), Array.from({ length: columns }, () => plainTextToRichHtml("Nội dung"))],
  });
  const addColumn = () => updateBlock(block.id, {
    rows: rows.map((row, rowIndex) => [...row, rowIndex === 0 ? `Tiêu đề ${columns + 1}` : "Nội dung"]),
    rowsHtml: tableRowsHtml(block).map((row, rowIndex) => [...row, plainTextToRichHtml(rowIndex === 0 ? `Tiêu đề ${columns + 1}` : "Nội dung")]),
  });
  const removeRow = () => {
    if (rows.length > 1) updateBlock(block.id, { rows: rows.slice(0, -1), rowsHtml: tableRowsHtml(block).slice(0, -1) });
  };
  const removeColumn = () => {
    if (columns > 1) updateBlock(block.id, { rows: rows.map((row) => row.slice(0, -1)), rowsHtml: tableRowsHtml(block).map((row) => row.slice(0, -1)) });
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
          <button type="button" disabled={!canEdit} onClick={(event) => onBrowseImage(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget)}><ImageIcon size={14} /> Browse từ máy</button>
          <button type="button" disabled={!canEdit} onClick={(event) => onPdfCrop(block.id, event.currentTarget.closest<HTMLElement>(".fa-image-zone") ?? event.currentTarget)}><Crop size={14} /> Crop từ PDF</button>
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

  if (block.type === "figure-text") return <div className={`fa-figure-text ${block.imageSide === "right" ? "image-right" : ""}`}>
    <div className="fa-figure-block">{renderImageZone()}{renderRichField("caption", "captionHtml", "fa-caption-input", "Chú thích hình", { placeholder: "Chú thích hình…" })}</div>
    <div className="fa-figure-copy"><button type="button" className="fa-side-toggle" disabled={!canEdit} onClick={() => updateBlock(block.id, { imageSide: block.imageSide === "right" ? "left" : "right" })}>{block.imageSide === "right" ? "Đưa hình sang trái" : "Đưa hình sang phải"}</button>{renderRichField("text", "textHtml", "fa-content-input", "Nội dung cạnh hình", { placeholder: "Nhập nội dung liên quan…" })}</div>
  </div>;

  if (block.type === "table") {
    const rows = tableRows(block);
    const columns = Math.max(1, rows[0]?.length ?? 2);
    const rowsHtml = tableRowsHtml(block);
    return <div className="fa-table-block"><div className="fa-table-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) =>
      <BlockRichEditor
        key={`${rowIndex}-${columnIndex}`}
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
          updateBlock(block.id, { rows: nextRows, rowsHtml: nextRowsHtml });
        }}
        onActivate={onTextActivate}
        onNormalizeInput={onNormalizeTextInput}
      />))}</div></div>;
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
