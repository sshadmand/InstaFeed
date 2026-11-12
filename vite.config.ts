import { defineConfig } from "vite";

export default defineConfig({
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: {
    copyPublicDir: false,
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
