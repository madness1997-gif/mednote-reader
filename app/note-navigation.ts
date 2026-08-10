import type { NoteDocumentLink } from "./document-domain";
import type { NoteStore } from "./note-store";

export type NoteNavigationTarget =
  | { type: "notebook"; id: string }
  | { type: "section"; id: string }
  | { type: "page"; id: string; sheetId?: string }
  | { type: "sheet"; id: string };

export class NoteNavigation {
  constructor(private readonly store: NoteStore) {}

  openNotebook(id: string) { return this.store.openNotebook(id); }
  openSection(id: string) { return this.store.openSection(id); }
  openPage(id: string, sheetId?: string) { return this.store.openPage(id, sheetId); }
  openSheet(id: string) { return this.store.openSheet(id); }

  openTarget(target: NoteNavigationTarget) {
    if (target.type === "notebook") return this.openNotebook(target.id);
    if (target.type === "section") return this.openSection(target.id);
    if (target.type === "page") return this.openPage(target.id, target.sheetId);
    return this.openSheet(target.id);
  }

  openLinkedTarget(link: NoteDocumentLink) {
    return link.targetType === "page" ? this.openPage(link.targetId) : this.openSheet(link.targetId);
  }
}
