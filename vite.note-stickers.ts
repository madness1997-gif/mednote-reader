import type { Plugin } from "vite";

function replaceRequired(source: string, anchor: string, replacement: string, label: string) {
  if (!source.includes(anchor)) throw new Error(`Không tìm thấy vị trí ${label} để gắn thư viện sticker note.`);
  return source.replace(anchor, replacement);
}

const POPOVER_TYPE_ANCHOR = 'type TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | null;';
const POPOVER_TYPE_REPLACEMENT = 'type StickerPresetId = "classic-yellow" | "tape-pink" | "pin-mint" | "tab-blue" | "clinical-card" | "high-yield";\ntype TextInsertPopover = "symbols" | "equation" | "table" | "bullets" | "numbering" | "textColor" | "backgroundColor" | "tableLines" | "textBoxStyle" | "stickers" | null;';

const EXCERPT_FIELD_ANCHOR = '  appearance?: Partial<ExcerptAppearance>;\n};';
const EXCERPT_FIELD_REPLACEMENT = '  appearance?: Partial<ExcerptAppearance>;\n  stickerStyle?: StickerPresetId;\n};';

const PRESET_ANCHOR = 'const DEFAULT_CALLOUT_APPEARANCE: ExcerptAppearance = { borderStyle: "solid", borderWidth: 2, borderColor: "#1b7184", backgroundColor: "transparent" };';
const PRESET_REPLACEMENT = `${PRESET_ANCHOR}\nconst STICKER_PRESETS: { id: StickerPresetId; label: string; description: string; width: number; height: number; rotation: number }[] = [\n  { id: "classic-yellow", label: "Sticky vàng", description: "Giấy note cổ điển, góc gấp", width: .30, height: .17, rotation: -1 },\n  { id: "tape-pink", label: "Tape hồng", description: "Note pastel có băng dính phía trên", width: .31, height: .17, rotation: 1 },\n  { id: "pin-mint", label: "Ghim xanh", description: "Thẻ xanh bạc hà có ghim tròn", width: .29, height: .16, rotation: -.5 },\n  { id: "tab-blue", label: "Tab xanh", description: "Thẻ xanh có nhãn tab nổi", width: .31, height: .16, rotation: 0 },\n  { id: "clinical-card", label: "Clinical card", description: "Thẻ trắng viền teal cho ý chính", width: .33, height: .17, rotation: 0 },\n  { id: "high-yield", label: "High-yield", description: "Sticker vàng nhấn mạnh điểm cần nhớ", width: .32, height: .16, rotation: 0 },\n];`;

const ADD_STICKER_ANCHOR = '  const addCalloutAt = (event: React.PointerEvent<HTMLElement>) => {';
const ADD_STICKER_REPLACEMENT = `  const addSticker = (presetId: StickerPresetId) => {\n    const preset = STICKER_PRESETS.find((item) => item.id === presetId);\n    if (!preset) return;\n    const slot = activeNote.excerpts.length % 6;\n    const x = Math.min(1 - preset.width - .03, .13 + (slot % 3) * .045);\n    const y = Math.min(1 - preset.height - .04, .16 + (slot % 4) * .055);\n    const excerpt: NoteExcerpt = {\n      id: uid("sticker"),\n      kind: "text",\n      sourceKind: "manual",\n      text: "",\n      richText: "",\n      stickerStyle: preset.id,\n      createdAt: Date.now(),\n      layout: { x, y, width: preset.width, height: preset.height, contentScale: 1, rotation: preset.rotation, opacity: 1, autoFit: false },\n      appearance: { borderStyle: "solid", borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent" },\n    };\n    updateActiveNote({ excerpts: [...activeNote.excerpts, excerpt] });\n    setSelectedExcerptId(excerpt.id);\n    setActiveTool("text");\n    setNotePanel("text");\n    setTextInsertPopover(null);\n    setToast(\`Đã chèn \${preset.label} — nhập chữ trực tiếp, dùng Chọn để kéo và đổi kích thước\`);\n  };\n\n${ADD_STICKER_ANCHOR}`;

const EXCERPT_CLASS_ANCHOR = 'className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}';
const EXCERPT_CLASS_REPLACEMENT = 'className={`note-excerpt excerpt-${excerpt.kind} ${isCallout ? "excerpt-callout" : ""} ${excerpt.stickerStyle ? `excerpt-sticker sticker-${excerpt.stickerStyle}` : ""} ${excerpt.sourceKind === "manual" ? "excerpt-manual" : "excerpt-pdf"} ${excerpt.kind === "image" ? "excerpt-frameless" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""} ${selected ? "selected" : ""}`}';

const PLACEHOLDER_ANCHOR = 'placeholder={isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}';
const PLACEHOLDER_REPLACEMENT = 'placeholder={excerpt.stickerStyle ? "Nhập ghi chú…" : isCallout ? "Nhập chú thích…" : excerpt.sourceKind === "manual" ? "Nhập nội dung…" : undefined}';

const INDICATOR_ANCHOR = '{editable ? "Đang sửa" : isCallout ? "Callout" : "Chữ"}';
const INDICATOR_REPLACEMENT = '{editable ? "Đang sửa" : isCallout ? "Callout" : excerpt.stickerStyle ? "Sticker" : "Chữ"}';

