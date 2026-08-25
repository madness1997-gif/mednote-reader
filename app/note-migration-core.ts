import { assertDocumentGraph, type DocumentGraph, type DocumentRecord } from "./document-domain";
import { assertNoteStructure, assertSheetContents, ordered, type ActiveNoteState, type NoteStructure, type SheetContent, type SheetContentMap } from "./note-domain";
import { NOTE_SCHEMA_VERSION, type LibraryV6 } from "./note-repository";
import { migrateRelationV2, type LegacyRelationV2 } from "./relation-v2-migration";
import { stableHash } from "./stable-id";

export type AnyRecord = Record<string, any>;

export type MigrationReport = {
  sourceVersion: 3 | 4 | 5 | 6;
  notebookCount: number;
  sectionCount: number;
  pageCount: number;
  sheetCount: number;
  documentCount: number;
  linkCount: number;
  sheetContentHashes: Record<string, string>;
  warnings: string[];
};

export type MigrationResult = { library: LibraryV6; report: MigrationReport };

export const LEGACY_META_WORKSPACE = "__mednote_relations_v2__";
const LAZY_FLAG = "__mednoteLazyPage";
const NAVIGATION_FIELDS = new Set([
  "id", "title", "titleHtml", "pageId", "sectionId", "notebookId", "order",
  "logicalPageId", "logicalPageTitle", "sheetTitle", "sheetOrder", LAZY_FLAG,
]);

export const cloneMigrationValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizeNotebookTitle = (title: string) => title.normalize("NFKC").trim().replace(/\s+/g, " ");
const notebookTitleKey = (title: string) => normalizeNotebookTitle(title).toLocaleLowerCase("vi-VN");

export function dedupeNotebookTitles(notebooks: NoteStructure["notebooks"]) {
  const used = new Set<string>();
  return ordered(notebooks).map((notebook) => {
    const base = normalizeNotebookTitle(notebook.title) || "Sổ ghi chú";
    let title = base;
    let suffix = 2;
    while (used.has(notebookTitleKey(title))) title = `${base} (${suffix++})`;
    used.add(notebookTitleKey(title));
    return { ...notebook, title };
  });
}

export const normalizedMigrationOrder = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function stableMigrationStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMigrationStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableMigrationStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(value: SheetContent) {
  return stableHash(stableMigrationStringify(value));
}

export function stripMigrationNavigation(record: AnyRecord): SheetContent {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !NAVIGATION_FIELDS.has(key)));
}

function documentFromLegacy(record: AnyRecord): DocumentRecord {
  const { id, name, size, lastModified, available, ...payload } = record;
  return {
    id: String(id),
    name: String(name || "Tài liệu PDF"),
    size: Number(size) || 0,
    lastModified: Number(lastModified) || 0,
    available: available !== false,
    payload: cloneMigrationValue(payload),
  };
}

function collectDocuments(contexts: AnyRecord[], relation?: LegacyRelationV2) {
  const documents = new Map<string, DocumentRecord>();
  contexts.forEach((context) => (context.documents || []).forEach((record: AnyRecord) => {
    if (record?.id) documents.set(String(record.id), documentFromLegacy(record));
  }));
  (relation?.documents || []).forEach((record) => {
    if (!record?.id) return;
    const id = String(record.id);
    const current = documents.get(id);
    const next = documentFromLegacy(record);
    documents.set(id, current ? { ...next, ...current, available: record.available !== false } : next);
  });
  return [...documents.values()];
}

function buildDocumentContexts(contexts: AnyRecord[], documents: DocumentRecord[]) {
  const documentIds = new Set(documents.map((record) => record.id));
  return contexts.filter((context) => String(context.id) !== LEGACY_META_WORKSPACE).map((context) => {
    const ids = [...new Set<string>((context.documents || []).map((record: AnyRecord) => String(record.id)).filter((id: string) => documentIds.has(id)))];
    return {
      id: String(context.id),
      kind: String(context.kind || "empty"),
      name: String(context.name || "Workspace"),
      documentIds: ids,
      activeDocumentId: ids.includes(String(context.activeDocumentId || "")) ? String(context.activeDocumentId) : ids[0] || null,
      sourcePage: Number(context.sourcePage) || 1,
    };
  });
}

