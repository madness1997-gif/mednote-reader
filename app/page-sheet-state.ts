import {
  clone, getLibraryView, now, readAppState, syncFromApp, writeStateAndLibrary,
  type AnyObject, type LibraryView, type NoteSection, type RelationSource, type RelationTarget,
} from "./independent-library-core";

export const NAV_CLASS = "mednote-page-sheet-nav";
export const STYLE_ID = "mednote-page-sheet-style";
export const NORMALIZED_KEY = "mednote-page-sheet-model-v1";
export const ACTIVE_SECTION_KEY = "mednote-page-sheet-active-section:";
export const EXPANDED_PAGE_KEY = "mednote-page-sheet-expanded-page:";

export type SheetPage = AnyObject & {
  logicalPageId?: string;
  logicalPageTitle?: string;
  sheetTitle?: string;
  sheetOrder?: number;
};

export type ScopedTarget = RelationTarget & {
  logicalPageId?: string;
  scope?: "page" | "sheet";
};

export type PageGroup = {
  id: string;
  title: string;
  sheets: SheetPage[];
};

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

export function sourceKey(source: RelationSource) {
  return `${source.type}:${source.id}`;
}

export function sheetLogicalId(sheet: SheetPage) {
  return String(sheet.logicalPageId || sheet.id);
}

export function sheetTitle(sheet: SheetPage, index: number) {
  return String(sheet.sheetTitle || `Tờ ${index + 1}`);
}

export function pageGroups(notebook: AnyObject, section: NoteSection): PageGroup[] {
  const byId = new Map<string, SheetPage>();
  for (const page of notebook.pages || []) byId.set(String(page.id), page as SheetPage);
  const groups = new Map<string, PageGroup>();
  for (const pageId of section.pageIds) {
    const sheet = byId.get(pageId);
    if (!sheet) continue;
    const logicalId = sheetLogicalId(sheet);
    let group = groups.get(logicalId);
    if (!group) {
      group = {
        id: logicalId,
        title: String(sheet.logicalPageTitle || sheet.title || "Page mới"),
        sheets: [],
      };
      groups.set(logicalId, group);
    }
    group.sheets.push(sheet);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    sheets: group.sheets.sort((a, b) => Number(a.sheetOrder || 0) - Number(b.sheetOrder || 0)),
  }));
}

export function currentContext() {
  const state = readAppState();
  const view = getLibraryView();
  if (!state || !view) return null;
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  if (!workspace) return null;
  const notebook = (workspace.notebooks || []).find((item: AnyObject) => String(item.id) === String(workspace.activeNotebookId));
  if (!notebook) return null;
  const record = view.notebooks.find((item) => item.id === String(notebook.id) && item.available);
  if (!record?.sections.length) return null;
  const activeSheet = (notebook.pages || []).find((item: AnyObject) => String(item.id) === String(notebook.activePageId)) as SheetPage | undefined;
  const activeSheetSection = record.sections.find((section) => section.pageIds.includes(String(activeSheet?.id || "")));
  const storedSectionId = sessionStorage.getItem(`${ACTIVE_SECTION_KEY}${record.id}`);
  const storedSection = record.sections.find((section) => section.id === storedSectionId);
  const activeSection = activeSheetSection || storedSection || record.sections.find((section) => section.id === record.activeSectionId) || record.sections[0];
  return { state, view, workspace, notebook, record, activeSection, activeSheet };
}

