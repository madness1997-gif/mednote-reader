import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { firstAidBlocksPlugin } from "./vite.first-aid-blocks";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "./",
  plugins: [firstAidBlocksPlugin(), react(), bundlePdfAssets("dist-electron")],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
  },
});
