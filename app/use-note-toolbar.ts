import type { NoteInkSession } from "./note-ink-session";
import type { NoteToolbarScope } from "./ui/note-toolbar";

export type NoteToolbarInput = Omit<NoteToolbarScope, "canUndo" | "canRedo"> & {
  noteInkSession: NoteInkSession;
};

const TOOLBAR_KEYS = [
  "NOTE_ZOOM_PRESETS", "activeNote", "activeTool", "chooseNoteTool", "editor", "exportNotebook", "fitNoteToView",
  "inkHistoryVersion", "notePanel", "noteSheetViewMode", "noteZoom", "noteZoomPercent", "redo", "selectedExcerpt",
  "selectedExcerptIndex", "selectedTextBoxAppearance", "setActiveTool", "setNotePanel", "setNoteSheetViewMode",
  "setNoteSidebarVisibility", "setNoteViewZoom", "shiftExcerptLayer", "showNoteSidebar", "tools", "undo",
] as const satisfies readonly (keyof Omit<NoteToolbarScope, "canUndo" | "canRedo">)[];

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;
}

/** Projects the composition scope into a toolbar-only view model. */
export function useNoteToolbar(input: NoteToolbarInput): NoteToolbarScope {
  const model = pick(input, TOOLBAR_KEYS);
  return {
    ...model,
    canUndo: input.noteInkSession.canUndo(input.activeNote.id),
    canRedo: input.noteInkSession.canRedo(input.activeNote.id),
  };
}
