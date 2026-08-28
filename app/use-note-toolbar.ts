import type { NoteToolbarScope } from "./ui/note-toolbar";

export type NoteToolbarInput = NoteToolbarScope;

const TOOLBAR_KEYS = [
  "NOTE_ZOOM_PRESETS", "activeNote", "canvas", "editor", "exportNotebook", "fitNoteToView", "notePanel",
  "noteSheetViewMode", "noteZoom", "noteZoomPercent", "setNotePanel", "setNoteSheetViewMode",
  "setNoteSidebarVisibility", "setNoteViewZoom", "showNoteSidebar",
] as const satisfies readonly (keyof NoteToolbarScope)[];

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<T, K>;
}

/** Projects the composition scope into a toolbar-only view model. */
export function useNoteToolbar(input: NoteToolbarInput): NoteToolbarScope {
  return pick(input, TOOLBAR_KEYS);
}
