import { readFileSync, writeFileSync } from "node:fs";

const path = "app/note-runtime-adapter.ts";
let source = readFileSync(path, "utf8");
const before = `function latestFirstAidDocument(page: NotePage) {
  const stored = normalizeFirstAidDocument(page.firstAid);
  const body = page.body ?? "";
  const bodyHtml = page.bodyHtml ?? "";
  if (hasFirstAidBlockSerialization(bodyHtml)) {
    const projected = firstAidDocumentFromLegacy(bodyHtml, body);
    return createFirstAidDocument(
      projected.blocks,
      Boolean(stored?.legacyStarter && firstAidBlocksEqual(stored, projected)),
    );
  }
  return stored ?? firstAidDocumentFromLegacy(bodyHtml, body);
}`;
const after = `function latestFirstAidDocument(page: NotePage) {
  const stored = normalizeFirstAidDocument(page.firstAid);
  const body = page.body ?? "";
  const bodyHtml = page.bodyHtml ?? "";

  // Once the editor owns a structured document, it is the source of truth.
  // body/bodyHtml may still be a one-render-old projection and must never win.
  if (stored && !stored.legacyStarter) return stored;

  if (hasFirstAidBlockSerialization(bodyHtml)) {
    const projected = firstAidDocumentFromLegacy(bodyHtml, body);
    return createFirstAidDocument(
      projected.blocks,
      Boolean(stored?.legacyStarter && firstAidBlocksEqual(stored, projected)),
    );
  }
  return stored ?? firstAidDocumentFromLegacy(bodyHtml, body);
}`;
if (!source.includes(before)) throw new Error("latestFirstAidDocument patch target not found");
source = source.replace(before, after);
writeFileSync(path, source);
