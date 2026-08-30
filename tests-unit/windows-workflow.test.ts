import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/windows.yml", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);
const installerIncludeUrl = new URL("../build/installer.nsh", import.meta.url);

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

  const uninstallSmoke = "run: ./tests/windows-uninstall-smoke.ps1";
  assert.equal(workflow.match(new RegExp(escapeRegExp(uninstallSmoke), "g"))?.length, 1);
  assert.ok(workflow.indexOf(uninstallSmoke) > packageIndex, "uninstaller smoke test must run against the packaged NSIS artifact");
  assert.ok(workflow.indexOf("uses: actions/upload-artifact@v4") > workflow.indexOf(uninstallSmoke));
  assert.match(workflow, /- build\/\*\*/);

  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("Windows uninstall preserves medical notes by default and offers explicit cleanup", async () => {
  const [packageText, installerInclude] = await Promise.all([
    readFile(packageUrl, "utf8"),
    readFile(installerIncludeUrl, "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.build.appId, "vn.mednote.reader");
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(packageJson.build.nsis.uninstallDisplayName, "MedNote Reader");
  assert.equal(packageJson.build.nsis.include, "build/installer.nsh");
  assert.match(installerInclude, /customUnInstallSection/);
  assert.match(installerInclude, /MB_DEFBUTTON2/);
  assert.match(installerInclude, /preserveMedNoteUserData/);
  assert.match(installerInclude, /RMDir \/r "\$APPDATA\\\$\{APP_PACKAGE_NAME\}"/);
});
