import { ArrowRight, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Notebook } from '../note-domain';
import type { NotebookCover as Cover } from '../notebook-cover';
import { NotebookCover } from './notebook-cover';
import { NotebookCoverEditor } from './notebook-cover-editor';

export function NotebookCoverPage({ notebook, busy, onContinue, onSave }: {
  notebook: Notebook;
  busy: boolean;
  onContinue: () => void;
  onSave: (id: string, cover: Cover) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { continueButton.current?.focus({ preventScroll: true }); }, [notebook.id]);

  return <div className="notebook-opening" aria-label={`Trang bìa ${notebook.title}`}>
    <div className="notebook-opening-inner">
      <button ref={continueButton} type="button" className="notebook-opening-book" disabled={busy} onClick={onContinue} aria-label={`Mở nội dung ${notebook.title}`}>
        <NotebookCover id={notebook.id} title={notebook.title} cover={notebook.cover} />
      </button>
      <div className="notebook-opening-actions">
        <h2>{notebook.title}</h2>
        <button type="button" className="notebook-enter" disabled={busy} onClick={onContinue}>Vào nội dung <ArrowRight size={18} /></button>
        <button type="button" className="notebook-customize" disabled={busy} onClick={() => setEditing(true)}><Palette size={16} /> Đổi bìa</button>
      </div>
    </div>
    {editing && <NotebookCoverEditor key={notebook.id} notebook={notebook} onSave={onSave} onClose={() => setEditing(false)} />}
  </div>;
}
