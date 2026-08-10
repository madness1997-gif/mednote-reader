import type { DocumentGraph } from "./document-domain";
import type { SheetContent } from "./note-domain";

export type RuntimeDocumentSource = {
  id: string;
  name: string;
};

export type DocumentSourceExcerpt<TRect = unknown> = {
  sourceKind?: "pdf" | "manual";
  documentId?: string;
  documentName?: string;
  page?: number;
  rect?: TRect;
};

export type ResolvedDocumentSource<TRect = unknown> = {
  documentId: string | null;
  displayName: string;
  page: number | null;
  rect?: TRect;
  available: boolean;
};

export function resolveDocumentSource<TRect = unknown>(
  excerpt: DocumentSourceExcerpt<TRect>,
  graph: Pick<DocumentGraph, "documents">,
  runtimeDocuments: readonly RuntimeDocumentSource[] = [],
): ResolvedDocumentSource<TRect> | null {
  if (excerpt.sourceKind === "manual") return null;
  const documentId = excerpt.documentId?.trim() || null;
  const historicalName = excerpt.documentName?.trim() || "PDF đã xóa";
  if (!documentId) {
    return {
      documentId: null,
      displayName: historicalName,
      page: excerpt.page ?? null,
      rect: excerpt.rect,
      available: false,
    };
  }
  const document = graph.documents.find((record) => record.id === documentId);
  if (document) {
    return {
      documentId,
      displayName: document.name,
      page: excerpt.page ?? null,
      rect: excerpt.rect,
      available: document.available !== false,
    };
  }
  const runtime = runtimeDocuments.find((record) => record.id === documentId);
  if (runtime) {
    return {
      documentId,
      displayName: runtime.name,
      page: excerpt.page ?? null,
      rect: excerpt.rect,
      available: true,
    };
  }
  return {
    documentId,
    displayName: historicalName,
    page: excerpt.page ?? null,
    rect: excerpt.rect,
    available: false,
  };
}

export function remapDocumentReferencesInContent(
  content: SheetContent,
  idMap: ReadonlyMap<string, string>,
): { content: SheetContent; changed: boolean } {
  if (!idMap.size || !Array.isArray(content.excerpts)) return { content, changed: false };
  let changed = false;
  const excerpts = content.excerpts.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const excerpt = value as Record<string, unknown>;
    const documentId = typeof excerpt.documentId === "string" ? excerpt.documentId : "";
    const nextId = documentId ? idMap.get(documentId) : undefined;
    if (!nextId || nextId === documentId) return value;
    changed = true;
    return { ...excerpt, documentId: nextId };
  });
  return changed ? { content: { ...content, excerpts }, changed: true } : { content, changed: false };
}
