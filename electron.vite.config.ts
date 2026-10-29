import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// electron-vite externalizes "dependencies" for main and preload by default
// (build.externalizeDeps), so they need no plugin of their own.
export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        input: { index: resolve("src/main/index.ts") },
      },
    },
  },
  preload: {
    // Bundled rather than required at runtime, so the preload keeps working
    // once the renderer is sandboxed (a sandboxed preload cannot require them).
    build: {
      externalizeDeps: { exclude: ["@sentry/electron", "electron-log"] },
    },
  },
  renderer: {
    build: {
      rolldownOptions: {
        output: {
          // Groups match by path, so transitive deps that the old object-form
          // manualChunks pulled in implicitly are listed explicitly.
          codeSplitting: {
            groups: [
              {
                name: "vendor-react",
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|qrcode\.react)[\\/]/,
              },
              {
                name: "vendor-ethers",
                test: /[\\/]node_modules[\\/](ethers|@noble|@adraffy|aes-js)[\\/]/,
              },
              {
                name: "vendor-utils",
                test: /[\\/]node_modules[\\/](zustand|date-fns)[\\/]/,
              },
            ],
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
