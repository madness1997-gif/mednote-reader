import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop Drive opens manual configuration before authorization", async () => {
  const topBar = await source("app/ui/app-top-bar.tsx");
  assert.match(topBar, /onClick=\{\(\) => setDrivePanelOpen\(\(open\) => !open\)\}/);
  assert.doesNotMatch(topBar, /void connectDrive\(\)/);
});

test("desktop Drive accepts only an installed OAuth JSON file", async () => {
  const panel = await source("app/ui/drive-panel.tsx");
  assert.match(panel, /payload\.installed/);
  assert.match(panel, /Đây là OAuth Web application/);
  assert.match(panel, /Nhập tệp OAuth Desktop JSON/);
});

test("an in-progress desktop authorization can be cancelled", async () => {
  const [main, preload, drive] = await Promise.all([
    source("electron/main.cjs"),
    source("electron/preload.cjs"),
    source("app/google-drive.ts"),
  ]);
  assert.match(main, /drive:cancel-authorization/);
  assert.match(main, /Đã hủy kết nối Google Drive/);
  assert.match(preload, /cancelDriveAuthorization/);
  assert.match(drive, /cancelDriveAuthorization/);
});
