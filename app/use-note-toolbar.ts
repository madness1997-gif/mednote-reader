import { useMemo } from "react";

/**
 * Keeps toolbar coordination as a view-model boundary. Canonical note state and
 * editor sessions remain owned by Home/NoteStore; this hook does not persist data.
 */
export function useNoteToolbar<T extends Record<string, unknown>>(model: T): T {
  return useMemo(() => model, [model]);
}
