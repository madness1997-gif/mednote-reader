import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FIRST_AID_THEMES, firstAidThemeInlineStyle, firstAidThemeVariables } from "../app/first-aid-theme";

const root = new URL("../", import.meta.url);

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * red + .7152 * green + .0722 * blue;
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
}

test("First Aid provides a complete harmonious theme for every paper color", () => {
  assert.deepEqual(Object.keys(FIRST_AID_THEMES).sort(), ["blue", "dark", "ivory", "mint", "white", "yellow"]);
  for (const [color, theme] of Object.entries(FIRST_AID_THEMES)) {
    assert.ok(contrast(theme.ink, theme.block) >= 4.5, `${color} body contrast`);
    assert.ok(contrast(theme.headingInk, theme.heading) >= 4.5, `${color} heading contrast`);
    assert.ok(contrast(theme.titleInk, theme.bandPrimary) >= 4.5, `${color} primary title-band contrast`);
    assert.ok(contrast(theme.titleInk, theme.bandSecondary) >= 4.5, `${color} secondary title-band contrast`);
    assert.ok(contrast(theme.pearlInk, theme.pearl) >= 4.5, `${color} pearl contrast`);
  }
});

test("First Aid variables travel with previews and standalone export HTML", () => {
  const variables = firstAidThemeVariables("dark");
  assert.equal(variables["--fa-ink"], FIRST_AID_THEMES.dark.ink);
  assert.equal(variables["--fa-block-bg"], FIRST_AID_THEMES.dark.block);
  assert.match(firstAidThemeInlineStyle("mint"), new RegExp(`--fa-band-primary:${FIRST_AID_THEMES.mint.bandPrimary}`));
  assert.match(firstAidThemeInlineStyle("mint"), /--fa-pearl-ink:#40370f/);
});

test("First Aid table shape controls are contextual instead of permanently occupying a row", async () => {
  const [editor, components, styles] = await Promise.all([
    readFile(new URL("app/first-aid-block-editor.tsx", root), "utf8"),
    readFile(new URL("app/first-aid-block-editor-components.tsx", root), "utf8"),
    readFile(new URL("app/first-aid-block-editor.css", root), "utf8"),
  ]);
  assert.doesNotMatch(`${editor}\n${components}`, /fa-table-actions/);
  assert.match(editor, /block\.type === "table" && <FirstAidTableToolbar/);
  assert.match(components, /export function FirstAidTableToolbar/);
  assert.match(styles, /\.fa-block-toolbar\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.fa-block\.selected \.fa-block-toolbar\s*\{\s*display:\s*flex/);
});

test("FA1 keeps First Aid presentation in one canonical stylesheet without global hint leakage", async () => {
  const [entry, styles] = await Promise.all([
    readFile(new URL("app/first-aid-block-editor.tsx", root), "utf8"),
    readFile(new URL("app/first-aid-block-editor.css", root), "utf8"),
  ]);

  assert.doesNotMatch(entry, /first-aid-block-editor-ui-fix\.css|first-aid-signature-polish\.css/);
  assert.match(styles, /\.template-first-aid \.note-title-input/);
  assert.match(styles, /\.template-first-aid \.mode-hint\s*\{/);
  assert.doesNotMatch(styles, /(?:^|\n)\.mode-hint\s*\{/);
  assert.match(styles, /\.fa-block-editor:not\(\.mode-view\) > \.fa-insert-slot\.first:last-child[\s\S]*?\.fa-insert-button:not\(:disabled\)[\s\S]*?opacity:\s*1/);

  await assert.rejects(readFile(new URL("app/first-aid-block-editor-ui-fix.css", root), "utf8"));
  await assert.rejects(readFile(new URL("app/first-aid-signature-polish.css", root), "utf8"));
});

test("FA2/FA3 runtime is composed from controller and block components without legacy bridges", async () => {
  const [editor, controller, components] = await Promise.all([
    readFile(new URL("app/first-aid-block-editor.tsx", root), "utf8"),
    readFile(new URL("app/use-first-aid-block-editor.ts", root), "utf8"),
    readFile(new URL("app/first-aid-block-editor-components.tsx", root), "utf8"),
  ]);
  assert.match(editor, /useFirstAidBlockEditor/);
  assert.match(editor, /FirstAidBlockBody/);
  assert.match(controller, /Restore\/sync can replace the canonical document of the same Sheet id/);
  assert.match(controller, /appliedSignatureRef/);
  assert.match(components, /fa-heading-native-input/);
  await assert.rejects(readFile(new URL("app/first-aid-block-editor-view.tsx", root), "utf8"));
  await assert.rejects(readFile(new URL("app/first-aid-block-editor-v2.tsx", root), "utf8"));
});
