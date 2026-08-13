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
};

export function createFirstAidDocument(blocks: FirstAidBlock[] = []): FirstAidDocument {
  return { version: FIRST_AID_DOCUMENT_VERSION, blocks };
}

export function normalizeFirstAidDocument(value: unknown): FirstAidDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { version?: unknown; blocks?: unknown };
  if (candidate.version !== FIRST_AID_DOCUMENT_VERSION || !Array.isArray(candidate.blocks)) return null;
  return createFirstAidDocument(candidate.blocks as FirstAidBlock[]);
}

export function firstAidDocumentFromLegacy(html: string, plainText: string) {
  return createFirstAidDocument(parseBlocks(html, plainText));
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
  untouchedLegacyStarter: boolean;
};

export function resolveFirstAidDocument(
  stored: unknown,
  html: string,
  plainText: string,
  templateIsFirstAid: boolean,
): ResolvedFirstAidDocument {
  const normalized = normalizeFirstAidDocument(stored);
  if (normalized) return { document: normalized, source: "stored", untouchedLegacyStarter: false };
  const legacyPayload = hasFirstAidBlockSerialization(html);
  if (legacyPayload) {
    return {
      document: firstAidDocumentFromLegacy(html, plainText),
      source: "legacy-payload",
      untouchedLegacyStarter: false,
    };
  }
  if (!templateIsFirstAid) return { document: null, source: "none", untouchedLegacyStarter: false };
  return {
    document: firstAidDocumentFromLegacy(html, plainText),
    source: "template-migration",
    untouchedLegacyStarter: isLegacyFirstAidStarterContent(html, plainText),
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
