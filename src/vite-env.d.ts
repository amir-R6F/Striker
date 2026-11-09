/// <reference types="vite/client" />

/**
 * True in pure-web builds (`vite dev` / `vite build` without Tauri's
 * TAURI_ENV_PLATFORM) and false inside `tauri dev` / `tauri build`.
 */
declare const __STRIKER_BROWSER__: boolean;
