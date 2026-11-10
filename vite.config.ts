import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri sets TAURI_ENV_PLATFORM for `tauri dev` / `tauri build`.
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

const browserModules: Record<string, string> = {
  "@tauri-apps/api/core": "./src/lib/browser/core.ts",
  "@tauri-apps/api/app": "./src/lib/browser/app.ts",
  "@tauri-apps/api/window": "./src/lib/browser/window.ts",
  "@tauri-apps/api/event": "./src/lib/browser/event.ts",
  "@tauri-apps/plugin-sql": "./src/lib/browser/db.ts",
  "@tauri-apps/plugin-dialog": "./src/lib/browser/dialog.ts",
};

const browserAliases = Object.fromEntries(
  Object.entries(browserModules).map(([specifier, localPath]) => [
    specifier,
    fileURLToPath(new URL(localPath, import.meta.url)),
  ]),
);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: isTauri ? undefined : { alias: browserAliases },
  define: {
    __STRIKER_BROWSER__: JSON.stringify(!isTauri),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "chrome105",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
