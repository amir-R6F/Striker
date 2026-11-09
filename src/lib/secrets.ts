import {
  createDeviceKey,
  decryptWithDeviceKey,
  encryptWithDeviceKey,
} from "./crypto";
import { SETTING_KEYS, type Settings } from "./settings";

/**
 * Encrypts a setting value with the per-install device key. The key itself is a
 * random 32-byte value in settings, so this protects database dumps and backups
 * from containing plaintext secrets; it is not a replacement for OS disk
 * encryption. Backups use the user's passphrase instead.
 */
export async function saveSecret(
  settings: Settings,
  setSetting: (key: string, value: string) => Promise<void>,
  key: string,
  plaintext: string,
): Promise<void> {
  let deviceKey = settings[SETTING_KEYS.deviceKey];
  if (!deviceKey) {
    deviceKey = createDeviceKey();
    await setSetting(SETTING_KEYS.deviceKey, deviceKey);
  }
  const encrypted = await encryptWithDeviceKey(plaintext, deviceKey);
  await setSetting(key, encrypted);
}

export async function readSecret(
  settings: Settings,
  key: string,
): Promise<string | null> {
  const value = settings[key];
  const deviceKey = settings[SETTING_KEYS.deviceKey];
  if (!value || !deviceKey) return null;
  try {
    return await decryptWithDeviceKey(value, deviceKey);
  } catch (error) {
    console.warn("Stored secret could not be decrypted", key, error);
    return null;
  }
}

export function hasSecret(settings: Settings, key: string): boolean {
  return Boolean(settings[key]);
}
