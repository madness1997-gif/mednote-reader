import type { PaperTemplate } from "./note-runtime-adapter";
import {
  hasFirstAidBlockSerialization,
  isLegacyFirstAidStarterContent,
  parseBlocks,
} from "./first-aid-block-codec";
import { firstAidBlocksToStandardRichText } from "./first-aid-block-renderer";

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
};

/**
 * Template-specific projection boundary. Canonical First Aid blocks are owned
 * by NotePage.firstAid / SheetContent.firstAid, not by this HTML conversion.
 */
export function firstAidTemplateTransition(input: FirstAidTemplateTransitionInput): { bodyHtml?: string } {
  if (input.currentTemplate !== "first-aid" || input.nextTemplate === "first-aid") return {};
  return { bodyHtml: regularTemplateRichText(input.bodyHtml, input.body) };
}
