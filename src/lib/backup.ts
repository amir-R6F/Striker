import { invoke } from "@tauri-apps/api/core";
import { decryptWithPassphrase, encryptWithPassphrase } from "./crypto";
import type { ExportBundle } from "./types";

/** Copies the live SQLite database into an absolute folder path. */
export async function backupDatabaseTo(folder: string): Promise<string> {
  return invoke<string>("backup_database", { folder: folder.trim() });
}

interface BackupEnvelope {
  app: "Striker";
  type: "encrypted-backup";
  version: 1;
  created_at: string;
  payload: unknown;
}

export async function encryptBackup(
  bundle: ExportBundle,
  passphrase: string,
): Promise<string> {
  const encrypted = await encryptWithPassphrase(
    JSON.stringify(bundle),
    passphrase,
  );
  const envelope: BackupEnvelope = {
    app: "Striker",
    type: "encrypted-backup",
    version: 1,
    created_at: new Date().toISOString(),
    payload: JSON.parse(encrypted) as unknown,
  };
  return JSON.stringify(envelope);
}

export async function decryptBackup(
  contents: string,
  passphrase: string,
): Promise<ExportBundle> {
  let envelope: Partial<BackupEnvelope>;
  try {
    envelope = JSON.parse(contents) as Partial<BackupEnvelope>;
  } catch {
    throw new Error("That file is not an encrypted Striker backup.");
  }

  if (
    envelope.app !== "Striker" ||
    envelope.type !== "encrypted-backup" ||
    envelope.version !== 1 ||
    typeof envelope.payload !== "object" ||
    envelope.payload == null
  ) {
    throw new Error("That file is not an encrypted Striker backup.");
  }

  const plaintext = await decryptWithPassphrase(
    JSON.stringify(envelope.payload),
    passphrase,
  );

  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(plaintext) as ExportBundle;
  } catch {
    throw new Error("The decrypted backup is not valid JSON.");
  }

  if (
    bundle.app !== "Striker" ||
    !Array.isArray(bundle.goals) ||
    !Array.isArray(bundle.entries)
  ) {
    throw new Error("The decrypted backup is not a Striker data bundle.");
  }

  return bundle;
}
