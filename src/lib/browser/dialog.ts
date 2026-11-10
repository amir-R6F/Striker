import { filePathFor, pickedFiles } from "./fileStore";

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

function pick(options: OpenDialogOptions): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = Boolean(options.multiple);
    input.style.display = "none";
    if (options.directory) {
      input.setAttribute("webkitdirectory", "");
    }
    const accept = options.filters
      ?.flatMap((filter) => filter.extensions.map((extension) => `.${extension}`))
      .join(",");
    if (accept) input.accept = accept;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length === 0) {
        reject(new Error("No file selected"));
        return;
      }
      resolve(files);
    };
    input.oncancel = () => {
      input.remove();
      reject(new Error("No file selected"));
    };
    document.body.appendChild(input);
    input.click();
  });
}

export async function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  try {
    const files = await pick(options);
    const paths = files.map((file) => {
      const path = filePathFor(file);
      pickedFiles.set(path, file);
      return path;
    });
    return options.multiple ? paths : (paths[0] ?? null);
  } catch {
    return null;
  }
}

export async function save(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  const suggested = options.defaultPath ?? "striker-export.txt";
  const answer = window.prompt("Save as", suggested);
  return answer && answer.trim() ? answer.trim() : null;
}

export async function message(
  text: string,
  _options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<void> {
  window.alert(text);
}

export async function ask(
  text: string,
  _options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<boolean> {
  return window.confirm(text);
}

export async function confirm(
  text: string,
  _options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<boolean> {
  return window.confirm(text);
}
