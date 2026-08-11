import { useNoteToolbar } from "../use-note-toolbar";
import { NoteToolbar } from "./note-toolbar";
import { NoteStage } from "./note-stage";

export function NotePane({ scope }: { scope: Record<string, any> }) {
  const toolbar = useNoteToolbar(scope);
  return <section className="notes-pane"><NoteToolbar scope={toolbar} /><NoteStage scope={scope} /></section>;
}
