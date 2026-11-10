/**
 * Entry point for the browser-only mock layer. Imported dynamically from
 * main.tsx only in non-Tauri builds, so the desktop bundle never includes it.
 */
let installed = false;

export function installBrowserMocks(): void {
  if (installed) return;
  installed = true;
  console.info(
    "[Striker Mini] Browser mock active — data stored in localStorage (sql.js)",
  );
}

export { BROWSER_DB_STORAGE_KEY, getDatabase, resetBrowserDatabase } from "./sqljs";
export { default as Database } from "./db";
export { invoke, convertFileSrc, transformCallback, isTauri } from "./core";
export { getVersion, getName, getTauriVersion } from "./app";
export { getCurrentWindow, getCurrent } from "./window";
export { listen, once, emit } from "./event";
export {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "./notification";
export { fetch as httpFetch, Client } from "./http";
export { open, save, message, ask, confirm } from "./dialog";
export {
  readFile,
  writeFile,
  readTextFile,
  writeTextFile,
  exists,
  createDir,
  remove,
  BaseDirectory,
} from "./fs";
export { isEnabled as isAutostartEnabled, enable as enableAutostart, disable as disableAutostart } from "./autostart";
