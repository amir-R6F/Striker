import { invoke } from "@tauri-apps/api/core";
import { fetch as httpFetch } from "@tauri-apps/plugin-http";
import { decryptBackup, encryptBackup } from "./backup";
import { bytesToBase64 } from "./crypto";
import { getExportBundle } from "./db";
import { isAbsoluteLocalPath } from "./integrations";
import { readSecret } from "./secrets";
import {
  SETTING_KEYS,
  syncFileName,
  syncKind,
  type Settings,
  type SyncKind,
} from "./settings";
import type { ExportBundle } from "./types";

export interface SyncConfig {
  kind: SyncKind;
  folder: string;
  webdavUrl: string;
  username: string;
  password: string;
  fileName: string;
}

export async function syncConfigFromSettings(
  settings: Settings,
): Promise<SyncConfig> {
  const kind = syncKind(settings);
  const password =
    kind === "webdav"
      ? (await readSecret(settings, SETTING_KEYS.syncWebdavPassword)) ?? ""
      : "";
  return {
    kind,
    folder: settings[SETTING_KEYS.syncFolder] ?? "",
    webdavUrl: settings[SETTING_KEYS.syncWebdavUrl] ?? "",
    username: settings[SETTING_KEYS.syncWebdavUser] ?? "",
    password,
    fileName: syncFileName(settings),
  };
}

export function sanitizeSyncFileName(value: string): string {
  const trimmed = value.trim() || "striker-backup.striker";
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
  // Never allow the joined path to resolve to the folder itself or its parent.
  if (/^\.+$/.test(cleaned)) return "striker-backup.striker";
  return cleaned;
}

export function validateSyncConfig(config: SyncConfig): string | null {
  if (!config.fileName.trim()) return "Choose a backup file name.";
  if (config.kind === "folder") {
    if (!isAbsoluteLocalPath(config.folder)) {
      return "Enter an absolute local backup folder.";
    }
    return null;
  }

  if (!/^https?:\/\//i.test(config.webdavUrl.trim())) {
    return "Enter an http(s) WebDAV folder URL.";
  }
  return null;
}

function webdavFileUrl(config: SyncConfig): string {
  return `${config.webdavUrl.replace(/\/+$/, "")}/${encodeURIComponent(
    sanitizeSyncFileName(config.fileName),
  )}`;
}

function authorizationHeader(config: SyncConfig): Record<string, string> {
  if (!config.username && !config.password) return {};
  const credentials = `${config.username}:${config.password}`;
  const encoded = bytesToBase64(new TextEncoder().encode(credentials));
  return { Authorization: `Basic ${encoded}` };
}

/** Builds an encrypted payload from the local database. */
export async function buildEncryptedBackup(passphrase: string): Promise<string> {
  const bundle = await getExportBundle({ includeSecrets: true });
  return encryptBackup(bundle, passphrase);
}

/** Decrypts and validates a backup, returning the bundle without touching data. */
export async function readEncryptedBackup(
  contents: string,
  passphrase: string,
): Promise<ExportBundle> {
  return decryptBackup(contents, passphrase);
}

/** Writes the encrypted backup to the configured folder or WebDAV endpoint. */
export async function uploadBackup(
  config: SyncConfig,
  contents: string,
): Promise<string> {
  const fileError = validateSyncConfig(config);
  if (fileError) throw new Error(fileError);

  if (config.kind === "folder") {
    return invoke<string>("write_sync_file", {
      folder: config.folder.trim(),
      fileName: sanitizeSyncFileName(config.fileName),
      contents,
    });
  }

  const response = await httpFetch(webdavFileUrl(config), {
    method: "PUT",
    headers: {
      ...authorizationHeader(config),
      "Content-Type": "application/octet-stream",
    },
    body: contents,
  });
  if (!response.ok) {
    throw new Error(
      `WebDAV upload failed (${response.status} ${response.statusText}).`,
    );
  }
  return webdavFileUrl(config);
}

/** Reads the encrypted backup from the configured folder or WebDAV endpoint. */
export async function downloadBackup(config: SyncConfig): Promise<string> {
  const fileError = validateSyncConfig(config);
  if (fileError) throw new Error(fileError);

  if (config.kind === "folder") {
    return invoke<string>("read_sync_file", {
      folder: config.folder.trim(),
      fileName: sanitizeSyncFileName(config.fileName),
    });
  }

  const response = await httpFetch(webdavFileUrl(config), {
    method: "GET",
    headers: authorizationHeader(config),
  });
  if (response.status === 404) {
    throw new Error("No backup was found at that WebDAV location.");
  }
  if (!response.ok) {
    throw new Error(
      `WebDAV download failed (${response.status} ${response.statusText}).`,
    );
  }
  return response.text();
}
