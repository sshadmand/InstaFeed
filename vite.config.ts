import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FeedbackFab",
      formats: ["es", "umd"],
      fileName: (format) => format === "umd" ? "feedback-fab.umd.cjs" : "feedback-fab.es.js",
    },
    outDir: "dist-sdk",
    emptyOutDir: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
