import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeNoteLinkSearch, type NoteSheetLinkTarget } from "../note-sheet-link";
import "./note-sheet-link.css";

type Props = {
  targets: NoteSheetLinkTarget[];
  initialSheetId: string;
  initialLabel: string;
  editing: boolean;
  onSave: (sheetId: string, label: string) => boolean;
  onCancel: () => void;
  onRemove: () => boolean;
};

export function NoteSheetLinkDialog({ targets, initialSheetId, initialLabel, editing, onSave, onCancel, onRemove }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [sheetId, setSheetId] = useState(initialSheetId);
  const [label, setLabel] = useState(initialLabel);
  const selected = targets.find((target) => target.sheetId === sheetId);
  const matches = useMemo(() => {
    const terms = normalizeNoteLinkSearch(query).split(/\s+/).filter(Boolean);
    return targets.filter((target) => {
      const text = normalizeNoteLinkSearch(target.path);
      return terms.every((term) => text.includes(term));
    });
  }, [query, targets]);
  const visible = matches.slice(0, 100);
  // Keep the chosen destination visible when refining a search.
  if (selected && !visible.some((target) => target.sheetId === selected.sheetId)) visible.unshift(selected);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} className="note-sheet-link-dialog" aria-labelledby="note-sheet-link-title" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }} onKeyDown={(event) => event.stopPropagation()}>
    <form onSubmit={(event) => { event.preventDefault(); dialog.current!.close(); if (!onSave(sheetId, label)) dialog.current!.showModal(); }}>
      <header><h2 id="note-sheet-link-title">{editing ? "Sửa liên kết đến sheet" : "Liên kết đến sheet"}</h2><button type="button" className="icon-button compact" aria-label="Đóng hộp liên kết" onClick={onCancel}>×</button></header>
      <label>Tìm note hoặc sheet<input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên Notebook, Section, Page hoặc số tờ…" /></label>
      <label>Sheet đích<select size={7} value={sheetId} onChange={(event) => setSheetId(event.target.value)}>
        <option value="" disabled>Chọn sheet đích…</option>
        {visible.map((target) => <option key={target.sheetId} value={target.sheetId}>{target.path}</option>)}
      </select></label>
      <p className="note-link-result-count" role="status">{matches.length === 0 ? "Không tìm thấy sheet phù hợp." : matches.length > 100 ? `${matches.length} kết quả; hiển thị 100. Nhập cụ thể hơn để thu hẹp.` : `${matches.length} sheet`}</p>
      {initialSheetId && !targets.some((target) => target.sheetId === initialSheetId) && <p role="alert">Sheet cũ không còn tồn tại. Hãy chọn sheet khác hoặc gỡ liên kết.</p>}
      <label>Chữ hiển thị<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={selected?.label ?? "Tự dùng tên Page và số tờ"} /></label>
      {selected && <p className="note-link-destination">Đích: {selected.path}</p>}
      <p className="note-link-hint">Khi đang sửa chữ, Ctrl+bấm (⌘+bấm trên Mac) để mở sheet.</p>
      <footer>{editing && <button type="button" onClick={() => { dialog.current!.close(); if (!onRemove()) dialog.current!.showModal(); }}>Gỡ liên kết</button>}<span /><button type="button" onClick={onCancel}>Hủy</button><button type="submit" className="primary" disabled={!selected}>{editing ? "Lưu liên kết" : "Chèn liên kết"}</button></footer>
    </form>
  </dialog>;
}
