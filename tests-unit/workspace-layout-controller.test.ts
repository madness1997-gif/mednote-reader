import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readerShareForPointer } from "../app/use-workspace-layout-controller";

test("divider math maps the pointer into the reader share and clamps both edges", () => {
  assert.equal(readerShareForPointer(100, 1236, 708), 50);
  assert.equal(readerShareForPointer(100, 1236, 100), 35);
  assert.equal(readerShareForPointer(100, 1236, 2_000), 65);
});

test("page composes one workspace layout controller and layout UI consumes that boundary", async () => {
  const [page, controller, topBar, readerStage, noteToolbar, navigation, divider, shell] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-workspace-layout-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/app-top-bar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/pdf-reader-stage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/note-navigation-host.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/split-divider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui/workspace-shell.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const workspaceLayout = useWorkspaceLayoutController/);
  assert.match(page, /layout: workspaceLayout/);
  assert.match(page, /<SplitDivider layout=\{workspaceLayout\}/);
  assert.match(page, /<NoteNavigationHost layout=\{workspaceLayout\}/);
  for (const forbidden of [
    "useState<WorkspaceMode",
    "NOTE_SIDEBAR_PREFERENCE_KEY",
    "const changeWorkspaceMode",
    "const startResize",
    "workspacePaneForElement",
    "lastWorkspacePaneRef",
    "event.key === \"F6\"",
    "\"--reader-share\"",
  ]) assert.equal(page.includes(forbidden), false, `page.tsx still owns ${forbidden}`);

  assert.match(controller, /event\.key !== "F6"/);
  assert.match(controller, /mednote-note-sidebar-hidden/);
  assert.match(controller, /readerShareForPointer/);
  assert.match(controller, /pointercancel/);
  assert.match(controller, /focusWorkspacePane/);

  for (const consumer of [topBar, readerStage, noteToolbar, navigation, divider, shell]) {
    assert.match(consumer, /WorkspaceLayoutController/);
  }
});
