import { NoteToolbar, type NoteToolbarScope } from "./note-toolbar";
import { NoteStage, type NoteStageScope } from "./note-stage";

export function NotePane({ toolbar, stage }: { toolbar: NoteToolbarScope; stage: NoteStageScope }) {
  return <section className="notes-pane"><NoteToolbar scope={toolbar} /><NoteStage scope={stage} /></section>;
}
