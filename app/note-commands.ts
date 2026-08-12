import type { NoteRepository } from "./note-repository";
import { noteContextForSheet } from "./note-domain";
import type {
  ActiveNoteState,
  NoteStructure,
  Page,
  Section,
  Sheet,
  SheetContent,
} from "./note-domain";

export type NoteCommandResult = {
  structure: NoteStructure;
  active: ActiveNoteState;
};

/**
 * Serializes every durable note mutation through one queue. The repository is
 * still responsible for IndexedDB transactions; this layer gives the runtime a
 * single command boundary and always returns the committed structure.
 */
export class NoteCommands {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly repository: NoteRepository) {}

  private enqueue<T>(operation: () => Promise<T>) {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async committedResult(): Promise<NoteCommandResult> {
    const structure = await this.repository.loadNoteStructure();
    if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
    return { structure, active: structure.active };
  }

  async flush() {
    await this.queue;
    await this.repository.flush();
  }

  createNotebook(title: string, content: SheetContent = {}) {
    return this.enqueue(async () => {
      await this.repository.createNotebook({ title, content });
      return this.committedResult();
    });
  }

  createSection(notebookId: string, title: string) {
    return this.enqueue(async () => {
      const id = await this.repository.createSection({ notebookId, title });
      return { ...(await this.committedResult()), id };
    });
  }

  createPage(sectionId: string, title: string, content: SheetContent = {}) {
    return this.enqueue(async () => {
      await this.repository.createPage({ sectionId, title, content });
      return this.committedResult();
    });
  }

  createSheet(pageId: string, content: SheetContent = {}) {
    return this.enqueue(async () => {
      await this.repository.createSheet({ pageId, content });
      return this.committedResult();
    });
  }

  renameNotebook(id: string, title: string) {
    return this.enqueue(async () => {
      await this.repository.renameNotebook(id, title);
      return this.committedResult();
    });
  }

  renameSection(id: string, title: string) {
    return this.enqueue(async () => {
      await this.repository.renameSection(id, title);
      return this.committedResult();
    });
  }

  renamePage(id: string, title: string) {
    return this.enqueue(async () => {
      await this.repository.renamePage(id, title);
      return this.committedResult();
    });
  }

  movePage(id: string, sectionId: string, order: number) {
    return this.enqueue(async () => {
      await this.repository.movePage(id, sectionId, order);
      return this.committedResult();
    });
  }

  moveSheet(id: string, pageId: string, order: number) {
    return this.enqueue(async () => {
      await this.repository.moveSheet(id, pageId, order);
      return this.committedResult();
    });
  }

  deleteNotebook(id: string, replacementContent: SheetContent = {}) {
    return this.enqueue(async () => {
      const structure = await this.repository.loadNoteStructure();
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const deleting = structure.notebooks.find((record) => record.id === id);
      if (!deleting) throw new Error(`Không tìm thấy Notebook ${id}`);

      let replacementActive: ActiveNoteState | null = null;
      if (structure.active.activeNotebookId === id) {
        const siblings = [...structure.notebooks].sort((left, right) => left.order - right.order);
        const deletingIndex = siblings.findIndex((record) => record.id === id);
        const replacement = siblings[deletingIndex + 1] || siblings[deletingIndex - 1];
        if (replacement) replacementActive = this.firstContextForNotebook(structure, replacement.id);
      }

      if (structure.notebooks.length === 1) {
        await this.repository.createNotebook({ title: "Sổ ghi chú mới", content: replacementContent });
        replacementActive = null;
      }
      await this.repository.deleteNotebook(id);
      if (replacementActive) await this.repository.setActiveState(replacementActive);
      return this.committedResult();
    });
  }

  deleteSection(id: string) {
    return this.enqueue(async () => {
      const structure = await this.repository.loadNoteStructure();
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const deleting = structure.sections.find((record) => record.id === id);
      if (!deleting) throw new Error(`Không tìm thấy Section ${id}`);

      let replacementActive: ActiveNoteState | null = null;
      if (structure.active.activeSectionId === id) {
        const siblings = structure.sections
          .filter((record) => record.notebookId === deleting.notebookId)
          .sort((left, right) => left.order - right.order);
        const deletingIndex = siblings.findIndex((record) => record.id === id);
        const replacement = siblings[deletingIndex + 1] || siblings[deletingIndex - 1];
        if (replacement) replacementActive = this.firstContextForSection(structure, replacement.id);
      }

      await this.repository.deleteSection(id);
      if (replacementActive) await this.repository.setActiveState(replacementActive);
      return this.committedResult();
    });
  }

  deletePage(id: string, replacementContent: SheetContent = {}) {
    return this.enqueue(async () => {
      const structure = await this.repository.loadNoteStructure();
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const page = structure.pages.find((record) => record.id === id);
      if (!page) throw new Error(`Không tìm thấy Page ${id}`);
      const siblings = structure.pages
        .filter((record) => record.sectionId === page.sectionId)
        .sort((left, right) => left.order - right.order);
      const remainingPages = siblings.filter((record) => record.id !== id);

      let replacementActive: ActiveNoteState | null = null;
      if (structure.active.activePageId === id && remainingPages.length) {
        const deletingIndex = siblings.findIndex((record) => record.id === id);
        const replacement = siblings[deletingIndex + 1] || siblings[deletingIndex - 1];
        if (replacement) replacementActive = this.firstContextForPage(structure, replacement.id);
      }

      if (!remainingPages.length) {
        await this.repository.createPage({ sectionId: page.sectionId, title: "Page mới", content: replacementContent });
        replacementActive = null;
      }
      await this.repository.deletePage(id);
      if (replacementActive) await this.repository.setActiveState(replacementActive);
      return this.committedResult();
    });
  }

  deleteSheet(id: string) {
    return this.enqueue(async () => {
      const structure = await this.repository.loadNoteStructure();
      if (!structure) throw new Error("Kho note v6 chưa sẵn sàng");
      const deleting = structure.sheets.find((sheet) => sheet.id === id);
      if (!deleting) throw new Error(`Không tìm thấy Sheet ${id}`);

      let replacementActive: ActiveNoteState | null = null;
      if (structure.active.activeSheetId === id) {
        const page = structure.pages.find((record) => record.id === deleting.pageId);
        if (!page) throw new Error(`Không tìm thấy Page ${deleting.pageId}`);
        const siblings = this.sheetsForPage(structure, page);
        const deletingIndex = siblings.findIndex((sheet) => sheet.id === id);
        const replacement = siblings[deletingIndex + 1] || siblings[deletingIndex - 1];
        if (replacement) replacementActive = noteContextForSheet(structure, replacement.id);
      }

      await this.repository.deleteSheet(id);
      if (replacementActive) await this.repository.setActiveState(replacementActive);
      return this.committedResult();
    });
  }

  setActive(active: ActiveNoteState) {
    return this.enqueue(async () => {
      await this.repository.setActiveState(active);
      return this.committedResult();
    });
  }

  saveSheetContent(sheetId: string, content: SheetContent) {
    return this.enqueue(async () => {
      await this.repository.saveSheetContent(sheetId, content);
    });
  }

  sheetsForPage(structure: NoteStructure, page: Page) {
    return structure.sheets
      .filter((sheet) => sheet.pageId === page.id)
      .sort((left, right) => left.order - right.order);
  }

  firstSheetForPage(structure: NoteStructure, pageId: string): Sheet | undefined {
    return structure.sheets
      .filter((sheet) => sheet.pageId === pageId)
      .sort((left, right) => left.order - right.order)[0];
  }

  private firstContextForPage(structure: NoteStructure, pageId: string): ActiveNoteState | null {
    const sheet = this.firstSheetForPage(structure, pageId);
    return sheet ? noteContextForSheet(structure, sheet.id) : null;
  }

  private firstContextForSection(structure: NoteStructure, sectionId: string): ActiveNoteState | null {
    const page = structure.pages
      .filter((record) => record.sectionId === sectionId)
      .sort((left, right) => left.order - right.order)[0];
    return page ? this.firstContextForPage(structure, page.id) : null;
  }

  private firstContextForNotebook(structure: NoteStructure, notebookId: string): ActiveNoteState | null {
    const section = structure.sections
      .filter((record) => record.notebookId === notebookId)
      .sort((left, right) => left.order - right.order)[0] as Section | undefined;
    return section ? this.firstContextForSection(structure, section.id) : null;
  }
}
