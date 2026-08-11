import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { thumbnailVirtualizationPlugin } from "./vite.thumbnail-virtualization";
import { workspaceSuspensionPlugin } from "./vite.workspace-suspension";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "/mednote-reader/",
  plugins: [thumbnailVirtualizationPlugin(), workspaceSuspensionPlugin(), react(), bundlePdfAssets("pages-dist")],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
  },
});
