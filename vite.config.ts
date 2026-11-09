import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri expects a fixed dev server port and must not clear the terminal
// (the Rust compiler output is useful there).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
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
