import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

type ScenarioResult = {
  result: {
    workspaceIds: string[];
    workspaceKinds: string[];
    documentNames: string[];
    activeWorkspaceId: string;
    readerShare: number;
    workspaceMode: string;
    noteZoom: number;
    savedAt: number;
    warnings: string[];
  };
  activeBody?: string;
  notebookTitles: string[];
  libraryDocumentNames: string[];
  pdf?: { name?: string; text?: string; textAfterSecondBootstrap?: string };
};

const scenarioFixture = fileURLToPath(new URL("./app-bootstrap-scenario.ts", import.meta.url));

function runScenario(name: string): ScenarioResult {
  const child = spawnSync(process.execPath, ["--import", "tsx", scenarioFixture, name], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout) as ScenarioResult;
}

test("P6.5 fresh install returns the stable note runtime shell", () => {
  const { result } = runScenario("fresh");
  assert.deepEqual(result.workspaceIds, ["note-runtime-v6"]);
  assert.deepEqual(result.workspaceKinds, ["empty"]);
  assert.equal(result.activeWorkspaceId, "note-runtime-v6");
  assert.equal(result.workspaceMode, "note");
});

test("P6.5 restores v6 NoteStructure and DocumentGraph plus one note runtime shell", () => {
  const restored = runScenario("v6");
  assert.deepEqual(restored.result.workspaceIds, ["v6-workspace", "note-runtime-v6"]);
  assert.deepEqual(restored.result.documentNames, ["v6-workspace.pdf"]);
  assert.equal(restored.activeBody, "from v6");
});

test("P6.5 v6 documents keep document-runtime preference for active context and UI settings", () => {
  const { result } = runScenario("v6-runtime");
  assert.deepEqual(result.workspaceIds, ["context-a", "context-b", "note-runtime-v6"]);
  assert.equal(result.activeWorkspaceId, "context-b");
  assert.equal(result.readerShare, 72);
  assert.equal(result.workspaceMode, "note");
  assert.equal(result.noteZoom, 1.6);
  assert.equal(result.savedAt, 777);
});

test("P6.5 incremental v5 wins over localStorage v2 for note migration and runtime fallback", () => {
  const restored = runScenario("v5-precedence");
  assert.deepEqual(restored.result.workspaceIds, ["v5-workspace", "note-runtime-v6"]);
  assert.equal(restored.result.activeWorkspaceId, "v5-workspace");
  assert.equal(restored.activeBody, "from v5");
  assert.equal(restored.result.readerShare, 61);
  assert.equal(restored.result.workspaceMode, "reader");
  assert.equal(restored.result.noteZoom, 1.25);
  assert.equal(restored.result.savedAt, 505);
});

test("P6.5 corrupt legacy storage produces warnings without aborting bootstrap", () => {
  const { result } = runScenario("corrupt");
  assert.deepEqual(result.workspaceIds, ["note-runtime-v6"]);
  assert.ok(result.warnings.length >= 4);
});

test("P6.5 migrates legacy notebook v1 into canonical v6 Sheet content before shell fallback", () => {
  const restored = runScenario("legacy-notebook");
  assert.equal(restored.activeBody, "legacy notebook body");
  assert.equal(restored.result.readerShare, 43);
  assert.equal(restored.result.workspaceMode, "note");
  assert.deepEqual(restored.result.workspaceIds, ["note-runtime-v6"]);
  assert.deepEqual(restored.result.workspaceKinds, ["empty"]);
});

test("P6.5 migrates current-pdf once and preserves the legacy blob and name", () => {
  const restored = runScenario("legacy-pdf");
  assert.deepEqual(restored.result.documentNames, ["Legacy Harrison.pdf"]);
  assert.deepEqual(restored.libraryDocumentNames, ["Legacy Harrison.pdf"]);
  assert.equal(restored.pdf?.name, "Legacy Harrison.pdf");
  assert.equal(restored.pdf?.text, "legacy-one");
  assert.equal(restored.pdf?.textAfterSecondBootstrap, "legacy-one");
  assert.equal(restored.result.workspaceMode, "split");
  assert.equal(restored.result.workspaceIds.at(-1), "note-runtime-v6");
});

test("P6.5 drops temporary runtime contexts and falls back to the note shell when the saved active context is invalid", () => {
  const { result } = runScenario("temporary");
  assert.deepEqual(result.workspaceIds, ["persistent-workspace", "note-runtime-v6"]);
  assert.equal(result.activeWorkspaceId, "note-runtime-v6");
  assert.equal(result.readerShare, 58);
  assert.equal(result.workspaceMode, "note");
  assert.equal(result.noteZoom, 1.2);
});
