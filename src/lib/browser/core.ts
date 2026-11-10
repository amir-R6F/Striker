import { pickedFiles } from "./fileStore";
import { resetBrowserDatabase } from "./sqljs";
import {
  deleteEvidenceFileById,
  evidenceIdFromPath,
  getEvidenceFile,
  isBrowserEvidencePath,
  putEvidenceFile,
} from "./evidenceStore";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  json: "application/json",
  csv: "text/csv",
  md: "text/markdown",
  txt: "text/plain",
  striker: "application/octet-stream",
};

function mimeForName(name: string, fallback = "application/octet-stream"): string {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[extension] ?? fallback;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function stripDataUrl(value: string): string {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
}

function download(filename: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}

function downloadText(filename: string, contents: string): string {
  return download(
    filename,
    new Blob([contents], { type: mimeForName(filename, "text/plain") }),
  );
}

function downloadBase64(filename: string, data: string): string {
  const bytes = base64ToBytes(stripDataUrl(data));
  return download(
    filename,
    new Blob([bytes as BlobPart], { type: mimeForName(filename) }),
  );
}

function pickTextFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
      reader.readAsText(file);
    };
    input.oncancel = () => {
      input.remove();
      reject(new Error("No file selected"));
    };
    document.body.appendChild(input);
    input.click();
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(stripDataUrl(result));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

async function storeEvidenceFile(
  name: string,
  dataB64: string,
  mime?: string,
): Promise<string> {
  return putEvidenceFile(name, mime || mimeForName(name), stripDataUrl(dataB64));
}

async function openExternal(target: string): Promise<null> {
  const value = target.trim();
  if (/^https?:\/\//i.test(value)) {
    window.open(value, "_blank", "noopener");
    return null;
  }
  if (isBrowserEvidencePath(value)) {
    try {
      const record = await getEvidenceFile(evidenceIdFromPath(value));
      if (record) {
        window.open(
          `data:${record.mime};base64,${record.dataB64}`,
          "_blank",
          "noopener",
        );
        return null;
      }
    } catch (error) {
      console.warn("[browser-tauri] could not open evidence", error);
      return null;
    }
  }
  console.warn(
    "[browser-tauri] open_external only supports http(s) links and browser evidence in browser mode:",
    value,
  );
  return null;
}

/**
 * Mimics `@tauri-apps/api/core`. Commands the app relies on are mapped to
 * browser equivalents; anything else warns instead of crashing the UI.
 */
export async function invoke(command: string, args?: unknown): Promise<unknown> {
  const input = (args ?? {}) as Record<string, unknown>;
  const stringArg = (key: string): string =>
    typeof input[key] === "string" ? (input[key] as string) : "";

  switch (command) {
    case "read_json_file": {
      const path = stringArg("path");
      const file = pickedFiles.get(path);
      if (!file) {
        throw new Error("Choose a JSON file before importing.");
      }
      if (!file.name.toLowerCase().endsWith(".json")) {
        throw new Error("Only .json roadmap files can be imported.");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Roadmap files must be 2 MB or smaller.");
      }
      return file.text();
    }

    case "database_path":
      return "localStorage: striker-mini-browser-db";

    case "reset_browser_db":
      resetBrowserDatabase();
      return null;

    case "autostart_is_enabled":
      try {
        return window.localStorage.getItem("striker-mini-autostart") === "true";
      } catch {
        return false;
      }

    case "autostart_set": {
      try {
        window.localStorage.setItem(
          "striker-mini-autostart",
          input.enabled === true ? "true" : "false",
        );
      } catch {
        // Cosmetic only in browser mode.
      }
      return null;
    }

    case "open_external":
    case "openExternal":
    case "shell_open": {
      const target =
        stringArg("target") || stringArg("path") || stringArg("url");
      return openExternal(target);
    }

    case "save_evidence_base64":
    case "save_evidence_file": {
      const name = stringArg("fileName") || stringArg("name") || "evidence";
      const data = stringArg("data");
      if (!data) throw new Error("No evidence data was provided");
      return storeEvidenceFile(name, data, stringArg("mime") || undefined);
    }

    case "attach_evidence":
    case "copy_evidence_file": {
      const file = input.file;
      if (!(file instanceof File)) {
        throw new Error("Browser mode needs a File to attach evidence");
      }
      const data = await readFileAsBase64(file);
      return storeEvidenceFile(file.name, data, file.type);
    }

    case "read_evidence_image": {
      const path = stringArg("path");
      if (!isBrowserEvidencePath(path)) {
        throw new Error("Only browser evidence files can be previewed");
      }
      const record = await getEvidenceFile(evidenceIdFromPath(path));
      if (!record) throw new Error("That evidence file is no longer available");
      return `data:${record.mime};base64,${record.dataB64}`;
    }

    case "delete_evidence_file": {
      const path = stringArg("path");
      if (isBrowserEvidencePath(path)) {
        await deleteEvidenceFileById(evidenceIdFromPath(path));
      }
      return null;
    }

    case "export_file":
    case "report_export":
    case "save_file": {
      const filename = stringArg("filename") || stringArg("fileName") || `${command}.out`;
      if (typeof input.contents === "string") {
        return downloadText(filename, input.contents);
      }
      if (typeof input.data === "string") {
        return downloadBase64(filename, input.data);
      }
      console.warn("[browser-tauri] export command without contents:", command);
      return null;
    }

    case "export_binary_base64": {
      const filename = stringArg("fileName") || `${command}.out`;
      if (typeof input.data === "string") {
        return downloadBase64(filename, input.data);
      }
      console.warn("[browser-tauri] export_binary_base64 without data");
      return null;
    }

    case "write_sync_file": {
      const filename = stringArg("fileName") || "striker-backup.striker";
      if (typeof input.contents === "string") {
        downloadText(filename, input.contents);
      }
      const folder = stringArg("folder");
      return folder ? `${folder.replace(/[\\/]+$/, "")}/${filename}` : filename;
    }

    case "read_sync_file":
      return pickTextFile();

    default:
      break;
  }

  const maybeFilename =
    stringArg("filename") || stringArg("fileName") || `${command}.out`;
  if (
    /export|save|write_sync_file|report/i.test(command) &&
    (typeof input.contents === "string" ||
      typeof input.data === "string" ||
      typeof input.bytes === "string")
  ) {
    const payload =
      (input.contents as string | undefined) ??
      (input.data as string | undefined) ??
      (input.bytes as string | undefined) ??
      "";
    return downloadText(maybeFilename, payload);
  }

  if (/restore/i.test(command)) {
    return pickTextFile();
  }

  console.warn("[browser-tauri] invoke unhandled:", command, args);
  return null;
}

export function convertFileSrc(filePath: string): string {
  return filePath;
}

export function transformCallback(
  _callback?: unknown,
  _once?: boolean,
): () => void {
  return () => {};
}

export const isTauri = false;
