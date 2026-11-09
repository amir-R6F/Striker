import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permission: Promise<boolean> | null = null;

/**
 * Resolves once per app run. The Tauri plugin prompts for permission through the
 * OS; in a plain browser (Vite dev) the calls throw and reminders simply stay
 * quiet instead of breaking the UI.
 */
export function ensureNotificationPermission(): Promise<boolean> {
  if (!permission) {
    permission = (async () => {
      if (await isPermissionGranted()) return true;
      const state = await requestPermission();
      return state === "granted";
    })().catch(() => {
      permission = null;
      return false;
    });
  }
  return permission;
}

export async function sendLocalNotification(
  title: string,
  body: string,
): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  try {
    sendNotification({ title, body });
    return true;
  } catch (error) {
    console.warn("Could not show notification", error);
    return false;
  }
}
