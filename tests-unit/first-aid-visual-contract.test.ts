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
  const canonicalDesktop = css.split("First Aid visual contract: one canonical signature, no patch layers. */")[1]?.split("@media (max-width: 760px)")[0] ?? "";

  assert.match(css, /First Aid visual contract: one canonical signature, no patch layers/);
  assert.doesNotMatch(css, /FA4 visual contract|FA5:/);
  assert.equal(canonicalDesktop.match(/\.template-first-aid \.note-title-input \{/g)?.length, 1);
  assert.equal(canonicalDesktop.match(/\.template-first-aid \.fa-label-layout,\n\.template-first-aid \.fa-flow-layout,\n\.template-first-aid \.fa-pearl-layout \{/g)?.length, 1);
  assert.match(normalized, /\.template-first-aid \.fa-image-actions, \.template-first-aid \.fa-image-zone > small \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-image-actions \{ display: flex;/);
  assert.match(normalized, /\.template-first-aid \.fa-side-toggle \{ display: none;/);
  assert.match(normalized, /\.template-first-aid \.fa-block\.selected \.fa-side-toggle \{ display: inline-flex;/);
  assert.match(normalized, /\.template-first-aid \.note-title-input \{ min-height: 34px;/);
  assert.match(normalized, /\.template-first-aid \.fa-image-zone \{ min-height: 68px;/);
  assert.match(normalized, /\.template-first-aid \.fa-flow-item \.fa-rich-editor \{ min-height: 28px; padding: 4px 6px !important;/);
  assert.match(normalized, /\.template-first-aid \.fa-flow-item > span \{ height: 14px;/);
  assert.match(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: minmax\(0, 40%\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(normalized, /@media \(max-width: 760px\).*?\.template-first-aid \.fa-figure-text \{ grid-template-columns: 1fr/);
});
