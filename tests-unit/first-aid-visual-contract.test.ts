import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

function compact(value: string) {
  return value.replace(/\s+/g, " ");
}

test("First Aid keeps its compact signature after editor refactors", async () => {
  const css = await readFile(new URL("app/first-aid-block-editor.css", root), "utf8");
  const normalized = compact(css);

  assert.match(css, /FA4 visual contract: refactors may change internals, not the First Aid signature/);
  assert.match(normalized, /\.template-first-aid \.fa-image-actions, \.template-first-aid \.fa-image-zone > small \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-image-actions \{ display: flex;/);
  assert.match(normalized, /\.template-first-aid \.fa-side-toggle \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-side-toggle \{ display: inline-flex;/);
  assert.match(normalized, /\.template-first-aid \.fa-image-zone \{ min-height: 68px;/);
  assert.match(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: minmax\(0, 40%\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: 1fr/);
});
