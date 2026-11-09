import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "FeedbackFab",
      formats: ["es", "umd"],
      fileName: (format) => `feedback-fab.${format}.js`,
    },
    outDir: "dist-sdk",
    emptyOutDir: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
