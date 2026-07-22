import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { bundlePdfAssets } from "./vite.pdf-assets";

export default defineConfig({
  base: "/mednote-reader/",
  plugins: [react(), bundlePdfAssets("pages-dist")],
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
  },
});
