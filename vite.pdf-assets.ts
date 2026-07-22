import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PDF_ASSET_DIRECTORIES = ["cmaps", "standard_fonts", "wasm"] as const;

export function bundlePdfAssets(outDir: string): Plugin {
  return {
    name: "bundle-pdfjs-assets",
    apply: "build",
    async writeBundle() {
      const sourceRoot = resolve("node_modules/pdfjs-dist");
      const targetRoot = resolve(outDir, "pdfjs");
      await mkdir(targetRoot, { recursive: true });
      await Promise.all(PDF_ASSET_DIRECTORIES.map((directory) => cp(
        resolve(sourceRoot, directory),
        resolve(targetRoot, directory),
        { recursive: true },
      )));
    },
  };
}
