import type { DocumentGraph } from "./document-domain";
import type { ActiveNoteState, NoteGraph, SheetContent } from "./note-domain";

export const NOTE_SCHEMA_VERSION = 6 as const;

export type LibraryPreferences = {
  activeDocumentContextId: string;
  readerShare: number;
  workspaceMode?: "split" | "reader" | "note";
  noteZoom?: number;
};

export type LibraryV6 = {
  version: typeof NOTE_SCHEMA_VERSION;
  notes: NoteGraph;
  documents: DocumentGraph;
  preferences: LibraryPreferences;
  savedAt: number;
};

export type CreateNotebookInput = {
  id?: string;
  title: string;
  sectionId?: string;
  sectionTitle?: string;
  pageId?: string;
  pageTitle?: string;
  sheetId?: string;
  content?: SheetContent;
};

export type CreateSectionInput = { id?: string; notebookId: string; title: string };
export type CreatePageInput = { id?: string; sectionId: string; title: string; sheetId?: string; content?: SheetContent };
export type CreateSheetInput = { id?: string; pageId: string; content?: SheetContent };

export interface NoteRepository {
  loadLibrary(): Promise<LibraryV6 | null>;
  loadNoteGraph(): Promise<NoteGraph | null>;
  loadSheetContent(sheetId: string): Promise<SheetContent | null>;
  replaceLibrary(library: LibraryV6): Promise<void>;
  createNotebook(input: CreateNotebookInput): Promise<ActiveNoteState>;
  createSection(input: CreateSectionInput): Promise<string>;
  createPage(input: CreatePageInput): Promise<ActiveNoteState>;
  createSheet(input: CreateSheetInput): Promise<ActiveNoteState>;
  renameNotebook(id: string, title: string): Promise<void>;
  renameSection(id: string, title: string): Promise<void>;
  renamePage(id: string, title: string): Promise<void>;
  movePage(id: string, sectionId: string, order: number): Promise<void>;
  moveSheet(id: string, pageId: string, order: number): Promise<void>;
  deleteNotebook(id: string): Promise<void>;
  deleteSection(id: string): Promise<void>;
  deletePage(id: string): Promise<void>;
  deleteSheet(id: string): Promise<void>;
  saveSheetContent(sheetId: string, content: SheetContent): Promise<void>;
  readActiveState(): Promise<ActiveNoteState | null>;
  setActiveState(active: ActiveNoteState): Promise<void>;
  flush(): Promise<void>;
}
