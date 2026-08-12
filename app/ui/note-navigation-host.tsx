import { useMemo } from "react";
import NoteSidebar from "../note-sidebar";
import { NoteSidebarController } from "../note-sidebar-controller";
import { projectNoteSidebar } from "../note-sidebar-model";
import { noteStore, useNoteStoreSnapshot } from "../note-store";

export function NoteNavigationHost({ setNoteSidebarVisibility }: { setNoteSidebarVisibility: (visible: boolean) => void }) {
  const state = useNoteStoreSnapshot(noteStore);
  const controller = useMemo(() => new NoteSidebarController(noteStore), []);
  const model = useMemo(() => state.structure ? projectNoteSidebar(state.structure) : null, [state.structure]);

  return (
    <aside className="note-navigation-host" aria-label="Điều hướng ghi chú">
      <NoteSidebar
        status={state.status}
        model={model}
        controller={controller}
        busy={state.busy}
        hydratingSheetId={state.hydratingSheetId}
        error={state.error}
        onRequestClose={() => setNoteSidebarVisibility(false)}
      />
    </aside>
  );
}
