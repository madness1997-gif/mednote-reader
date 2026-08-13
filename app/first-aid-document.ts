import { blockPlainText, type FirstAidBlock } from "./first-aid-block-domain";
import {
  hasFirstAidBlockSerialization,
  isLegacyFirstAidStarterContent,
  parseBlocks,
  serializeBlocks,
} from "./first-aid-block-codec";
import { firstAidBlocksToStandardRichText } from "./first-aid-block-renderer";
import { sanitizeRichTextHtml } from "./rich-text-html";

export const FIRST_AID_DOCUMENT_VERSION = 1 as const;

export type FirstAidDocument = {
  version: typeof FIRST_AID_DOCUMENT_VERSION;
  blocks: FirstAidBlock[];
  legacyStarter?: true;
};

export function createFirstAidDocument(blocks: FirstAidBlock[] = [], legacyStarter = false): FirstAidDocument {
  return {
    version: FIRST_AID_DOCUMENT_VERSION,
    blocks,
    ...(legacyStarter ? { legacyStarter: true as const } : {}),
  };
}

export function normalizeFirstAidDocument(value: unknown): FirstAidDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { version?: unknown; blocks?: unknown; legacyStarter?: unknown };
  if (candidate.version !== FIRST_AID_DOCUMENT_VERSION || !Array.isArray(candidate.blocks)) return null;
  return createFirstAidDocument(candidate.blocks as FirstAidBlock[], candidate.legacyStarter === true);
}

export function firstAidDocumentFromLegacy(html: string, plainText: string, legacyStarter = false) {
  return createFirstAidDocument(parseBlocks(html, plainText), legacyStarter);
}

export function firstAidDocumentPlainText(document: FirstAidDocument) {
  return document.blocks.map(blockPlainText).filter(Boolean).join("\n\n");
}

/**
 * Runtime/editor projection only. The v4 comment remains readable during the
 * FA3 migration, but this HTML is never the canonical SheetContent payload.
 */
export function firstAidDocumentProjectionHtml(document: FirstAidDocument) {
  return serializeBlocks(document.blocks);
}

export function firstAidDocumentStandardRichText(document: FirstAidDocument) {
  return firstAidBlocksToStandardRichText(document.blocks);
}

export type ResolvedFirstAidDocument = {
  document: FirstAidDocument | null;
  source: "stored" | "legacy-payload" | "template-migration" | "none";
};

export function resolveFirstAidDocument(
  stored: unknown,
  html: string,
  plainText: string,
  templateIsFirstAid: boolean,
): ResolvedFirstAidDocument {
  const normalized = normalizeFirstAidDocument(stored);
  if (normalized) return { document: normalized, source: "stored" };
  if (hasFirstAidBlockSerialization(html)) {
    return {
      document: firstAidDocumentFromLegacy(html, plainText),
      source: "legacy-payload",
    };
  }
  if (!templateIsFirstAid) return { document: null, source: "none" };
  const legacyStarter = isLegacyFirstAidStarterContent(html, plainText);
  return {
    document: firstAidDocumentFromLegacy(html, plainText, legacyStarter),
    source: "template-migration",
  };
}

export function firstAidDocumentMatchesRegularProjection(
  document: FirstAidDocument,
  html: string,
  plainText: string,
) {
  const expectedHtml = sanitizeRichTextHtml(firstAidDocumentStandardRichText(document)).trim();
  const actualHtml = sanitizeRichTextHtml(html).trim();
  return actualHtml === expectedHtml && plainText.trim() === firstAidDocumentPlainText(document).trim();
}
