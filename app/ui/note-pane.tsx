import { NoteToolbar, type NoteToolbarViewModel } from "./note-toolbar";
import { NoteStage, type NoteStageViewModel } from "./note-stage";

export type NotePaneViewModel = {
  toolbar: NoteToolbarViewModel;
  stage: NoteStageViewModel;
};

export function NotePane({ viewModel }: { viewModel: NotePaneViewModel }) {
  return <section className="notes-pane" tabIndex={-1} aria-label="Note"><NoteToolbar viewModel={viewModel.toolbar} /><NoteStage viewModel={viewModel.stage} /></section>;
}
