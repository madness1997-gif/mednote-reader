import { Activity, BookOpen, Brain, Heart, Microscope } from 'lucide-react';
import { COVER_ART } from './notebook-cover-art';
import type { CSSProperties } from 'react';
import { normalizeNotebookCover, type NotebookCover as Cover } from '../notebook-cover';
import '../notebook-cover.css';
const icons = { book: BookOpen, heart: Heart, activity: Activity, brain: Brain, microscope: Microscope, none: null };
export function NotebookCover({ id, title, cover, small = false }: { id: string; title: string; cover?: Cover; small?: boolean }) {
  const c = normalizeNotebookCover(cover, id);
  const Icon = icons[c.icon];
  const art = COVER_ART[c.template];
  const rgb = [1, 3, 5].map((start) => parseInt(c.color.slice(start, start + 2), 16));
  const light = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 165;
  return <span aria-hidden="true" className={`notebook-cover cover-${c.template} ${small ? 'cover-small' : ''} ${art ? 'cover-pattern' : ''}`} style={{ '--cover-color': c.color, '--cover-accent': light ? '#8d592d' : '#e7c78e', '--cover-ink': c.template === 'photo' && c.image ? '#fff' : light ? '#203344' : '#fff', fontFamily: c.font === 'serif' ? 'Georgia, serif' : 'inherit' } as CSSProperties}>
    {art && <img src={small ? art.thumbnail : art.full} alt="" loading="lazy" decoding="async" />}
    {c.template === 'photo' && c.image && <img src={small ? c.thumbnail || c.image : c.image} alt="" loading="lazy" decoding="async" style={{ objectPosition: `${c.positionX}% ${c.positionY}%` }} />}
    <span className="cover-ornament" /><span className="cover-content">{Icon && <Icon className="cover-symbol" size={28} />}<strong>{c.title.trim() || title}</strong>{c.subtitle && <span className="cover-subtitle">{c.subtitle}</span>}</span>
  </span>;
}