const PRIMARY_TOOL_ANCHOR = [
  '                {tools.map(({ id, label, icon: Icon }) => {',
  '                  const hasPanel = ["pen", "highlight", "shape", "text", "textbox", "callout"].includes(id);',
  '                  const shortLabel = id === "text" ? "Type" : id === "textbox" ? "Text box" : id === "callout" ? "Callout" : label;',
  '                  return <button key={id} className={`tool-button ${hasPanel ? "expandable" : ""} ${activeTool === id ? "active show-label" : ""}`} onClick={() => chooseNoteTool(id)} aria-label={label} title={label} aria-expanded={hasPanel ? ((id === "pen" || id === "highlight") ? notePanel === "ink" : (id === "text" || id === "textbox" || id === "callout") ? notePanel === "text" : notePanel === id) : undefined}><Icon size={20} />{activeTool === id && <span className="tool-label">{shortLabel}</span>}{hasPanel && <ChevronDown className="tool-chevron" size={11} />}</button>;',
  '                })}',
].join('\n');
const PRIMARY_TOOL_REPLACEMENT = `${PRIMARY_TOOL_ANCHOR}\n                <button className={\`tool-button expandable sticker-primary-button \${textInsertPopover === "stickers" ? "active show-label" : ""}\`} onClick={(event) => { setActiveTool("text"); setNotePanel("text"); openTextPopover("stickers", event.currentTarget); }} aria-label="Sticker note" title="Sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={20} />{textInsertPopover === "stickers" && <span className="tool-label">Sticker</span>}<ChevronDown className="tool-chevron" size={11} /></button>`;

const SYMBOL_BUTTON_ANCHOR = '<button className={`word-command-button labeled ${textInsertPopover === "symbols" ? "selected" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("symbols", event.currentTarget)} title="Chèn ký hiệu"><Omega size={16} /><span>Ký hiệu</span></button>';
const SYMBOL_BUTTON_REPLACEMENT = `${SYMBOL_BUTTON_ANCHOR}\n                  <button className={\`word-command-button labeled sticker-menu-trigger \${textInsertPopover === "stickers" ? "selected" : ""}\`} onPointerDown={(event) => event.preventDefault()} onClick={(event) => openTextPopover("stickers", event.currentTarget)} title="Chèn sticker note" aria-label="Mở thư viện sticker note" aria-expanded={textInsertPopover === "stickers"}><MessageSquareText size={16} /><span>Sticker</span></button>`;

const SYMBOL_POPOVER_ANCHOR = '{notePanel === "text" && textInsertPopover === "symbols" && <div className="text-insert-popover symbol-popover" style={{ "--popover-left": `${textPopoverLeft}px` } as React.CSSProperties} role="dialog" aria-label="Chèn ký hiệu"><header><strong>Ký hiệu</strong><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>{SYMBOL_GROUPS.map((group) => <section key={group.label}><label>{group.label}</label><div>{group.symbols.map((symbol) => <button key={symbol} onPointerDown={(event) => event.preventDefault()} onClick={() => insertTextAtSelection(symbol)}>{symbol}</button>)}</div></section>)}</div>}';
const STICKER_POPOVER = `{notePanel === "text" && textInsertPopover === "stickers" && (\n            <div className="text-insert-popover note-sticker-popover" style={{ "--popover-left": \`\${textPopoverLeft}px\` } as React.CSSProperties} role="dialog" aria-label="Thư viện sticker note">\n              <header><div><strong>Sticker note</strong><small>Mỗi mẫu là một textbox có thể kéo và đổi kích thước</small></div><button className="icon-button compact" onClick={() => setTextInsertPopover(null)} aria-label="Đóng"><X size={15} /></button></header>\n              <div className="note-sticker-grid">\n                {STICKER_PRESETS.map((preset) => <button key={preset.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => addSticker(preset.id)} title={preset.description}><span className={\`note-sticker-preview sticker-\${preset.id}\`}><i>Ghi chú…</i></span><b>{preset.label}</b><small>{preset.description}</small></button>)}\n              </div>\n              <footer>Chèn xong có thể gõ ngay · chuyển sang Chọn để kéo, co giãn và sắp xếp lớp</footer>\n            </div>\n          )}\n\n          ${SYMBOL_POPOVER_ANCHOR}`;

export function noteStickersPlugin(): Plugin {
  return {
    name: "mednote-note-stickers",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];
      if (!normalizedId.endsWith("/app/page.tsx")) return null;

      let next = code;
      next = replaceRequired(next, POPOVER_TYPE_ANCHOR, POPOVER_TYPE_REPLACEMENT, "kiểu popover Type");
      next = replaceRequired(next, EXCERPT_FIELD_ANCHOR, EXCERPT_FIELD_REPLACEMENT, "dữ liệu textbox");
      next = replaceRequired(next, PRESET_ANCHOR, PRESET_REPLACEMENT, "preset textbox");
      next = replaceRequired(next, ADD_STICKER_ANCHOR, ADD_STICKER_REPLACEMENT, "hàm chèn sticker");
      next = replaceRequired(next, EXCERPT_CLASS_ANCHOR, EXCERPT_CLASS_REPLACEMENT, "class đối tượng note");
      next = replaceRequired(next, PLACEHOLDER_ANCHOR, PLACEHOLDER_REPLACEMENT, "placeholder textbox");
      next = replaceRequired(next, INDICATOR_ANCHOR, INDICATOR_REPLACEMENT, "nhãn điều khiển textbox");
      next = replaceRequired(next, PRIMARY_TOOL_ANCHOR, PRIMARY_TOOL_REPLACEMENT, "thanh công cụ note chính");
      next = replaceRequired(next, SYMBOL_BUTTON_ANCHOR, SYMBOL_BUTTON_REPLACEMENT, "nút Ký hiệu");
      next = replaceRequired(next, SYMBOL_POPOVER_ANCHOR, STICKER_POPOVER, "popover Ký hiệu");
      return { code: next, map: null };
    },
  };
}
