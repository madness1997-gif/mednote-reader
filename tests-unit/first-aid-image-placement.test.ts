import assert from "node:assert/strict";
import test from "node:test";
import { firstAidImagePlacement, fitFirstAidImageLayout } from "../app/first-aid-image-placement";

const page = { left: 0, top: 0, width: 720, height: 1018 };

test("First Aid starts cropped images at a restrained size inside their block zone", () => {
  const figure = firstAidImagePlacement("figure", { left: 32, top: 210, width: 656, height: 90 }, page);
  const besideText = firstAidImagePlacement("figure-text", { left: 32, top: 420, width: 260, height: 90 }, page);

  assert.ok(figure.width <= .46);
  assert.ok(figure.x > .2 && figure.x < .3);
  assert.equal(figure.maxHeight, .3);
  assert.ok(besideText.width <= .28);
  assert.ok(besideText.x >= 32 / 720);
  assert.ok(besideText.x + besideText.width <= (32 + 260) / 720);
  assert.equal(besideText.maxHeight, .22);
});

test("First Aid scales tall crops down without losing their centered block placement", () => {
  const placement = { x: .27, y: .24, width: .46, maxHeight: .3 };
  const layout = fitFirstAidImageLayout(placement, .4, 210, 297);

  assert.ok(layout.width < placement.width);
  assert.ok(layout.height <= placement.maxHeight + Number.EPSILON);
  assert.ok(Math.abs((layout.x + layout.width / 2) - (placement.x + placement.width / 2)) < 1e-9);
});
