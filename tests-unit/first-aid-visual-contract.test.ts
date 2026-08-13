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
  assert.match(css, /FA5: make the page read like a compact textbook, not an editor form/);
  assert.match(normalized, /\.template-first-aid \.fa-image-actions, \.template-first-aid \.fa-image-zone > small \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-image-actions \{ display: flex;/);
  assert.match(normalized, /\.template-first-aid \.fa-side-toggle \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-side-toggle \{ display: inline-flex;/);
  assert.match(normalized, /\.template-first-aid \.fa-image-zone \{ position: relative; min-height: 52px;/);
  assert.match(normalized, /\.template-first-aid \.fa-block-toolbar \{ position: absolute; top: 2px; right: 2px;/);
  assert.match(normalized, /\.template-first-aid \.fa-text-style-switch \{ display: none !important;/);
  assert.match(normalized, /\.template-first-aid \.fa-flow-item \.fa-rich-editor \{ min-height: 20px; padding: 2px 4px !important; border: 0; border-bottom: 1px solid var\(--fa-soft-border\); border-radius: 0; background: transparent;/);
  assert.match(normalized, /\.template-first-aid \.fa-flow-item > span \{ height: 8px;/);
  assert.match(normalized, /\.template-first-aid \.fa-add-step \{ display: none;/);
  assert.match(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: minmax\(0, 38%\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: 1fr/);
});
