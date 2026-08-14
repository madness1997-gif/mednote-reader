import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/windows.yml", import.meta.url);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Windows packaging is gated by isolated verification steps", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const verificationCommands = [
    "npm run typecheck",
    "npm run test:unit",
    "npm run build:desktop",
    "node tests/electron-smoke.cjs",
  ];

  for (const command of verificationCommands) {
    const scalarStep = new RegExp(`run: ${escapeRegExp(command)}(?:\\r?\\n|$)`, "g");
    assert.equal(workflow.match(scalarStep)?.length, 1, `${command} must remain an independent fail-fast step`);
  }

  const packageIndex = workflow.indexOf("run: npx electron-builder --win nsis --publish never");
  assert.notEqual(packageIndex, -1);
  for (const command of verificationCommands) {
    assert.ok(workflow.indexOf(`run: ${command}`) < packageIndex, `${command} must run before packaging`);
  }

  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
