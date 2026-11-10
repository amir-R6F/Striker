/**
 * Browser-mode evidence lives in IndexedDB because localStorage is too small
 * for images. Database rows keep a `browser-evidence://<id>` path.
 */
const DB_NAME = "striker-browser-evidence";
const STORE_NAME = "files";
const DB_VERSION = 1;

export const EVIDENCE_SCHEME = "browser-evidence://";

export interface BrowserEvidenceRecord {
  id: string;
  name: string;
  mime: string;
  dataB64: string;
  created_at: string;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

export function isBrowserEvidencePath(path: string): boolean {
  return path.startsWith(EVIDENCE_SCHEME);
}

export function evidenceIdFromPath(path: string): string {
  return path.slice(EVIDENCE_SCHEME.length);
}

export async function putEvidenceFile(
  name: string,
  mime: string,
  dataB64: string,
): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record: BrowserEvidenceRecord = {
    id,
    name,
    mime,
    dataB64,
    created_at: new Date().toISOString(),
  };
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save evidence"));
    });
  } finally {
    db.close();
  }
  return `${EVIDENCE_SCHEME}${id}`;
}

export async function getEvidenceFile(
  id: string,
): Promise<BrowserEvidenceRecord | null> {
  const db = await openStore();
  try {
    return await new Promise<BrowserEvidenceRecord | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as BrowserEvidenceRecord) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read evidence"));
    });
  } finally {
    db.close();
  }
}

export async function deleteEvidenceFileById(id: string): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not delete evidence"));
    });
  } finally {
    db.close();
  }
}
