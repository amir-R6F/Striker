import type { EvidenceInput } from "./types";

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function isAbsoluteLocalPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("\\\\") ||
    trimmed.startsWith("/")
  );
}

/** Recognises a GitHub commit, issue, PR, file, repository or gist URL. */
export function githubEvidence(value: string): EvidenceInput | null {
  const url = parseHttpUrl(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const isGist = host === "gist.github.com";
  if (!isGist && host !== "github.com" && host !== "www.github.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  let label = "GitHub link";
  if (isGist) {
    label = "GitHub gist";
  } else if (parts.length >= 3) {
    if (parts[2] === "commit") label = "GitHub commit";
    else if (parts[2] === "issues") label = "GitHub issue";
    else if (parts[2] === "pull") label = "GitHub pull request";
    else if (parts[2] === "blob" || parts[2] === "tree") label = "GitHub file";
    else if (parts.length >= 2) label = "GitHub repository";
  } else if (parts.length >= 2) {
    label = "GitHub repository";
  } else {
    return null;
  }

  return { kind: "link", path: url.toString(), originalName: label };
}

export function artStationEvidence(value: string): EvidenceInput | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "artstation.com" && !host.endsWith(".artstation.com")) return null;
  return {
    kind: "link",
    path: url.toString(),
    originalName: "ArtStation",
  };
}

/** A Blender project stays a local path; it is opened with the desktop shell. */
export function blenderEvidence(value: string): EvidenceInput | null {
  const path = value.trim();
  if (!path || !path.toLowerCase().endsWith(".blend")) return null;
  if (!isAbsoluteLocalPath(path)) return null;
  const name = path.split(/[\\/]/).pop() || "Blender project";
  return {
    kind: "file",
    path,
    originalName: `Blender · ${name}`,
  };
}
