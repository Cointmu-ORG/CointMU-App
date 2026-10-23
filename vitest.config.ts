import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the renderer aliases in electron.vite.config.ts so tests resolve
// "@/…" imports the same way the build does.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve("src/renderer/src"),
      "@bridge": resolve("src/bridge"),
    },
  },
});