export function normalizeMigrationSiblingOrders<T extends { order: number }>(records: T[], parent: (record: T) => string) {
  const groups = new Map<string, T[]>();
  records.forEach((record) => {
    const id = parent(record);
    const group = groups.get(id) || [];
    group.push(record);
    groups.set(id, group);
  });
  groups.forEach((group) => group.sort((left, right) => left.order - right.order).forEach((record, index) => { record.order = index; }));
  return records;
}

export function defaultMigrationActive(notes: Omit<NoteStructure, "active">, requested: Partial<ActiveNoteState> = {}): ActiveNoteState {
  const requestedPage = notes.pages.find((record) => record.id === requested.activePageId);
  const requestedSection = notes.sections.find((record) => record.id === requested.activeSectionId);
  const requestedNotebookId = notes.notebooks.some((record) => record.id === requested.activeNotebookId) ? requested.activeNotebookId : "";
  const pageFromSection = requestedSection && ordered(notes.pages.filter((record) => record.sectionId === requestedSection.id))[0];
  const sectionFromNotebook = requestedNotebookId && ordered(notes.sections.filter((record) => record.notebookId === requestedNotebookId))[0];
  const pageFromNotebook = sectionFromNotebook && ordered(notes.pages.filter((record) => record.sectionId === sectionFromNotebook.id))[0];
  const fallbackPage = requestedPage || pageFromSection || pageFromNotebook;
  const requestedSheet = notes.sheets.find((record) => record.id === requested.activeSheetId);
  const sheet = requestedSheet || (fallbackPage && ordered(notes.sheets.filter((record) => record.pageId === fallbackPage.id))[0]) || notes.sheets[0];
  const page = sheet && notes.pages.find((record) => record.id === sheet.pageId);
  const section = page && notes.sections.find((record) => record.id === page.sectionId);
  if (!sheet || !page || !section) return { activeNotebookId: "", activeSectionId: "", activePageId: "", activeSheetId: "" };
  return { activeNotebookId: section.notebookId, activeSectionId: section.id, activePageId: page.id, activeSheetId: sheet.id };
}

export function finishMigratedLibrary(
  notes: Omit<NoteStructure, "active"> & { active?: ActiveNoteState },
  sheetContents: SheetContentMap,
  contexts: AnyRecord[],
  relation: LegacyRelationV2 | undefined,
  existingLinks: AnyRecord[],
  preferences: LibraryV6["preferences"],
  savedAt: number,
  warnings: string[],
) {
  const noteStructure: NoteStructure = { ...notes, notebooks: dedupeNotebookTitles(notes.notebooks), active: notes.active || defaultMigrationActive(notes) };
  const documents = collectDocuments(contexts, relation);
  const documentContexts = buildDocumentContexts(contexts, documents);
  const normalizedRelations = migrateRelationV2(noteStructure, documents, existingLinks, relation);
  warnings.push(...normalizedRelations.warnings);
  const documentGraph: DocumentGraph = {
    documents,
    contexts: documentContexts,
    groups: normalizedRelations.groups,
    links: normalizedRelations.links,
    linkRelations: normalizedRelations.linkRelations,
  };
  assertNoteStructure(noteStructure);
  assertSheetContents(noteStructure, sheetContents);
  assertDocumentGraph(documentGraph, noteStructure);
  return {
    version: NOTE_SCHEMA_VERSION,
    notes: noteStructure,
    sheetContents,
    documents: documentGraph,
    preferences,
    savedAt,
  } satisfies LibraryV6;
}

export function migrationReport(sourceVersion: 3 | 4 | 5 | 6, library: LibraryV6, warnings: string[] = []): MigrationReport {
  return {
    sourceVersion,
    notebookCount: library.notes.notebooks.length,
    sectionCount: library.notes.sections.length,
    pageCount: library.notes.pages.length,
    sheetCount: library.notes.sheets.length,
    documentCount: library.documents.documents.length,
    linkCount: library.documents.links.length,
    sheetContentHashes: Object.fromEntries(library.notes.sheets.map((sheet) => [sheet.id, contentHash(library.sheetContents[sheet.id])])),
    warnings,
  };
}
