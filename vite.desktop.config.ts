import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";
import { thumbnailVirtualizationPlugin } from "./vite.thumbnail-virtualization";
import { workspaceSuspensionPlugin } from "./vite.workspace-suspension";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "./",
  plugins: [firstAidBlocksPlugin(), thumbnailVirtualizationPlugin(), workspaceSuspensionPlugin(), react(), bundlePdfAssets("dist-electron")],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
  },
});
