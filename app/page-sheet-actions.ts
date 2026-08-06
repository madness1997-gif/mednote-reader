import {
  blankPage, clone, now, openNoteTarget, syncFromApp, uid, writeStateAndLibrary,
  type AnyObject, type LibraryView, type NoteSection, type RelationSource, type RelationTarget,
} from "./independent-library-core";
import { ACTIVE_SECTION_KEY, EXPANDED_PAGE_KEY, normalizePageSheetModel, sheetLogicalId, type PageGroup, type ScopedTarget, type SheetPage } from "./page-sheet-state";

export function updateNotebook(notebookId: string, mutate: (notebook: AnyObject, record: AnyObject) => void) {
  const synced = syncFromApp();
  if (!synced) return false;
  const record = synced.library.notebooks.find((item) => item.id === notebookId);
  if (!record) return false;
  const workspaceWithNotebook = synced.state.workspaces.find((workspace) => (workspace.notebooks || []).some((item: AnyObject) => String(item.id) === notebookId));
  const original = workspaceWithNotebook?.notebooks?.find((item: AnyObject) => String(item.id) === notebookId);
  if (!original) return false;
  const nextNotebook = clone(original);
  mutate(nextNotebook, record);
  for (const workspace of synced.state.workspaces) {
    workspace.notebooks = (workspace.notebooks || []).map((item: AnyObject) => String(item.id) === notebookId ? clone(nextNotebook) : item);
  }
  record.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function createLogicalPage(notebookId: string, sectionId: string, title: string) {
  const logicalId = uid("logical-page");
  const sheet = blankPage(uid("page"), title) as SheetPage;
  sheet.logicalPageId = logicalId;
  sheet.logicalPageTitle = title;
  sheet.sheetTitle = "Tờ 1";
  sheet.sheetOrder = 0;
  return updateNotebook(notebookId, (notebook, record) => {
    const section = record.sections.find((item: NoteSection) => item.id === sectionId);
    if (!section) return;
    notebook.pages = [...(notebook.pages || []), sheet];
    notebook.activePageId = sheet.id;
    section.pageIds.push(String(sheet.id));
    section.updatedAt = now();
    record.activeSectionId = section.id;
  });
}

export function addSheet(notebookId: string, sectionId: string, logicalPageId: string) {
  let createdId = "";
  const ok = updateNotebook(notebookId, (notebook, record) => {
    const section = record.sections.find((item: NoteSection) => item.id === sectionId);
    if (!section) return;
    const existing = (notebook.pages || []).filter((page: SheetPage) => sheetLogicalId(page) === logicalPageId) as SheetPage[];
    if (!existing.length) return;
    const title = String(existing[0].logicalPageTitle || existing[0].title || "Page mới");
    const sheet = blankPage(uid("page"), title) as SheetPage;
    sheet.logicalPageId = logicalPageId;
    sheet.logicalPageTitle = title;
    sheet.sheetOrder = existing.length;
    sheet.sheetTitle = `Tờ ${existing.length + 1}`;
    createdId = String(sheet.id);
    const lastId = String(existing.sort((a, b) => Number(a.sheetOrder || 0) - Number(b.sheetOrder || 0)).at(-1)?.id || "");
    const insertAt = Math.max(0, section.pageIds.indexOf(lastId) + 1);
    section.pageIds.splice(insertAt, 0, createdId);
    notebook.pages.push(sheet);
    notebook.activePageId = createdId;
    section.updatedAt = now();
    record.activeSectionId = section.id;
  });
  if (ok && createdId) openSheet(notebookId, sectionId, logicalPageId, createdId);
  return ok;
}

export function renameLogicalPage(notebookId: string, logicalPageId: string, title: string) {
  return updateNotebook(notebookId, (notebook) => {
    for (const page of notebook.pages || []) {
      if (sheetLogicalId(page) !== logicalPageId) continue;
      page.logicalPageTitle = title;
      page.title = title;
      page.titleHtml = title;
    }
  });
}

export function removeTargetsForSheets(synced: NonNullable<ReturnType<typeof syncFromApp>>, logicalPageId: string, sheetIds: string[], deleteWholePage: boolean) {
  const ids = new Set(sheetIds);
  synced.library.relations = synced.library.relations.filter((relation) => {
    const target = relation.target as ScopedTarget;
    if (deleteWholePage && (target.id === logicalPageId || target.logicalPageId === logicalPageId)) return false;
    if (!deleteWholePage && target.scope === "page" && (target.id === logicalPageId || target.logicalPageId === logicalPageId)) return true;
    if (target.id && ids.has(String(target.id).replace(/^sheet:/, ""))) return false;
    if (target.pageId && ids.has(String(target.pageId))) return false;
    return true;
  });
}

export function deleteSheets(notebookId: string, logicalPageId: string, sheetId?: string) {
  const synced = syncFromApp();
  if (!synced) return false;
  const record = synced.library.notebooks.find((item) => item.id === notebookId);
  const workspaceWithNotebook = synced.state.workspaces.find((workspace) => (workspace.notebooks || []).some((item: AnyObject) => String(item.id) === notebookId));
  const original = workspaceWithNotebook?.notebooks?.find((item: AnyObject) => String(item.id) === notebookId);
  if (!record || !original) return false;
  const notebook = clone(original);
  const groupSheets = (notebook.pages || []).filter((page: SheetPage) => sheetLogicalId(page) === logicalPageId) as SheetPage[];
  if (!groupSheets.length) return false;
  const deleteWholePage = !sheetId || groupSheets.length === 1;
  const deleting = deleteWholePage ? groupSheets : groupSheets.filter((sheet) => String(sheet.id) === sheetId);
  const deletingIds = deleting.map((sheet) => String(sheet.id));
  const remainingGroup = groupSheets.filter((sheet) => !deletingIds.includes(String(sheet.id)));
  notebook.pages = (notebook.pages || []).filter((page: SheetPage) => !deletingIds.includes(String(page.id)));
  for (const section of record.sections) {
    section.pageIds = section.pageIds.filter((id) => !deletingIds.includes(id));
  }
  removeTargetsForSheets(synced, logicalPageId, deletingIds, deleteWholePage);

  if (!notebook.pages.length) {
    const section = record.sections[0];
    const replacementTitle = "Page mới";
    const replacementLogicalId = uid("logical-page");
    const replacement = blankPage(uid("page"), replacementTitle) as SheetPage;
    replacement.logicalPageId = replacementLogicalId;
    replacement.logicalPageTitle = replacementTitle;
    replacement.sheetTitle = "Tờ 1";
    replacement.sheetOrder = 0;
    notebook.pages = [replacement];
    notebook.activePageId = replacement.id;
    section.pageIds.push(String(replacement.id));
    record.activeSectionId = section.id;
  } else if (remainingGroup.length) {
    const next = remainingGroup.sort((a, b) => Number(a.sheetOrder || 0) - Number(b.sheetOrder || 0))[0];
    notebook.activePageId = next.id;
    for (const relation of synced.library.relations) {
      const target = relation.target as ScopedTarget;
      if (target.id === logicalPageId && deletingIds.includes(String(target.pageId || ""))) target.pageId = String(next.id);
    }
  } else if (deletingIds.includes(String(notebook.activePageId))) {
    notebook.activePageId = notebook.pages[0].id;
  }

  for (const workspace of synced.state.workspaces) {
    workspace.notebooks = (workspace.notebooks || []).map((item: AnyObject) => String(item.id) === notebookId ? clone(notebook) : item);
  }
  record.updatedAt = now();
  writeStateAndLibrary(synced.state, synced.library, true);
  normalizePageSheetModel();
  return true;
}

export function reorderSheet(notebookId: string, sectionId: string, logicalPageId: string, sheetId: string, direction: -1 | 1) {
  return updateNotebook(notebookId, (notebook, record) => {
    const section = record.sections.find((item: NoteSection) => item.id === sectionId);
    if (!section) return;
    const sheets = (notebook.pages || []).filter((page: SheetPage) => sheetLogicalId(page) === logicalPageId)
      .sort((a: SheetPage, b: SheetPage) => Number(a.sheetOrder || 0) - Number(b.sheetOrder || 0));
    const index = sheets.findIndex((sheet: SheetPage) => String(sheet.id) === sheetId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sheets.length) return;
    [sheets[index], sheets[targetIndex]] = [sheets[targetIndex], sheets[index]];
    sheets.forEach((sheet: SheetPage, order: number) => {
      sheet.sheetOrder = order;
      sheet.sheetTitle = `Tờ ${order + 1}`;
    });
    const ids = new Set(sheets.map((sheet: SheetPage) => String(sheet.id)));
    const first = section.pageIds.findIndex((id: string) => ids.has(id));
    section.pageIds = section.pageIds.filter((id: string) => !ids.has(id));
    section.pageIds.splice(first < 0 ? section.pageIds.length : first, 0, ...sheets.map((sheet: SheetPage) => String(sheet.id)));
    section.updatedAt = now();
  });
}

export function moveLogicalPage(notebookId: string, logicalPageId: string, destinationSectionId: string) {
  const synced = syncFromApp();
  const record = synced?.library.notebooks.find((item) => item.id === notebookId);
  if (!synced || !record) return false;
  const destination = record.sections.find((section) => section.id === destinationSectionId);
  if (!destination) return false;
  const workspace = synced.state.workspaces.find((item) => (item.notebooks || []).some((book: AnyObject) => String(book.id) === notebookId));
  const notebook = workspace?.notebooks?.find((book: AnyObject) => String(book.id) === notebookId);
  if (!notebook) return false;
  const sheetIds = (notebook.pages || []).filter((page: SheetPage) => sheetLogicalId(page) === logicalPageId).map((page: SheetPage) => String(page.id));
  if (!sheetIds.length) return false;
  for (const section of record.sections) section.pageIds = section.pageIds.filter((id) => !sheetIds.includes(id));
  destination.pageIds.push(...sheetIds);
  destination.updatedAt = now();
  record.activeSectionId = destination.id;
  for (const relation of synced.library.relations) {
    const target = relation.target as ScopedTarget;
    if (target.logicalPageId === logicalPageId || target.id === logicalPageId || (target.pageId && sheetIds.includes(target.pageId))) {
      target.sectionId = destination.id;
      relation.updatedAt = now();
    }
  }
  writeStateAndLibrary(synced.state, synced.library, true);
  return true;
}

export function openSheet(notebookId: string, sectionId: string, logicalPageId: string, sheetId: string) {
  sessionStorage.setItem(`${ACTIVE_SECTION_KEY}${notebookId}`, sectionId);
  sessionStorage.setItem(`${EXPANDED_PAGE_KEY}${notebookId}`, logicalPageId);
  const target = {
    type: "page",
    id: `sheet:${sheetId}`,
    notebookId,
    sectionId,
    pageId: sheetId,
    logicalPageId,
    scope: "sheet",
  } as ScopedTarget;
  if (openNoteTarget(target)) window.location.reload();
}

export function openLogicalPage(notebookId: string, sectionId: string, group: PageGroup, preferredSheetId?: string) {
  const sheetId = preferredSheetId && group.sheets.some((sheet) => String(sheet.id) === preferredSheetId)
    ? preferredSheetId
    : String(group.sheets[0]?.id || "");
  if (!sheetId) return;
  sessionStorage.setItem(`${ACTIVE_SECTION_KEY}${notebookId}`, sectionId);
  sessionStorage.setItem(`${EXPANDED_PAGE_KEY}${notebookId}`, group.id);
  const target = {
    type: "page",
    id: group.id,
    notebookId,
    sectionId,
    pageId: sheetId,
    logicalPageId: group.id,
    scope: "page",
  } as ScopedTarget;
  if (openNoteTarget(target)) window.location.reload();
}

export function targetForGroup(notebookId: string, sectionId: string, group: PageGroup): ScopedTarget {
  return {
    type: "page",
    id: group.id,
    notebookId,
    sectionId,
    pageId: String(group.sheets[0]?.id || ""),
    logicalPageId: group.id,
    scope: "page",
  } as ScopedTarget;
}

export function targetForSheet(notebookId: string, sectionId: string, logicalPageId: string, sheetId: string): ScopedTarget {
  return {
    type: "page",
    id: `sheet:${sheetId}`,
    notebookId,
    sectionId,
    pageId: sheetId,
    logicalPageId,
    scope: "sheet",
  } as ScopedTarget;
}

export function targetMatches(relationTarget: RelationTarget, target: ScopedTarget) {
  const candidate = relationTarget as ScopedTarget;
  return candidate.type === target.type && candidate.id === target.id;
}

export function sourceLabel(view: LibraryView, source: RelationSource) {
  if (source.type === "group") return view.groups.find((group) => group.id === source.id)?.name || "Bộ PDF";
  return (view.documents.find((document) => document.id === source.id)?.name || "PDF").replace(/\.pdf$/i, "");
}
