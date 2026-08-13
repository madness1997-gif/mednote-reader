import type { PaperTemplate } from "./note-runtime-adapter";
import {
  firstAidPayloadComment,
  hasFirstAidBlockSerialization,
  isLegacyFirstAidStarterContent,
  parseBlocks,
} from "./first-aid-block-codec";
import { firstAidBlocksToStandardRichText } from "./first-aid-block-renderer";

/** Convert persisted First Aid content to semantic rich text for regular paper. */
export function firstAidToStandardRichText(html: string, plainText: string) {
  return firstAidBlocksToStandardRichText(parseBlocks(html, plainText));
}

/**
 * Preserve the v4 payload as an invisible comment until regular rich text is
 * actually edited. This keeps a template toggle reversible without letting the
 * First Aid static rendering leak onto ordinary paper.
 */
export function regularTemplateRichText(html: string, plainText: string) {
  if (isLegacyFirstAidStarterContent(html, plainText)) return "";
  if (!hasFirstAidBlockSerialization(html)) return html;
  return `${firstAidToStandardRichText(html, plainText)}${firstAidPayloadComment(html)}`;
}

export type FirstAidTemplateTransitionInput = {
  currentTemplate: PaperTemplate;
  nextTemplate: PaperTemplate;
  bodyHtml: string;
  body: string;
};

/**
 * Template-specific content transition boundary. React callers only apply the
 * returned patch; they do not need to know how First Aid serialization works.
 */
export function firstAidTemplateTransition(input: FirstAidTemplateTransitionInput): { bodyHtml?: string } {
  if (input.currentTemplate !== "first-aid" || input.nextTemplate === "first-aid") return {};
  return { bodyHtml: regularTemplateRichText(input.bodyHtml, input.body) };
}
