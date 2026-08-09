export type EntityId = string;

export type Workspace = {
  id: EntityId;
  title: string;
};

export type Notebook = {
  id: EntityId;
  title: string;
  order: number;
};

export type Section = {
  id: EntityId;
  notebookId: EntityId;
  title: string;
  order: number;
};

export type Page = {
  id: EntityId;
  sectionId: EntityId;
  title: string;
  order: number;
};

export type SheetContent = Record<string, unknown>;

export type Sheet = {
  id: EntityId;
  pageId: EntityId;
  order: number;
  content: SheetContent;
};

export type ActiveNoteState = {
  activeNotebookId: EntityId;
  activeSectionId: EntityId;
  activePageId: EntityId;
  activeSheetId: EntityId;
};

export type NoteGraph = {
  workspace: Workspace;
  notebooks: Notebook[];
  sections: Section[];
  pages: Page[];
  sheets: Sheet[];
  active: ActiveNoteState;
};

export type NoteInvariantCode =
  | "duplicate-id"
  | "missing-parent"
  | "empty-notebook"
  | "empty-page"
  | "invalid-order"
  | "invalid-active-chain"
  | "navigation-metadata-in-content";

export type NoteInvariantIssue = {
  code: NoteInvariantCode;
  entity: "workspace" | "notebook" | "section" | "page" | "sheet" | "active";
  id: string;
  message: string;
};

export class NoteInvariantError extends Error {
  readonly issues: NoteInvariantIssue[];

  constructor(issues: NoteInvariantIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "NoteInvariantError";
    this.issues = issues;
  }
}

const NAVIGATION_CONTENT_FIELDS = new Set([
  "id",
  "title",
  "titleHtml",
  "pageId",
  "sectionId",
  "notebookId",
  "order",
  "logicalPageId",
  "logicalPageTitle",
  "sheetTitle",
  "sheetOrder",
  "__mednoteLazyPage",
]);

function duplicateIssues<T extends { id: string }>(
  records: T[],
  entity: NoteInvariantIssue["entity"],
) {
  const seen = new Set<string>();
  const issues: NoteInvariantIssue[] = [];
  records.forEach((record) => {
    if (!record.id || seen.has(record.id)) {
      issues.push({
        code: "duplicate-id",
        entity,
        id: record.id,
        message: `${entity} phải có ID thật và duy nhất: ${record.id || "(rỗng)"}`,
      });
    }
    seen.add(record.id);
  });
  return issues;
}

function orderIssues<T extends { id: string; order: number }>(
  groups: T[][],
  entity: NoteInvariantIssue["entity"],
) {
  const issues: NoteInvariantIssue[] = [];
  groups.forEach((records) => {
    const sorted = [...records].sort((left, right) => left.order - right.order);
    sorted.forEach((record, index) => {
      if (!Number.isInteger(record.order) || record.order !== index) {
        issues.push({
          code: "invalid-order",
          entity,
          id: record.id,
          message: `${entity} ${record.id} có order ${record.order}; cần liên tục từ 0 trong cùng parent`,
        });
      }
    });
  });
  return issues;
}

function groupByParent<T>(records: T[], parent: (record: T) => string) {
  const groups = new Map<string, T[]>();
  records.forEach((record) => {
    const key = parent(record);
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  });
  return [...groups.values()];
}

