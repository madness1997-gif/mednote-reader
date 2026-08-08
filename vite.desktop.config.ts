import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";
import { noteStickersPlugin } from "./vite.note-stickers";
import { incrementalLibraryPersistencePlugin } from "./vite.incremental-library-persistence";
import { thumbnailVirtualizationPlugin } from "./vite.thumbnail-virtualization";
import { workspaceSuspensionPlugin } from "./vite.workspace-suspension";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "./",
  plugins: [firstAidBlocksPlugin(), noteStickersPlugin(), thumbnailVirtualizationPlugin(), workspaceSuspensionPlugin(), incrementalLibraryPersistencePlugin(), react(), bundlePdfAssets("dist-electron")],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
  },
});
