import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBlock,
  firstAidToStandardRichText,
  parseBlocks,
  regularTemplateRichText,
  serializeBlocks,
  stripFirstAidBlockMetadata,
} from "../app/first-aid-block-model";

test("leaving First Aid removes block rendering while preserving ordered content", () => {
  const heading = { ...createBlock("heading"), title: "SUY GIÁP", titleHtml: "<b>SUY GIÁP</b>" };
  const label = { ...createBlock("label"), label: "ĐIỀU TRỊ", text: "Levothyroxine", textHtml: "<i>Levothyroxine</i>" };
  const serialized = serializeBlocks([heading, label]);
  const standard = firstAidToStandardRichText(serialized, "SUY GIÁP\n\nĐIỀU TRỊ\nLevothyroxine");

  assert.doesNotMatch(standard, /data-mednote-first-aid|mednote-first-aid:/);
  assert.doesNotMatch(standard, /grid-template-columns|--fa-/);
  assert.match(standard, /SUY GIÁP/);
  assert.match(standard, /ĐIỀU TRỊ/);
  assert.match(standard, /<i>Levothyroxine<\/i>/);
  assert.ok(standard.indexOf("SUY GIÁP") < standard.indexOf("ĐIỀU TRỊ"));
  const regular = regularTemplateRichText(serialized, "fallback");
  assert.match(regular, /<!--mednote-first-aid:/);
  assert.equal(stripFirstAidBlockMetadata(regular), standard);
  assert.deepEqual(parseBlocks(regular, "fallback").map((block) => block.type), ["heading", "label"]);
  assert.equal(regularTemplateRichText("<div>Ghi chú thường</div>", "fallback"), "<div>Ghi chú thường</div>");
});

test("paper template transition owns the First Aid to rich-text conversion", async () => {
  const [page, stage, preview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-sheet-preview.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /activeNote\.paper\.template === "first-aid"/);
  assert.match(page, /regularTemplateRichText\(activeNote\.bodyHtml \?\? "", activeNote\.body\)/);
  assert.match(stage, /regularTemplateRichText/);
  assert.match(stage, /stripFirstAidBlockMetadata/);
  assert.match(preview, /regularTemplateRichText/);
});

test("Drive OAuth uses least-privilege shared-file scope", async () => {
  const [web, desktop] = await Promise.all([
    readFile(new URL("../app/google-drive.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  for (const source of [web, desktop]) {
    assert.match(source, /auth\/drive\.file/);
    assert.doesNotMatch(source, /auth\/drive["']/);
  }
});
