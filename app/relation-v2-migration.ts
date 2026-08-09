import type { DocumentGraph, DocumentLinkRelation, DocumentRecord, NoteDocumentLink } from "./document-domain";
import { ordered, type NoteStructure } from "./note-domain";
import type { LibraryV6 } from "./note-repository";

export type LegacyRelationV2 = {
  version: 2;
  documents?: Record<string, any>[];
  groups?: Record<string, any>[];
  notebooks?: Record<string, any>[];
  relations?: Record<string, any>[];
  migratedLegacyV1?: boolean;
  updatedAt?: number;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

export function stableMigrationId(prefix: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function normalizeGroups(relation: LegacyRelationV2 | undefined, documents: DocumentRecord[]) {
  const documentIds = new Set(documents.map((record) => record.id));
  return (relation?.groups || []).map((group) => ({
    id: String(group.id),
    name: String(group.name || "Nhóm tài liệu"),
    documentIds: [...new Set<string>((group.documentIds || []).map(String).filter((id: string) => documentIds.has(id)))],
    createdAt: Number(group.createdAt) || 0,
    updatedAt: Number(group.updatedAt) || 0,
  }));
}

function resolveRelationTarget(target: Record<string, any>, notes: NoteStructure) {
  const sheetToPage = new Map(notes.sheets.map((sheet) => [sheet.id, sheet.pageId]));
  const pageIds = new Set(notes.pages.map((page) => page.id));
  const sheetIds = new Set(notes.sheets.map((sheet) => sheet.id));
  const requestedId = String(target.id || "").replace(/^sheet:/, "");
  if (target.scope === "sheet" || String(target.id || "").startsWith("sheet:") || (target.type === "block" && target.pageId)) {
    const sheetId = String(target.pageId || requestedId).replace(/^sheet:/, "");
    if (sheetIds.has(sheetId)) return { targetType: "sheet" as const, targetId: sheetId };
  }
  const logicalId = String(target.logicalPageId || "");
  if (logicalId && pageIds.has(logicalId)) return { targetType: "page" as const, targetId: logicalId };
  if (pageIds.has(requestedId)) return { targetType: "page" as const, targetId: requestedId };
  const physicalPageId = sheetToPage.get(String(target.pageId || requestedId));
  if (physicalPageId) return { targetType: "page" as const, targetId: physicalPageId };

  const targetSectionId = target.type === "section" ? String(target.sectionId || target.id || "") : String(target.sectionId || "");
  const targetNotebookId = String(target.notebookId || (target.type === "notebook" ? target.id : "") || "");
  const page = ordered(notes.pages.filter((record) => (!targetSectionId || record.sectionId === targetSectionId)
    && notes.sections.some((section) => section.id === record.sectionId && (!targetNotebookId || section.notebookId === targetNotebookId))))[0];
  return page ? { targetType: "page" as const, targetId: page.id } : null;
}

export function migrateRelationV2(
  notes: NoteStructure,
  documents: DocumentRecord[],
  existingLinks: Record<string, any>[],
  relation?: LegacyRelationV2,
): Pick<DocumentGraph, "groups" | "links" | "linkRelations"> & { warnings: string[] } {
  const groups = normalizeGroups(relation, documents);
  const warnings: string[] = [];
  const documentIds = new Set(documents.map((record) => record.id));
  const pageIds = new Set(notes.pages.map((record) => record.id));
  const sheetIds = new Set(notes.sheets.map((record) => record.id));
  const links = new Map<string, NoteDocumentLink>();
  const tupleToId = new Map<string, string>();
  const addLink = (record: NoteDocumentLink, sourceLabel: string) => {
    if (!documentIds.has(record.documentId)) {
      warnings.push(`${sourceLabel}: không tìm thấy Document ${record.documentId}`);
      return "";
    }
    if (record.targetType === "page" ? !pageIds.has(record.targetId) : !sheetIds.has(record.targetId)) {
      warnings.push(`${sourceLabel}: không tìm thấy ${record.targetType} ${record.targetId}`);
      return "";
    }
    const tuple = `${record.documentId}:${record.targetType}:${record.targetId}`;
    const existingId = tupleToId.get(tuple);
    if (existingId) return existingId;
    links.set(record.id, record);
    tupleToId.set(tuple, record.id);
    return record.id;
  };
  existingLinks.forEach((record) => addLink({
    id: String(record.id || stableMigrationId("note-document-link", `${record.documentId}:${record.targetType}:${record.targetId}`)),
    documentId: String(record.documentId),
    targetType: record.targetType === "sheet" ? "sheet" : "page",
    targetId: String(record.targetId),
  }, `Core link ${record.id || "(không ID)"}`));

  const groupDocuments = new Map(groups.map((group) => [group.id, group.documentIds]));
  const linkRelations: DocumentLinkRelation[] = [];
  (relation?.relations || []).forEach((legacy) => {
    const sourceType = legacy.source?.type === "group" ? "group" : "document";
    const sourceId = String(legacy.source?.id || "");
    const sourceIds = sourceType === "group" ? groupDocuments.get(sourceId) || [] : [sourceId];
    const target = resolveRelationTarget(legacy.target || {}, notes);
    if (!sourceIds.length) {
      warnings.push(`Relation ${legacy.id || "(không ID)"}: nguồn ${sourceType} ${sourceId} không có Document`);
      return;
    }
    if (!target) {
      warnings.push(`Relation ${legacy.id || "(không ID)"}: không resolve được target ${legacy.target?.type || "unknown"}:${legacy.target?.id || ""}`);
      return;
    }
    const linkIds = sourceIds.map((documentId) => addLink({
      id: stableMigrationId("note-document-link", `${documentId}:${target.targetType}:${target.targetId}`),
      documentId,
      ...target,
    }, `Relation ${legacy.id || "(không ID)"}`)).filter(Boolean);
    if (!linkIds.length) return;
    linkRelations.push({
      id: String(legacy.id || stableMigrationId("document-link-relation", `${sourceType}:${sourceId}:${linkIds.join(",")}`)),
      linkIds: [...new Set(linkIds)],
      kind: legacy.kind === "content" ? "content" : "workspace",
      sourceType,
      sourceId,
      legacyTargetType: ["notebook", "section", "page", "block"].includes(legacy.target?.type) ? legacy.target.type : undefined,
      legacyTargetId: legacy.target?.id ? String(legacy.target.id) : undefined,
      isDefault: legacy.kind === "workspace" ? Boolean(legacy.isDefault) : undefined,
      createdAt: Number(legacy.createdAt) || 0,
      updatedAt: Number(legacy.updatedAt) || 0,
      lastOpenedAt: Number.isFinite(Number(legacy.lastOpenedAt)) ? Number(legacy.lastOpenedAt) : undefined,
      workspacePreset: legacy.kind === "workspace" && legacy.snapshot ? clone(legacy.snapshot) : undefined,
      contentAnchor: legacy.kind === "content" && legacy.locator ? clone(legacy.locator) : undefined,
    });
  });
  return { groups, links: [...links.values()], linkRelations, warnings: [...new Set(warnings)] };
}

export function relationV2FromV6(library: LibraryV6): LegacyRelationV2 {
  const pages = new Map(library.notes.pages.map((record) => [record.id, record]));
  const sections = new Map(library.notes.sections.map((record) => [record.id, record]));
  const links = new Map(library.documents.links.map((record) => [record.id, record]));
  const notebooks = ordered(library.notes.notebooks).map((notebook) => {
    const notebookSections = ordered(library.notes.sections.filter((section) => section.notebookId === notebook.id));
    return {
      id: notebook.id,
      title: notebook.title,
      workspaceId: `relation-note:${notebook.id}`,
      sections: notebookSections.map((section) => ({
        id: section.id,
        title: section.title,
        pageIds: ordered(library.notes.pages.filter((page) => page.sectionId === section.id))
          .flatMap((page) => ordered(library.notes.sheets.filter((sheet) => sheet.pageId === page.id)).map((sheet) => sheet.id)),
        createdAt: 0,
        updatedAt: library.savedAt,
      })),
      activeSectionId: notebookSections.some((section) => section.id === library.notes.active.activeSectionId) ? library.notes.active.activeSectionId : notebookSections[0]?.id || "",
      available: true,
      updatedAt: library.savedAt,
    };
  });
  const targetFor = (link: NoteDocumentLink, detail?: DocumentLinkRelation) => {
    const page = link.targetType === "page" ? pages.get(link.targetId) : pages.get(library.notes.sheets.find((sheet) => sheet.id === link.targetId)?.pageId || "");
    const section = page && sections.get(page.sectionId);
    const sheetId = link.targetType === "sheet" ? link.targetId : ordered(library.notes.sheets.filter((sheet) => sheet.pageId === page?.id))[0]?.id;
    return {
      type: detail?.legacyTargetType === "block" ? "block" : "page",
      id: detail?.legacyTargetType === "block" && detail.legacyTargetId ? detail.legacyTargetId : link.targetType === "sheet" ? `sheet:${link.targetId}` : page?.id,
      notebookId: section?.notebookId,
      sectionId: section?.id,
      pageId: sheetId,
      logicalPageId: page?.id,
      scope: link.targetType,
    };
  };
  const relations: Record<string, any>[] = library.documents.linkRelations.map((detail) => {
    const link = detail.linkIds.map((id) => links.get(id)).find(Boolean)!;
    const base = { id: detail.id, kind: detail.kind, source: { type: detail.sourceType, id: detail.sourceId }, target: targetFor(link, detail), createdAt: detail.createdAt, updatedAt: detail.updatedAt };
    return detail.kind === "content"
      ? { ...base, locator: clone(detail.contentAnchor || {}) }
      : { ...base, isDefault: Boolean(detail.isDefault), lastOpenedAt: detail.lastOpenedAt, snapshot: clone(detail.workspacePreset || {}) };
  });
  const relationIds = new Set(relations.map((record) => record.id));
  library.documents.links.filter((link) => !library.documents.linkRelations.some((detail) => detail.linkIds.includes(link.id))).forEach((link) => {
    const id = stableMigrationId("relation", link.id);
    if (!relationIds.has(id)) relations.push({ id, kind: "workspace", source: { type: "document", id: link.documentId }, target: targetFor(link), isDefault: false, lastOpenedAt: undefined, createdAt: library.savedAt, updatedAt: library.savedAt, snapshot: {} });
  });
  return {
    version: 2,
    documents: library.documents.documents.map((record) => ({ ...clone(record.payload), id: record.id, name: record.name, size: record.size, lastModified: record.lastModified, available: record.available })),
    groups: clone(library.documents.groups),
    notebooks,
    relations,
    updatedAt: library.savedAt,
  };
}
