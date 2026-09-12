import { useEffect, useRef, useState } from 'react';
import { COVER_COLORS, COVER_ICONS, COVER_PATTERNS, COVER_TEMPLATES, defaultNotebookCover, normalizeNotebookCover, type NotebookCover as Cover } from '../notebook-cover';
import { prepareNotebookCoverImage } from '../notebook-cover-image';
import { NotebookCover } from './notebook-cover';
export function NotebookCoverEditor({ notebook, onSave, onClose }: { notebook: { id: string; title: string; cover?: Cover }; onSave: (id: string, cover: Cover) => Promise<unknown>; onClose: () => void }) {
  const [draft, setDraft] = useState(() => normalizeNotebookCover(notebook.cover, notebook.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const operation = useRef(false);
  useEffect(() => { const node = dialog.current!; node.showModal(); return () => node.close(); }, []);
  const change = <K extends keyof Cover>(key: K, value: Cover[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể lưu bìa.'); }
    finally { operation.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="cover-editor" aria-labelledby="cover-editor-title" onCancel={(event) => { event.preventDefault(); if (!operation.current) onClose(); }} onPointerDown={(event) => event.stopPropagation()}>
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await onSave(notebook.id, draft); onClose(); }); }}>
      <header><h2 id="cover-editor-title">Đổi bìa notebook</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Đóng">×</button></header>
      <div className="cover-editor-layout"><div className="cover-preview"><NotebookCover id={notebook.id} title={notebook.title} cover={draft} /></div>
        <fieldset disabled={busy} className="cover-fields">{[
          { title: 'Họa tiết minh họa', entries: Object.entries(COVER_PATTERNS) },
          { title: 'Bìa cơ bản', entries: Object.entries(COVER_TEMPLATES).filter(([id]) => !Object.hasOwn(COVER_PATTERNS, id)) },
        ].map((group) => <div className="cover-template-group" key={group.title}><h3>{group.title}</h3><div className="cover-template-picker" role="group" aria-label={group.title}>{group.entries.map(([id, name]) => <button type="button" key={id} aria-label={name} aria-pressed={draft.template === id} onClick={() => change('template', id as Cover['template'])}><NotebookCover id={notebook.id} title={notebook.title} cover={{ ...draft, template: id as Cover['template'] }} small /><span>{name}</span></button>)}</div></div>)}
          <label>{Object.hasOwn(COVER_PATTERNS, draft.template) ? "Màu viền nhãn" : "Màu bìa"}</label>
          <div className="cover-swatches" role="group" aria-label="Màu bìa">{COVER_COLORS.map((color, i) => <button type="button" key={color} style={{ background: color }} aria-label={`Màu bìa ${i + 1}`} aria-pressed={draft.color === color} onClick={() => change('color', color)} />)}</div>
          <label>Tiêu đề<textarea rows={2} maxLength={120} placeholder={notebook.title} value={draft.title} onChange={(e) => change('title', e.target.value)} /><small>Để trống để dùng tên notebook.</small></label>
          <label>Phụ đề<input maxLength={160} value={draft.subtitle} onChange={(e) => change('subtitle', e.target.value)} /></label>
          <label>Biểu tượng<select value={draft.icon} onChange={(e) => change('icon', e.target.value as Cover['icon'])}>{Object.entries(COVER_ICONS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Kiểu chữ<select value={draft.font} onChange={(e) => change('font', e.target.value as Cover['font'])}><option value="sans">Hiện đại</option><option value="serif">Cổ điển</option></select></label>
          {draft.template === 'photo' && <><label>Ảnh bìa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => { const images = await prepareNotebookCoverImage(file); setDraft((current) => ({ ...current, ...images, positionX: 50, positionY: 50 })); }); }} /></label>{draft.image && <><label>Vị trí ngang<input type="range" min="0" max="100" value={draft.positionX} onChange={(e) => change('positionX', +e.target.value)} /></label><label>Vị trí dọc<input type="range" min="0" max="100" value={draft.positionY} onChange={(e) => change('positionY', +e.target.value)} /></label><button type="button" onClick={() => setDraft(({ image, thumbnail, ...rest }) => rest)}>Xóa ảnh</button></>}</>}
        </fieldset></div>
      {error && <p role="alert" className="cover-error">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => setDraft(defaultNotebookCover(notebook.id))}>Mặc định</button><span /><button type="button" disabled={busy} onClick={onClose}>Hủy</button><button type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Lưu bìa'}</button></footer>
    </form>
  </dialog>;
}
