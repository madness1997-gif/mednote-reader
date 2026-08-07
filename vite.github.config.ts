import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";
import { incrementalLibraryPersistencePlugin } from "./vite.incremental-library-persistence";
import { thumbnailVirtualizationPlugin } from "./vite.thumbnail-virtualization";
import { workspaceSuspensionPlugin } from "./vite.workspace-suspension";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "/mednote-reader/",
  plugins: [firstAidBlocksPlugin(), thumbnailVirtualizationPlugin(), workspaceSuspensionPlugin(), incrementalLibraryPersistencePlugin(), react(), bundlePdfAssets("pages-dist")],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
  },
});
