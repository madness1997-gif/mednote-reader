import { useNotePaneControllers } from "../workspace-controllers-context";
import { useNoteSheetLinks } from "../use-note-sheet-links";
import { NoteSheetLinkDialog } from "./note-sheet-link-dialog";
import { NoteToolbar, type NoteToolbarViewModel } from "./note-toolbar";
import { NoteStage, type NoteStageViewModel } from "./note-stage";

export type NotePaneViewModel = {
  toolbar: NoteToolbarViewModel;
  stage: NoteStageViewModel;
  openLinkedSheet: (sheetId: string) => Promise<void>;
};

export function NotePane({ viewModel }: { viewModel: NotePaneViewModel }) {
  const { noteCanvas } = useNotePaneControllers();
  const links = useNoteSheetLinks({
    state: viewModel.stage.noteState,
    activeSheetId: viewModel.stage.activeNote.id,
    hydrating: viewModel.stage.activeNoteHydrating,
    stageRef: viewModel.stage.noteStageRef,
    openSheet: viewModel.openLinkedSheet,
    notify: noteCanvas.notify,
  });
  return <section className="notes-pane" tabIndex={-1} aria-label="Note" onClickCapture={links.followLink} onKeyDownCapture={(event) => {
    if (event.target instanceof Element && event.target.closest("dialog")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      links.createLink();
      return;
    }
    links.followLink(event);
  }}>
    <NoteToolbar viewModel={viewModel.toolbar} onCreateSheetLink={links.createLink} />
    <NoteStage viewModel={viewModel.stage} />
    {links.session && <NoteSheetLinkDialog targets={links.targets} initialSheetId={links.session.sheetId} initialLabel={links.session.label} editing={Boolean(links.session.existingLink)} onSave={links.save} onCancel={links.cancel} onRemove={links.remove} />}
  </section>;
}
