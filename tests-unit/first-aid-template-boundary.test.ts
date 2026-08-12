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
import { createBlankPage } from "../app/note-runtime-adapter";

test("new notes and empty First Aid editors never seed instructional content", () => {
  const page = createBlankPage();
  assert.equal(page.title, "GHI CHÚ 1");
  assert.equal(page.body, "");
  assert.equal(page.bodyHtml, "");
  assert.deepEqual(parseBlocks("", ""), []);
  assert.deepEqual(parseBlocks(serializeBlocks([]), ""), []);

  for (const type of ["heading", "label", "text", "figure", "figure-text", "table", "flow", "pearl"] as const) {
    const block = createBlock(type);
    assert.equal(blockPlainValues(block).join(""), "");
  }
});

function blockPlainValues(block: ReturnType<typeof createBlock>) {
  return [block.title, block.label, block.text, block.caption, ...(block.rows?.flat() ?? []), ...(block.steps ?? [])].filter((value): value is string => typeof value === "string");
}

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

test("legacy untouched First Aid starter text stays off regular paper", () => {
  const starterText = "TỔNG QUAN\nYẾU TỐ NGUY CƠ\nCƠ CHẾ\nLÂM SÀNG\nCHẨN ĐOÁN\nĐIỀU TRỊ\nPEARL";
  const starterHtml = [
    "<table>",
    "<tr><th>TỔNG QUAN</th><td>Viết định nghĩa hoặc thông điệp cốt lõi tại đây.</td></tr>",
    "<tr><th>YẾU TỐ NGUY CƠ</th><td>Yếu tố có thể thay đổi<br>Yếu tố không thể thay đổi</td></tr>",
    "<tr><th>CƠ CHẾ</th><td>Nguyên nhân → cơ chế trung gian → biểu hiện.</td></tr>",
    "<tr><th>LÂM SÀNG</th><td>Triệu chứng, dấu hiệu và hình ảnh then chốt.</td></tr>",
    "<tr><th>CHẨN ĐOÁN</th><td>Xét nghiệm đầu tay → xác nhận → phân tầng.</td></tr>",
    "<tr><th>ĐIỀU TRỊ</th><td>Điều trị nền tảng, thuốc chính và theo dõi.</td></tr>",
    "<tr><th>PEARL</th><td>Điểm dễ nhầm hoặc mẹo nhớ.</td></tr>",
    "</table>",
  ].join("");

  assert.equal(regularTemplateRichText(starterHtml, starterText), "");
  assert.equal(
    regularTemplateRichText(starterHtml, `${starterText}\nNội dung người dùng`),
    starterHtml,
  );
});

test("paper template transition owns the First Aid to rich-text conversion", async () => {
  const [page, stage, preview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-sheet-preview.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /activeNote\.paper\.template === "first-aid"/);
  assert.match(page, /regularTemplateRichText\(activeNote\.bodyHtml \?\? "", activeNote\.body\)/);
  assert.doesNotMatch(page, /FIRST_AID_TEMPLATE_(?:HTML|TEXT)|shouldSeed|TÊN CHỦ ĐỀ/);
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
