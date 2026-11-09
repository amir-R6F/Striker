/**
 * Small Web Crypto helpers used for encrypted backups and stored secrets.
 *
 * Backups: PBKDF2-SHA256 (310k iterations) -> AES-256-GCM, with the salt and IV
 * stored alongside the ciphertext. The passphrase is never persisted.
 * Secrets: AES-256-GCM with a per-install device key kept in settings.
 */

const PBKDF2_ITERATIONS = 310_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** Web Crypto's DOM types require views backed by a plain ArrayBuffer. */
type Bytes = Uint8Array<ArrayBuffer>;

interface PassphraseEnvelope {
  version: number;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Bytes {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function derivePassphraseKey(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWithPassphrase(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await derivePassphraseKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODER.encode(plaintext),
  );
  const envelope: PassphraseEnvelope = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptWithPassphrase(
  serialized: string,
  passphrase: string,
): Promise<string> {
  let envelope: Partial<PassphraseEnvelope>;
  try {
    envelope = JSON.parse(serialized) as Partial<PassphraseEnvelope>;
  } catch {
    throw new Error("That file is not an encrypted Striker backup.");
  }

  if (
    envelope.version !== 1 ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.data !== "string" ||
    typeof envelope.iterations !== "number"
  ) {
    throw new Error("That file is not an encrypted Striker backup.");
  }

  if (
    envelope.iterations < MIN_PBKDF2_ITERATIONS ||
    envelope.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error("That backup uses unsupported encryption settings.");
  }

  try {
    const key = await derivePassphraseKey(
      passphrase,
      base64ToBytes(envelope.salt),
      envelope.iterations,
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.data),
    );
    return TEXT_DECODER.decode(plaintext);
  } catch {
    throw new Error("Wrong passphrase, or the backup is damaged.");
  }
}

export function createDeviceKey(): string {
  return bytesToBase64(randomBytes(32));
}

async function importDeviceKey(keyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(keyBase64),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Format: v1.<base64 iv>.<base64 ciphertext>. */
export async function encryptWithDeviceKey(
  plaintext: string,
  deviceKeyBase64: string,
): Promise<string> {
  const key = await importDeviceKey(deviceKeyBase64);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODER.encode(plaintext),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptWithDeviceKey(
  payload: string,
  deviceKeyBase64: string,
): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported secret format.");
  }
  const key = await importDeviceKey(deviceKeyBase64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(parts[1]) },
    key,
    base64ToBytes(parts[2]),
  );
  return TEXT_DECODER.decode(plaintext);
}
