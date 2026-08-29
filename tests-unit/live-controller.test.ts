import assert from "node:assert/strict";
import test from "node:test";
import { createLiveController } from "../app/live-controller";

test("live controller keeps controller and method identity while reading the latest implementation", () => {
  const first = { count: 1, label: "first", read() { return `${this.label}:${this.count}`; } };
  const live = createLiveController(first);
  const controller = live.value;
  const read = controller.read;

  live.update({ count: 2, label: "second", read() { return `${this.label}:${this.count}`; } });

  assert.equal(live.value, controller);
  assert.equal(live.value.read, read);
  assert.equal(controller.count, 2);
  assert.equal(read(), "second:2");
  assert.deepEqual(Object.keys(controller).sort(), ["count", "label", "read"]);
});
