import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "./",
  plugins: [react(), bundlePdfAssets("dist-electron")],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
  },
});
