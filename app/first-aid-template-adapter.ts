import type { PaperTemplate } from "./note-runtime-adapter";
import {
  hasFirstAidBlockSerialization,
  isLegacyFirstAidStarterContent,
  parseBlocks,
} from "./first-aid-block-codec";
import { firstAidBlocksToStandardRichText } from "./first-aid-block-renderer";
import {
  firstAidDocumentFromLegacy,
  firstAidDocumentMatchesRegularProjection,
  firstAidDocumentPlainText,
  firstAidDocumentStandardRichText,
  normalizeFirstAidDocument,
  type FirstAidDocument,
} from "./first-aid-document";

/** Convert a legacy/runtime First Aid HTML projection to semantic rich text. */
export function firstAidToStandardRichText(html: string, plainText: string) {
  return firstAidBlocksToStandardRichText(parseBlocks(html, plainText));
}

/**
 * Regular paper no longer carries an invisible First Aid payload in HTML.
 * FA3 keeps the reversible block document as structured SheetContent instead.
 */
export function regularTemplateRichText(html: string, plainText: string) {
  if (isLegacyFirstAidStarterContent(html, plainText)) return "";
  if (!hasFirstAidBlockSerialization(html)) return html;
  return firstAidToStandardRichText(html, plainText);
}

export type FirstAidTemplateTransitionInput = {
  currentTemplate: PaperTemplate;
  nextTemplate: PaperTemplate;
  bodyHtml: string;
  body: string;
  firstAid?: unknown;
};

export type FirstAidTemplateTransitionResult = {
  body?: string;
  bodyHtml?: string;
  firstAid?: FirstAidDocument;
};

/**
 * Own the reversible template transition semantics.
 *
 * First Aid -> regular:
 * - project the canonical document to ordinary semantic rich text;
 * - keep the structured document dormant only while that projection is untouched.
 *
 * Regular -> First Aid:
 * - reuse a dormant document only when the regular body still exactly represents it;
 * - if the regular body changed, import that active content into a new First Aid document
 *   instead of resurrecting stale dormant blocks.
 */
export function firstAidTemplateTransition(input: FirstAidTemplateTransitionInput): FirstAidTemplateTransitionResult {
  if (input.currentTemplate === input.nextTemplate) return {};

  if (input.currentTemplate === "first-aid" && input.nextTemplate !== "first-aid") {
    const document = normalizeFirstAidDocument(input.firstAid)
      ?? firstAidDocumentFromLegacy(input.bodyHtml, input.body);

    // Legacy starter placeholders are not user content and must not become a
    // dormant document on a regular sheet.
    if (document.legacyStarter) return { body: "", bodyHtml: "", firstAid: undefined };

    return {
      body: firstAidDocumentPlainText(document),
      bodyHtml: firstAidDocumentStandardRichText(document),
      firstAid: document,
    };
  }

  if (input.currentTemplate !== "first-aid" && input.nextTemplate === "first-aid") {
    const dormant = normalizeFirstAidDocument(input.firstAid);
    const dormantStillRepresentsActiveBody = Boolean(
      dormant
      && !dormant.legacyStarter
      && firstAidDocumentMatchesRegularProjection(dormant, input.bodyHtml, input.body),
    );

    return {
      firstAid: dormantStillRepresentsActiveBody
        ? dormant!
        : firstAidDocumentFromLegacy(input.bodyHtml, input.body),
    };
  }

  return {};
}
