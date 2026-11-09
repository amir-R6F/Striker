import { invoke } from "@tauri-apps/api/core";
import type { Evidence, EvidenceInput, EvidenceKind } from "./types";

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function evidenceKindFor(value: string): EvidenceKind {
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "link";
  const extension = lower.split(/[\\/.]/).pop() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  return "file";
}

export function evidenceName(
  item: Pick<Evidence, "path" | "original_name" | "kind">,
): string {
  if (item.original_name?.trim()) return item.original_name.trim();
  if (item.kind === "link") return item.path;
  const parts = item.path.split(/[\\/]/);
  return parts[parts.length - 1] || item.path;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Copies a selected browser File into the app data evidence folder. */
export async function importEvidenceFile(file: File): Promise<EvidenceInput> {
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Evidence files must be 8 MB or smaller");
  }
  const kind: EvidenceKind =
    file.type === "application/pdf"
      ? "pdf"
      : file.type.startsWith("image/")
        ? "image"
        : evidenceKindFor(file.name);
  const data = await fileToBase64(file);
  const path = await invoke<string>("save_evidence_base64", {
    fileName: file.name,
    data,
  });
  return { kind, path, originalName: file.name };
}

/** Returns a local evidence image as a displayable data URL. */
export async function readEvidenceImage(path: string): Promise<string> {
  return invoke<string>("read_evidence_image", { path });
}

export function makeEvidenceLink(url: string): EvidenceInput {
  return {
    kind: "link",
    path: url.trim(),
    originalName: url.trim(),
  };
}
