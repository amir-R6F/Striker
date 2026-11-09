const STORAGE_KEY = "striker-browser-autostart";

export async function isEnabled(): Promise<boolean> {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export async function enable(): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // The setting is only cosmetic in browser mode.
  }
}

export async function disable(): Promise<void> {
  try {
    window.localStorage.setItem(STORAGE_KEY, "false");
  } catch {
    // The setting is only cosmetic in browser mode.
  }
}
