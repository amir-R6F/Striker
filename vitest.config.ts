import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The DB suite runs the real db.ts against node:sqlite instead of Tauri.
      "@tauri-apps/plugin-sql": fileURLToPath(
        new URL("./tests/db/pluginSqlShim.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
