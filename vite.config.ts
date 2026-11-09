import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri sets TAURI_ENV_PLATFORM for `tauri dev` / `tauri build` scripts.
// In that case the real @tauri-apps packages stay untouched.
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

const browserModules: Record<string, string> = {
  "@tauri-apps/api/core": "./src/lib/browser/core.ts",
  "@tauri-apps/api/app": "./src/lib/browser/app.ts",
  "@tauri-apps/api/window": "./src/lib/browser/window.ts",
  "@tauri-apps/api/event": "./src/lib/browser/event.ts",
  "@tauri-apps/plugin-sql": "./src/lib/browser/db.ts",
  "@tauri-apps/plugin-notification": "./src/lib/browser/notification.ts",
  "@tauri-apps/plugin-http": "./src/lib/browser/http.ts",
  "@tauri-apps/plugin-dialog": "./src/lib/browser/dialog.ts",
  "@tauri-apps/plugin-fs": "./src/lib/browser/fs.ts",
  "@tauri-apps/plugin-autostart": "./src/lib/browser/autostart.ts",
};

const browserAliases = Object.fromEntries(
  Object.entries(browserModules).map(([specifier, localPath]) => [
    specifier,
    fileURLToPath(new URL(localPath, import.meta.url)),
  ]),
);

// Tauri expects a fixed dev server port and must not clear the terminal
// (the Rust compiler output is useful there).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // WebView2 on Windows 10/11 is evergreen Chromium, but keep the target
    // conservative so the widget also runs on older installs.
    target: "chrome105",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
