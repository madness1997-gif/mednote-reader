import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlock,
  createFirstAidDocument,
  firstAidDocumentPlainText,
  firstAidDocumentProjectionHtml,
  firstAidToStandardRichText,
  parseBlocks,
  regularTemplateRichText,
  serializeBlocks,
} from "../app/first-aid-block-model";
import { createBlankPage, normalizePage, notePageToSheetContent } from "../app/note-runtime-adapter";

test("new First Aid notes start with a canonical document and persist no duplicate body fields", () => {
  const page = createBlankPage();
  assert.equal(page.title, "GHI CHÚ 1");
  assert.equal(page.body, "");
  assert.equal(page.bodyHtml, "");
  assert.equal(page.firstAid?.version, 1);
  assert.deepEqual(page.firstAid?.blocks, []);
  assert.deepEqual(parseBlocks("", ""), []);
  assert.deepEqual(parseBlocks(serializeBlocks([]), ""), []);

  const persisted = notePageToSheetContent(page) as Record<string, unknown>;
  assert.deepEqual((persisted.firstAid as { blocks: unknown[] }).blocks, []);
  assert.equal(Object.hasOwn(persisted, "body"), false);
  assert.equal(Object.hasOwn(persisted, "bodyHtml"), false);

  for (const type of ["heading", "label", "text", "figure", "figure-text", "table", "flow", "pearl"] as const) {
    const block = createBlock(type);
    assert.equal(blockPlainValues(block).join(""), "");
  }
});

function blockPlainValues(block: ReturnType<typeof createBlock>) {
  return [block.title, block.label, block.text, block.caption, ...(block.rows?.flat() ?? []), ...(block.steps ?? [])].filter((value): value is string => typeof value === "string");
}

test("legacy v4 First Aid payloads lazily migrate to canonical document storage", () => {
  const heading = { ...createBlock("heading"), title: "SUY GIÁP", titleHtml: "<b>SUY GIÁP</b>" };
  const label = { ...createBlock("label"), label: "ĐIỀU TRỊ", text: "Levothyroxine", textHtml: "<i>Levothyroxine</i>" };
  const serialized = serializeBlocks([heading, label]);
  const legacy = createBlankPage();
  legacy.firstAid = undefined;
  legacy.body = "SUY GIÁP\n\nĐIỀU TRỊ\nLevothyroxine";
  legacy.bodyHtml = serialized;

  const migrated = normalizePage(legacy);
  assert.equal(migrated.firstAid?.version, 1);
  assert.deepEqual(migrated.firstAid?.blocks.map((block) => block.type), ["heading", "label"]);
  assert.match(migrated.bodyHtml ?? "", /mednote-first-aid:/);

  const persisted = notePageToSheetContent(migrated) as Record<string, unknown>;
  assert.equal(Object.hasOwn(persisted, "body"), false);
  assert.equal(Object.hasOwn(persisted, "bodyHtml"), false);
  assert.deepEqual((persisted.firstAid as { blocks: { type: string }[] }).blocks.map((block) => block.type), ["heading", "label"]);
});

test("canonical First Aid document wins over a stale runtime HTML projection", () => {
  const oldBlock = { ...createBlock("heading"), title: "NỘI DUNG CŨ" };
  const page = createBlankPage();
  page.firstAid = createFirstAidDocument([oldBlock]);
  const hydrated = normalizePage(page);
  assert.match(hydrated.bodyHtml ?? "", /NỘI DUNG CŨ/);

  const newBlock = { ...createBlock("heading"), title: "NỘI DUNG MỚI" };
  hydrated.firstAid = createFirstAidDocument([newBlock]);
  // Simulate the one-render window where body/bodyHtml still contain the old projection.
  const persisted = notePageToSheetContent(hydrated) as Record<string, unknown>;
  const storedBlocks = (persisted.firstAid as { blocks: { title?: string }[] }).blocks;
  assert.equal(storedBlocks[0]?.title, "NỘI DUNG MỚI");
  assert.equal(Object.hasOwn(persisted, "body"), false);
  assert.equal(Object.hasOwn(persisted, "bodyHtml"), false);
});

test("leaving First Aid uses semantic rich text while structured blocks stay dormant", () => {
  const heading = { ...createBlock("heading"), title: "SUY GIÁP", titleHtml: "<b>SUY GIÁP</b>" };
  const label = { ...createBlock("label"), label: "ĐIỀU TRỊ", text: "Levothyroxine", textHtml: "<i>Levothyroxine</i>" };
  const document = createFirstAidDocument([heading, label]);
  const serialized = firstAidDocumentProjectionHtml(document);
  const plainText = firstAidDocumentPlainText(document);
  const standard = firstAidToStandardRichText(serialized, plainText);
  const regular = regularTemplateRichText(serialized, plainText);

  assert.equal(regular, standard);
  assert.doesNotMatch(regular, /data-mednote-first-aid|mednote-first-aid:/);
  assert.doesNotMatch(regular, /grid-template-columns|--fa-/);
  assert.match(regular, /SUY GIÁP/);
  assert.match(regular, /ĐIỀU TRỊ/);
  assert.match(regular, /<i>Levothyroxine<\/i>/);

  const page = createBlankPage();
  page.firstAid = document;
  page.paper = { ...page.paper, template: "blank" };
  page.body = plainText;
  page.bodyHtml = regular;
  const untouched = notePageToSheetContent(page) as Record<string, unknown>;
  assert.equal((untouched.firstAid as { version: number }).version, 1);
  assert.equal(untouched.bodyHtml, regular);

  page.bodyHtml = `${regular}<div>Nội dung sửa ở giấy thường</div>`;
  const edited = notePageToSheetContent(page) as Record<string, unknown>;
  assert.equal(Object.hasOwn(edited, "firstAid"), false);
});

test("legacy untouched First Aid starter content stays off regular paper", () => {
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

  const legacy = createBlankPage();
  legacy.firstAid = undefined;
  legacy.body = starterText;
  legacy.bodyHtml = starterHtml;
  const canonical = normalizePage(legacy);
  assert.equal(canonical.firstAid?.legacyStarter, true);
  canonical.paper = { ...canonical.paper, template: "blank" };
  const persisted = notePageToSheetContent(canonical) as Record<string, unknown>;
  assert.equal(persisted.body, "");
  assert.equal(persisted.bodyHtml, "");
  assert.equal(Object.hasOwn(persisted, "firstAid"), false);
});
