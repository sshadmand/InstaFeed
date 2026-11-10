import { defineConfig } from "vite";

const pages = ["index.html", "review.html"];
if (process.env.VERCEL_ENV !== "production") pages.push("playground.html");

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: pages },
  },
});