export function validateNoteGraph(graph: NoteGraph): NoteInvariantIssue[] {
  const issues: NoteInvariantIssue[] = [];
  issues.push(...duplicateIssues(graph.notebooks, "notebook"));
  issues.push(...duplicateIssues(graph.sections, "section"));
  issues.push(...duplicateIssues(graph.pages, "page"));
  issues.push(...duplicateIssues(graph.sheets, "sheet"));

  const notebooks = new Map(graph.notebooks.map((record) => [record.id, record]));
  const sections = new Map(graph.sections.map((record) => [record.id, record]));
  const pages = new Map(graph.pages.map((record) => [record.id, record]));
  const sheets = new Map(graph.sheets.map((record) => [record.id, record]));

  graph.sections.forEach((section) => {
    if (!notebooks.has(section.notebookId)) {
      issues.push({ code: "missing-parent", entity: "section", id: section.id, message: `Section ${section.id} không có Notebook ${section.notebookId}` });
    }
  });
  graph.pages.forEach((page) => {
    if (!sections.has(page.sectionId)) {
      issues.push({ code: "missing-parent", entity: "page", id: page.id, message: `Page ${page.id} không có Section ${page.sectionId}` });
    }
  });
  graph.sheets.forEach((sheet) => {
    if (!pages.has(sheet.pageId)) {
      issues.push({ code: "missing-parent", entity: "sheet", id: sheet.id, message: `Sheet ${sheet.id} không có Page ${sheet.pageId}` });
    }
    const copiedNavigation = Object.keys(sheet.content).filter((field) => NAVIGATION_CONTENT_FIELDS.has(field));
    if (copiedNavigation.length) {
      issues.push({
        code: "navigation-metadata-in-content",
        entity: "sheet",
        id: sheet.id,
        message: `Sheet.content ${sheet.id} chứa metadata điều hướng: ${copiedNavigation.join(", ")}`,
      });
    }
  });

  graph.notebooks.forEach((notebook) => {
    if (!graph.sections.some((section) => section.notebookId === notebook.id)) {
      issues.push({ code: "empty-notebook", entity: "notebook", id: notebook.id, message: `Notebook ${notebook.id} phải có ít nhất một Section` });
    }
  });
  graph.pages.forEach((page) => {
    if (!graph.sheets.some((sheet) => sheet.pageId === page.id)) {
      issues.push({ code: "empty-page", entity: "page", id: page.id, message: `Page ${page.id} phải có ít nhất một Sheet` });
    }
  });

  issues.push(...orderIssues([graph.notebooks], "notebook"));
  issues.push(...orderIssues(groupByParent(graph.sections, (record) => record.notebookId), "section"));
  issues.push(...orderIssues(groupByParent(graph.pages, (record) => record.sectionId), "page"));
  issues.push(...orderIssues(groupByParent(graph.sheets, (record) => record.pageId), "sheet"));

  const active = graph.active;
  const hasNoteContent = graph.sheets.length > 0;
  if (!hasNoteContent) {
    if (active.activeNotebookId || active.activeSectionId || active.activePageId || active.activeSheetId) {
      issues.push({ code: "invalid-active-chain", entity: "active", id: active.activeSheetId, message: "Active state phải rỗng khi thư viện không có Sheet" });
    }
    return issues;
  }

  const activeNotebook = notebooks.get(active.activeNotebookId);
  const activeSection = sections.get(active.activeSectionId);
  const activePage = pages.get(active.activePageId);
  const activeSheet = sheets.get(active.activeSheetId);
  if (!activeNotebook || !activeSection || !activePage || !activeSheet
    || activeSection.notebookId !== activeNotebook.id
    || activePage.sectionId !== activeSection.id
    || activeSheet.pageId !== activePage.id) {
    issues.push({
      code: "invalid-active-chain",
      entity: "active",
      id: active.activeSheetId,
      message: "Bốn active ID phải tạo thành chuỗi Notebook → Section → Page → Sheet hợp lệ",
    });
  }
  return issues;
}

export function assertNoteGraph(graph: NoteGraph) {
  const issues = validateNoteGraph(graph);
  if (issues.length) throw new NoteInvariantError(issues);
}

export function ordered<T extends { order: number }>(records: T[]) {
  return [...records].sort((left, right) => left.order - right.order);
}

export function noteContextForSheet(graph: NoteGraph, sheetId: string): ActiveNoteState | null {
  const sheet = graph.sheets.find((record) => record.id === sheetId);
  const page = sheet && graph.pages.find((record) => record.id === sheet.pageId);
  const section = page && graph.sections.find((record) => record.id === page.sectionId);
  if (!sheet || !page || !section) return null;
  return {
    activeNotebookId: section.notebookId,
    activeSectionId: section.id,
    activePageId: page.id,
    activeSheetId: sheet.id,
  };
}
