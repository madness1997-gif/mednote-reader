import { NoteToolbar } from "./note-toolbar";
import { NoteStage } from "./note-stage";
export function NotePane({ scope }: { scope: Record<string, any> }) { return <section className="notes-pane"><NoteToolbar scope={scope} /><NoteStage scope={scope} /></section>; }
