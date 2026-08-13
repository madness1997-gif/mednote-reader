import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlock,
  createFirstAidDocument,
  firstAidDocumentPlainText,
  firstAidDocumentStandardRichText,
  firstAidTemplateTransition,
} from "../app/first-aid-block-model";

function sampleDocument() {
  return createFirstAidDocument([
    { ...createBlock("heading"), title: "SUY GIÁP", titleHtml: "<b>SUY GIÁP</b>" },
    { ...createBlock("label"), label: "ĐIỀU TRỊ", text: "Levothyroxine", textHtml: "<i>Levothyroxine</i>" },
    { ...createBlock("text"), text: "Theo dõi TSH", textHtml: "<p>Theo dõi <u>TSH</u></p>" },
  ]);
}

test("First Aid -> regular keeps the canonical document dormant behind its semantic projection", () => {
  const document = sampleDocument();
  const transition = firstAidTemplateTransition({
    currentTemplate: "first-aid",
    nextTemplate: "blank",
    body: "stale runtime body",
    bodyHtml: "<p>stale runtime body</p>",
    firstAid: document,
  });

  assert.deepEqual(transition.firstAid, document);
  assert.equal(transition.body, firstAidDocumentPlainText(document));
  assert.equal(transition.bodyHtml, firstAidDocumentStandardRichText(document));
});

test("regular -> First Aid reuses dormant document only while the regular projection is untouched", () => {
  const document = sampleDocument();
  const leave = firstAidTemplateTransition({
    currentTemplate: "first-aid",
    nextTemplate: "blank",
    body: "",
    bodyHtml: "",
    firstAid: document,
  });

  const untouched = firstAidTemplateTransition({
    currentTemplate: "blank",
    nextTemplate: "first-aid",
    body: leave.body ?? "",
    bodyHtml: leave.bodyHtml ?? "",
    firstAid: leave.firstAid,
  });
  assert.deepEqual(untouched.firstAid, document);

  const editedBody = `${leave.body ?? ""}\n\nNội dung thêm trên giấy thường`;
  const editedHtml = `${leave.bodyHtml ?? ""}<p>Nội dung thêm trên giấy thường</p>`;
  const edited = firstAidTemplateTransition({
    currentTemplate: "blank",
    nextTemplate: "first-aid",
    body: editedBody,
    bodyHtml: editedHtml,
    firstAid: leave.firstAid,
  });

  assert.notDeepEqual(edited.firstAid, document);
  assert.match(firstAidDocumentPlainText(edited.firstAid), /Nội dung thêm trên giấy thường/);
});
