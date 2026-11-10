import { invoke } from "@tauri-apps/api/core";

export async function isAutoStartEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>("autostart_is_enabled");
  } catch (error) {
    console.warn("Could not read autostart state", error);
    return false;
  }
}

export async function setAutoStart(enabled: boolean): Promise<void> {
  await invoke("autostart_set", { enabled });
}