export function normalizePageSheetModel() {
  const synced = syncFromApp();
  if (!synced) return false;
  let changed = false;
  const physicalToLogical = new Map<string, { logicalId: string; notebookId: string; sectionId?: string }>();

  for (const record of synced.library.notebooks) {
    const copies: { workspace: AnyObject; notebook: AnyObject }[] = [];
    for (const workspace of synced.state.workspaces) {
      const notebook = (workspace.notebooks || []).find((item: AnyObject) => String(item.id) === record.id);
      if (notebook) copies.push({ workspace, notebook });
    }
    if (!copies.length) continue;
    const canonical = clone(copies[0].notebook);
    const pages = (canonical.pages || []) as SheetPage[];
    const activeId = String(canonical.activePageId || "");
    const activeSheet = pages.find((page) => String(page.id) === activeId);

    for (const page of pages) {
      if (!page.logicalPageId) {
        page.logicalPageId = String(page.id);
        changed = true;
      }
      if (!page.logicalPageTitle) {
        page.logicalPageTitle = String(page.title || "Page mới");
        changed = true;
      }
    }

    const groups = new Map<string, SheetPage[]>();
    for (const page of pages) {
      const logicalId = sheetLogicalId(page);
      const group = groups.get(logicalId) || [];
      group.push(page);
      groups.set(logicalId, group);
    }

    for (const [logicalId, sheets] of groups) {
      sheets.sort((a, b) => {
        const orderA = Number.isFinite(Number(a.sheetOrder)) ? Number(a.sheetOrder) : pages.indexOf(a);
        const orderB = Number.isFinite(Number(b.sheetOrder)) ? Number(b.sheetOrder) : pages.indexOf(b);
        return orderA - orderB;
      });
      const activeInGroup = sheets.find((sheet) => String(sheet.id) === activeId);
      const savedTitle = String(activeInGroup?.logicalPageTitle || sheets[0].logicalPageTitle || sheets[0].title || "Page mới").trim() || "Page mới";
      const editedTitle = activeInGroup && String(activeInGroup.title || "").trim() !== savedTitle
        ? String(activeInGroup.title || "").trim()
        : "";
      const canonicalTitle = editedTitle || savedTitle;
      sheets.forEach((sheet, index) => {
        if (sheet.logicalPageId !== logicalId) { sheet.logicalPageId = logicalId; changed = true; }
        if (sheet.logicalPageTitle !== canonicalTitle) { sheet.logicalPageTitle = canonicalTitle; changed = true; }
        if (sheet.title !== canonicalTitle) { sheet.title = canonicalTitle; sheet.titleHtml = canonicalTitle; changed = true; }
        const nextSheetTitle = `Tờ ${index + 1}`;
        if (sheet.sheetTitle !== nextSheetTitle) { sheet.sheetTitle = nextSheetTitle; changed = true; }
        if (sheet.sheetOrder !== index) { sheet.sheetOrder = index; changed = true; }
      });
    }

    // A logical Page must stay inside exactly one Section. If an old operation split
    // its sheets, keep them together in the section containing its first sheet.
    for (const [logicalId, sheets] of groups) {
      const ids = sheets.map((sheet) => String(sheet.id));
      const owner = record.sections.find((section) => section.pageIds.some((id) => ids.includes(id))) || record.sections[0];
      const originalOwnerPosition = owner.pageIds.findIndex((id) => ids.includes(id));
      for (const section of record.sections) {
        const before = section.pageIds.join("|");
        section.pageIds = section.pageIds.filter((id) => !ids.includes(id));
        if (section.id === owner.id) {
          const existing = new Set(section.pageIds);
          const insert = ids.filter((id) => !existing.has(id));
          const position = originalOwnerPosition < 0 ? section.pageIds.length : Math.min(originalOwnerPosition, section.pageIds.length);
          section.pageIds.splice(position, 0, ...insert);
        }
        if (before !== section.pageIds.join("|")) { section.updatedAt = now(); changed = true; }
      }
      for (const sheet of sheets) {
        physicalToLogical.set(String(sheet.id), { logicalId, notebookId: record.id, sectionId: owner.id });
      }
    }

    if (activeSheet) {
      const context = physicalToLogical.get(String(activeSheet.id));
      if (context && record.activeSectionId !== context.sectionId) {
        record.activeSectionId = context.sectionId || record.activeSectionId;
        record.updatedAt = now();
        changed = true;
      }
    }

    for (const copy of copies) {
      copy.workspace.notebooks = (copy.workspace.notebooks || []).map((item: AnyObject) => String(item.id) === record.id ? clone(canonical) : item);
    }
  }

  for (const relation of synced.library.relations) {
    const target = relation.target as ScopedTarget;
    const physicalId = target.pageId || (target.type === "page" ? target.id : undefined);
    const context = physicalId ? physicalToLogical.get(String(physicalId).replace(/^sheet:/, "")) : undefined;
    if (!context) continue;
    if (target.type === "page" && !target.scope) {
      target.scope = "page";
      target.logicalPageId = context.logicalId;
      target.id = context.logicalId;
      target.pageId = String(physicalId).replace(/^sheet:/, "");
      target.sectionId = context.sectionId;
      relation.updatedAt = now();
      changed = true;
    } else if (!target.logicalPageId) {
      target.logicalPageId = context.logicalId;
      changed = true;
    }
  }

  if (!localStorage.getItem(NORMALIZED_KEY)) {
    localStorage.setItem(NORMALIZED_KEY, "1");
    changed = true;
  }
  if (changed) writeStateAndLibrary(synced.state, synced.library, true);
  return changed;
}
