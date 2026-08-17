import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

async function missing(path: string) {
  try { await access(new URL(path, root)); return false; } catch { return true; }
}

test("web and desktop share PDF canvas budgeting without build-time source transforms", async () => {
  const web = await source("vite.github.config.ts");
  const desktop = await source("vite.desktop.config.ts");
  const reader = await source("app/pdf-reader.tsx");
  const visibility = await source("app/pdf-page-visibility.ts");
  for (const config of [web, desktop]) {
    assert.doesNotMatch(config, /workspaceSuspensionPlugin/);
    assert.doesNotMatch(config, /thumbnailVirtualizationPlugin/);
    assert.doesNotMatch(config, /desktopPdfCanvasBudgetPlugin/);
  }
  assert.match(reader, /pdfCanvasBudget/);
  assert.doesNotMatch(reader, /new IntersectionObserver/);
  assert.equal((visibility.match(/new IntersectionObserver/g) || []).length, 2);
  assert.equal(await missing("vite.desktop-pdf-canvas-budget.ts"), true);
  assert.equal(await missing("vite.workspace-suspension.ts"), true);
  assert.equal(await missing("vite.thumbnail-virtualization.ts"), true);
});

test("heavy PDF export libraries stay outside the initial application chunk", async () => {
  const page = await source("app/page.tsx");
  const core = await source("app/pdf-export-core.ts");
  assert.match(page, /await import\("\.\/pdf-document-export"\)/);
  assert.doesNotMatch(page, /from "\.\/pdf-document-export"/);
  assert.match(core, /await import\("html2canvas-pro"\)/);
  assert.match(core, /await import\("pdf-lib"\)/);
  assert.doesNotMatch(core, /import html2canvas(?:Pro)? from/);
  assert.doesNotMatch(core, /import \{ PDFDocument \} from "pdf-lib"/);
});
