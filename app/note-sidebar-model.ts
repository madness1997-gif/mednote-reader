import { ordered, type NoteStructure } from "./note-domain";

export type NoteSidebarNotebook = {
  id: string;
  title: string;
};

export type NoteSidebarSheet = {
  id: string;
  pageId: string;
  order: number;
  label: string;
  active: boolean;
};

export type NoteSidebarPage = {
  id: string;
  sectionId: string;
  title: string;
  active: boolean;
  sheets: readonly NoteSidebarSheet[];
};

export type NoteSidebarSection = {
  id: string;
  notebookId: string;
  title: string;
  active: boolean;
  pages: readonly NoteSidebarPage[];
};

export type NoteSidebarModel = {
  notebooks: readonly NoteSidebarNotebook[];
  activeNotebookId: string;
  sections: readonly NoteSidebarSection[];
  activeSectionId: string;
  activeSectionTitle: string;
  pages: readonly NoteSidebarPage[];
  activePageId: string;
};

/**
 * Builds the sidebar read model in one pass over each hierarchy level. The UI
 * receives navigation metadata only; SheetContent remains owned by NoteStore.
 */
export function projectNoteSidebar(structure: NoteStructure): NoteSidebarModel {
  const sheetsByPageId = new Map<string, NoteSidebarSheet[]>();
  ordered(structure.sheets).forEach((sheet) => {
    const siblings = sheetsByPageId.get(sheet.pageId) || [];
    siblings.push({
      id: sheet.id,
      pageId: sheet.pageId,
      order: sheet.order,
      label: `Tờ ${sheet.order + 1}`,
      active: sheet.id === structure.active.activeSheetId,
    });
    sheetsByPageId.set(sheet.pageId, siblings);
  });

  const pagesBySectionId = new Map<string, NoteSidebarPage[]>();
  ordered(structure.pages).forEach((page) => {
    const siblings = pagesBySectionId.get(page.sectionId) || [];
    siblings.push({
      id: page.id,
      sectionId: page.sectionId,
      title: page.title,
      active: page.id === structure.active.activePageId,
      sheets: sheetsByPageId.get(page.id) || [],
    });
    pagesBySectionId.set(page.sectionId, siblings);
  });

  const sectionsByNotebookId = new Map<string, NoteSidebarSection[]>();
  ordered(structure.sections).forEach((section) => {
    const siblings = sectionsByNotebookId.get(section.notebookId) || [];
    siblings.push({
      id: section.id,
      notebookId: section.notebookId,
      title: section.title,
      active: section.id === structure.active.activeSectionId,
      pages: pagesBySectionId.get(section.id) || [],
    });
    sectionsByNotebookId.set(section.notebookId, siblings);
  });

  const notebooks = ordered(structure.notebooks).map(({ id, title }) => ({ id, title }));
  const activeNotebook = notebooks.find(({ id }) => id === structure.active.activeNotebookId) || notebooks[0];
  const sections = activeNotebook ? sectionsByNotebookId.get(activeNotebook.id) || [] : [];
  const activeSection = sections.find(({ id }) => id === structure.active.activeSectionId) || sections[0];
  const pages = activeSection?.pages || [];

  return {
    notebooks,
    activeNotebookId: activeNotebook?.id || "",
    sections,
    activeSectionId: activeSection?.id || "",
    activeSectionTitle: activeSection?.title || "Page",
    pages,
    activePageId: structure.active.activePageId,
  };
}
