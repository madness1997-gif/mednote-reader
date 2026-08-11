import type { Stroke } from "./note-runtime-adapter";

export type NoteInkHistory = { undo: Stroke[][]; redo: Stroke[][] };

function sameStrokeList(a: Stroke[], b: Stroke[]) {
  return a.length === b.length && a.every((stroke, index) => stroke === b[index]);
}

export class NoteInkSession {
  private readonly histories = new Map<string, NoteInkHistory>();
  readonly limit: number;

  constructor(limit = 60) {
    this.limit = limit;
  }

  private history(sheetId: string) {
    let history = this.histories.get(sheetId);
    if (!history) {
      history = { undo: [], redo: [] };
      this.histories.set(sheetId, history);
    }
    return history;
  }

  commit(sheetId: string, next: Stroke[], previous: Stroke[]) {
    if (sameStrokeList(next, previous)) return false;
    const history = this.history(sheetId);
    history.undo = [...history.undo, previous].slice(-this.limit);
    history.redo = [];
    return true;
  }

  undo(sheetId: string, current: Stroke[]) {
    const history = this.history(sheetId);
    const previous = history.undo.at(-1);
    if (!previous) return null;
    history.undo = history.undo.slice(0, -1);
    history.redo = [...history.redo, current].slice(-this.limit);
    return previous;
  }

  redo(sheetId: string, current: Stroke[]) {
    const history = this.history(sheetId);
    const next = history.redo.at(-1);
    if (!next) return null;
    history.redo = history.redo.slice(0, -1);
    history.undo = [...history.undo, current].slice(-this.limit);
    return next;
  }

  canUndo(sheetId: string) {
    return this.history(sheetId).undo.length > 0;
  }

  canRedo(sheetId: string) {
    return this.history(sheetId).redo.length > 0;
  }

  clear(sheetId?: string) {
    if (sheetId) this.histories.delete(sheetId);
    else this.histories.clear();
  }

  snapshot(sheetId: string): NoteInkHistory {
    const history = this.history(sheetId);
    return { undo: [...history.undo], redo: [...history.redo] };
  }
}
