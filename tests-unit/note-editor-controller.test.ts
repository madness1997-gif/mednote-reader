import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { equationMarkup, equationTemplateById, tableMarkup } from "../app/use-note-editor-controller";

test("equation composer keeps templates inside the editor boundary and escapes user input", () => {
  assert.deepEqual(equationTemplateById("fraction").defaults, ["a", "b"]);
  const fraction = equationMarkup("fraction", ["<script>", "b & c"]);
  assert.match(fraction, /&lt;script&gt;/);
  assert.match(fraction, /b &amp; c/);
  assert.doesNotMatch(fraction, /<script>/);

  const integral = equationMarkup("integral", ["f(x)", "0", "1", "x"]);
  assert.match(integral, /∫/);
  assert.match(integral, /<sub>0<\/sub>/);
  assert.match(integral, /dx/);
});

test("table composer produces the requested grid and border settings", () => {
  const html = tableMarkup(2, 3, { style: "dashed", width: 2, color: "#2465a8" });
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.equal((html.match(/<td /g) || []).length, 6);
  assert.match(html, /border-style:dashed/);
  assert.match(html, /border-width:2px/);
  assert.match(html, /border-color:#2465a8/);
  assert.match(html, /<div><br><\/div>$/);
});

test("page composes one note editor controller instead of owning editor DOM logic", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../app/ui/note-stage.tsx", import.meta.url), "utf8");
  const toolbar = await readFile(new URL("../app/ui/note-toolbar.tsx", import.meta.url), "utf8");

  assert.match(page, /const noteEditor = useNoteEditorController/);
  assert.match(page, /editor: noteEditor/);
  assert.doesNotMatch(page, /document\.execCommand|savedTextRangeRef|activeTextEditorRef|noteRichTextController|textSettingsAtRange/);
  assert.match(stage, /editor: NoteEditorController/);
  assert.match(toolbar, /editor: NoteEditorController/);
});
