import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";
import { noteStickersPlugin } from "./vite.note-stickers";
import { thumbnailVirtualizationPlugin } from "./vite.thumbnail-virtualization";
import { workspaceSuspensionPlugin } from "./vite.workspace-suspension";
import { desktopPdfCanvasBudgetPlugin } from "./vite.desktop-pdf-canvas-budget";
import { bundlePdfAssets } from "./vite.pdf-assets";

const normalizeSourceLineEndingsPlugin = () => ({
  name: "mednote-normalize-source-line-endings",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.replaceAll("\\", "/").split("?")[0];
    if (!normalizedId.includes("/app/")) return null;
    const normalizedCode = code.replace(/\r\n/g, "\n");
    return normalizedCode === code ? null : { code: normalizedCode, map: null };
  },
});

export default defineConfig({
  base: "./",
  plugins: [normalizeSourceLineEndingsPlugin(), firstAidBlocksPlugin(), noteStickersPlugin(), thumbnailVirtualizationPlugin(), desktopPdfCanvasBudgetPlugin(), workspaceSuspensionPlugin(), react(), bundlePdfAssets("dist-electron")],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
  },
});
