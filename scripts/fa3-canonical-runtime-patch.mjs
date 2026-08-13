import { readFileSync, writeFileSync } from "node:fs";

function patch(path, transforms) {
  let source = readFileSync(path, "utf8");
  for (const [label, pattern, replacement] of transforms) {
    const next = source.replace(pattern, replacement);
    if (next === source) throw new Error(`${path}: missing patch target ${label}`);
    source = next;
  }
  writeFileSync(path, source);
}

patch("app/ui/note-stage.tsx", [
  [
    "document helper import",
    'import { regularTemplateRichText, stripFirstAidBlockMetadata } from "../first-aid-block-model";',
    'import { createFirstAidDocument, regularTemplateRichText, stripFirstAidBlockMetadata } from "../first-aid-block-model";',
  ],
  [
    "First Aid editor document prop",
    /(<FirstAidBlockEditor key=\{activeNote\.id\} )html=\{activeNote\.bodyHtml \?\? ""\} plainText=\{activeNote\.body\}/,
    '$1document={activeNote.firstAid ?? createFirstAidDocument()}',
  ],
  [
    "First Aid editor structured change",
    'onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml, body })}',
    'onChange={(firstAid) => updateActiveNote({ firstAid })}',
  ],
  [
    "regular editor invalidates dormant First Aid",
    'onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml: stripFirstAidBlockMetadata(bodyHtml), body })}',
    'onChange={(bodyHtml, body) => updateActiveNote({ bodyHtml: stripFirstAidBlockMetadata(bodyHtml), body, firstAid: undefined })}',
  ],
]);

patch("app/ui/note-sheet-preview.tsx", [
  [
    "First Aid projection import",
    'import { regularTemplateRichText } from "../first-aid-block-model";',
    'import { firstAidDocumentProjectionHtml, regularTemplateRichText } from "../first-aid-block-model";',
  ],
  [
    "First Aid preview projection",
    'note.paper.template === "first-aid" ? note.bodyHtml ?? plainTextToRichHtml(note.body) : regularTemplateRichText(note.bodyHtml ?? plainTextToRichHtml(note.body), note.body)',
    'note.paper.template === "first-aid" ? firstAidDocumentProjectionHtml(note.firstAid) : regularTemplateRichText(note.bodyHtml ?? plainTextToRichHtml(note.body), note.body)',
  ],
]);

patch("app/page.tsx", [
  [
    "First Aid document imports",
    'import { regularTemplateRichText } from "./first-aid-block-model";',
    'import { firstAidDocumentFromLegacy, firstAidDocumentPlainText, firstAidDocumentStandardRichText, normalizeFirstAidDocument } from "./first-aid-block-model";',
  ],
  [
    "leave First Aid from document",
    '...(leavingFirstAid ? { bodyHtml: regularTemplateRichText(activeNote.bodyHtml ?? "", activeNote.body) } : {}),',
    '...(leavingFirstAid ? { body: firstAidDocumentPlainText(activeNote.firstAid), bodyHtml: firstAidDocumentStandardRichText(activeNote.firstAid) } : {}),',
  ],
  [
    "enter First Aid with document",
    /(paper: \{ \.\.\.activeNote\.paper, size: "a4", orientation: "portrait", template: "first-aid", color: "white" \},\s*\n\s*text: \{ \.\.\.activeNote\.text, font: "times", size: 12, align: "left" \},)/,
    '$1\n      firstAid: normalizeFirstAidDocument(activeNote.firstAid) ?? firstAidDocumentFromLegacy(activeNote.bodyHtml ?? "", activeNote.body),',
  ],
]);
