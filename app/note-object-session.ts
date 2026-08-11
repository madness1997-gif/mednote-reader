import type { ExcerptLayout, NoteExcerpt } from "./note-runtime-adapter";

export class NoteObjectSession {
  contentScale(layout: ExcerptLayout, step: number): ExcerptLayout {
    return { ...layout, contentScale: Math.min(2.4, Math.max(.65, Number((layout.contentScale + step).toFixed(2)))) };
  }

  opacity(layout: ExcerptLayout, opacity: number): ExcerptLayout {
    return { ...layout, opacity: Math.min(1, Math.max(.1, opacity)) };
  }

  rotate(layout: ExcerptLayout, degrees: number): ExcerptLayout {
    const rotation = (((layout.rotation + degrees + 180) % 360) + 360) % 360 - 180;
    return { ...layout, rotation };
  }

  bringToFront(excerpts: NoteExcerpt[], excerptId: string) {
    const item = excerpts.find((excerpt) => excerpt.id === excerptId);
    return item ? [...excerpts.filter((excerpt) => excerpt.id !== excerptId), item] : excerpts;
  }

  sendToBack(excerpts: NoteExcerpt[], excerptId: string) {
    const item = excerpts.find((excerpt) => excerpt.id === excerptId);
    return item ? [item, ...excerpts.filter((excerpt) => excerpt.id !== excerptId)] : excerpts;
  }

  delete(excerpts: NoteExcerpt[], excerptId: string) {
    return excerpts.filter((excerpt) => excerpt.id !== excerptId);
  }
}
