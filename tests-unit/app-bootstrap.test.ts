import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("P4 fresh install returns a persistent empty workspace", () => {
  const { result } = runScenario("fresh");
  assert.deepEqual(result.workspaceIds, ["empty-workspace"]);
  assert.deepEqual(result.workspaceKinds, ["empty"]);
  assert.equal(result.activeWorkspaceId, "empty-workspace");
  assert.equal(result.workspaceMode, "note");
});

test("P4 restores v6 NoteStructure and DocumentGraph", () => {
  const restored = runScenario("v6");
  assert.deepEqual(restored.result.workspaceIds, ["v6-workspace"]);
  assert.deepEqual(restored.result.documentNames, ["v6-workspace.pdf"]);
  assert.equal(restored.activeBody, "from v6");
});

test("P4 v6 documents use document-runtime preference for active context and UI settings", () => {
  const { result } = runScenario("v6-runtime");
  assert.deepEqual(result.workspaceIds, ["context-a", "context-b"]);
  assert.equal(result.activeWorkspaceId, "context-b");
  assert.equal(result.readerShare, 72);
  assert.equal(result.workspaceMode, "note");
  assert.equal(result.noteZoom, 1.6);
  assert.equal(result.savedAt, 777);
});

test("P4 incremental v5 wins over localStorage v2 for note migration and runtime fallback", () => {
  const restored = runScenario("v5-precedence");
  assert.deepEqual(restored.result.workspaceIds, ["v5-workspace"]);
  assert.equal(restored.result.activeWorkspaceId, "v5-workspace");
  assert.equal(restored.activeBody, "from v5");
  assert.equal(restored.result.readerShare, 61);
  assert.equal(restored.result.workspaceMode, "reader");
  assert.equal(restored.result.noteZoom, 1.25);
  assert.equal(restored.result.savedAt, 505);
});

test("P4 corrupt legacy storage produces warnings without aborting bootstrap", () => {
  const { result } = runScenario("corrupt");
  assert.deepEqual(result.workspaceIds, ["empty-workspace"]);
  assert.ok(result.warnings.length >= 4);
});

test("P4 migrates legacy notebook v1 into v6 Sheet content", () => {
  const restored = runScenario("legacy-notebook");
  assert.equal(restored.activeBody, "legacy notebook body");
  assert.equal(restored.result.readerShare, 43);
  assert.equal(restored.result.workspaceMode, "note");
  assert.deepEqual(restored.result.workspaceKinds, ["empty"]);
});

test("P4 migrates current-pdf once and preserves the legacy blob and name", () => {
  const restored = runScenario("legacy-pdf");
  assert.deepEqual(restored.result.documentNames, ["Legacy Harrison.pdf"]);
  assert.deepEqual(restored.libraryDocumentNames, ["Legacy Harrison.pdf"]);
  assert.equal(restored.pdf?.name, "Legacy Harrison.pdf");
  assert.equal(restored.pdf?.text, "legacy-one");
  assert.equal(restored.pdf?.textAfterSecondBootstrap, "legacy-one");
  assert.equal(restored.result.workspaceMode, "split");
});

test("P4 never restores temporary runtime workspaces", () => {
  const { result } = runScenario("temporary");
  assert.deepEqual(result.workspaceIds, ["persistent-workspace"]);
  assert.equal(result.activeWorkspaceId, "persistent-workspace");
  assert.equal(result.readerShare, 58);
  assert.equal(result.workspaceMode, "reader");
  assert.equal(result.noteZoom, 1.2);
});

test("P4 page.tsx only applies BootstrapResult and has no legacy bootstrap knowledge", () => {
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const bootstrapSource = readFileSync(new URL("../app/app-bootstrap.ts", import.meta.url), "utf8");
  assert.match(pageSource, /bootstrapMedNote\(\)/);
  assert.match(pageSource, /applyBootstrapResult/);
  assert.doesNotMatch(pageSource, /mednote-library-v2|mednote-document-runtime-v1|mednote-notebook-v1|current-pdf/);
  assert.doesNotMatch(pageSource, /loadIncrementalLibrary|readLegacyRelationV2|noteStore\.initialize/);
  assert.doesNotMatch(pageSource, /\bSTORAGE_KEY\b|\bDOCUMENT_RUNTIME_KEY\b|\bRELATION_META_WORKSPACE_ID\b|\bLEGACY_STORAGE_KEY\b/);
  assert.match(bootstrapSource, /loadIncrementalLibrary/);
  assert.match(bootstrapSource, /readLegacyCurrentPdf/);
  assert.match(bootstrapSource, /noteStore\.initialize/);
  assert.deepEqual(
    [...bootstrapSource.matchAll(/^export (?:async )?(?:function|type|const|class)\s+(\w+)/gm)].map((match) => match[1]),
    ["BootstrapResult", "bootstrapMedNote"],
  );
});
