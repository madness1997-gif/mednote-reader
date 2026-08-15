import assert from "node:assert/strict";
import test from "node:test";
import { createBlock } from "../app/first-aid-block-domain";
import { renderFirstAidBlocksHtml } from "../app/first-aid-block-renderer";
import {
  MAX_FIRST_AID_IMAGE_WIDTH_RATIO,
  MIN_FIRST_AID_IMAGE_WIDTH_RATIO,
  normalizeFirstAidImageWidthRatio,
  resizeFirstAidImageWidthRatio,
} from "../app/first-aid-figure-layout";

test("figure-text image width follows the drag direction on either side", () => {
  assert.equal(resizeFirstAidImageWidthRatio(.4, 60, 600, "left"), .5);
  assert.ok(Math.abs(resizeFirstAidImageWidthRatio(.4, 60, 600, "right") - .3) < 1e-9);
  assert.equal(resizeFirstAidImageWidthRatio(.4, -300, 600, "left"), MIN_FIRST_AID_IMAGE_WIDTH_RATIO);
  assert.equal(resizeFirstAidImageWidthRatio(.4, -300, 600, "right"), MAX_FIRST_AID_IMAGE_WIDTH_RATIO);
});

test("figure-text persists a safe image width in its static projection", () => {
  const block = { ...createBlock("figure-text"), imageWidthRatio: .32 };
  const html = renderFirstAidBlocksHtml([block]);
  assert.match(html, /grid-template-columns:32% 1fr/);
  assert.equal(normalizeFirstAidImageWidthRatio(undefined), .4);
});
