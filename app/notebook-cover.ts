/** Portable, bounded notebook metadata; omitted covers require no migration. */
export const COVER_TEMPLATES = { minimal: 'Tối giản', classic: 'Cổ điển', academic: 'Học thuật', frame: 'Khung nhãn', band: 'Dải màu', photo: 'Ảnh riêng' } as const;
export const COVER_COLORS = ['#18334d', '#245847', '#702c43', '#eee3cb', '#315b85', '#594877', '#aa542f', '#343b43'] as const;
export const COVER_ICONS = { book: 'Sách', heart: 'Tim', activity: 'Nhịp tim', brain: 'Não', microscope: 'Kính hiển vi', none: 'Không có' } as const;
export type NotebookCover = {
  template: keyof typeof COVER_TEMPLATES;
  color: string;
  title: string;
  subtitle: string;
  icon: keyof typeof COVER_ICONS;
  font: 'sans' | 'serif';
  image?: string;
  thumbnail?: string;
  positionX: number;
  positionY: number;
};
export function defaultNotebookCover(id: string): NotebookCover {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { template: 'academic', color: COVER_COLORS[hash % COVER_COLORS.length], title: '', subtitle: '', icon: 'book', font: 'sans', positionX: 50, positionY: 50 };
}
export function normalizeNotebookCover(value: unknown, id: string): NotebookCover {
  const base = defaultNotebookCover(id);
  if (!value || typeof value !== 'object') return base;
  const v = value as Record<string, unknown>;
  const image = (key: string, limit: number) => typeof v[key] === 'string' && v[key].length <= limit && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(v[key]) ? v[key] as string : undefined;
  const position = (key: string) => typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.max(0, Math.min(100, v[key])) : 50;
  return { template: typeof v.template === 'string' && Object.hasOwn(COVER_TEMPLATES, v.template) ? v.template as NotebookCover['template'] : base.template,
    color: typeof v.color === 'string' && /^#[\da-f]{6}$/i.test(v.color) ? v.color : base.color,
    title: typeof v.title === 'string' ? v.title.slice(0, 120) : '', subtitle: typeof v.subtitle === 'string' ? v.subtitle.slice(0, 160) : '',
    icon: typeof v.icon === 'string' && Object.hasOwn(COVER_ICONS, v.icon) ? v.icon as NotebookCover['icon'] : 'book', font: v.font === 'serif' ? 'serif' : 'sans',
    image: image('image', 180000), thumbnail: image('thumbnail', 30000), positionX: position('positionX'), positionY: position('positionY') };
}
