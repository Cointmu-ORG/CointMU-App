import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "qrcode.react"],
            "vendor-ethers": ["ethers"],
            "vendor-utils": ["zustand", "date-fns"],
          },
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@bridge": resolve("src/bridge"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
