import { pickedFiles, virtualFiles } from "./fileStore";

export enum BaseDirectory {
  Audio = 1,
  Cache = 2,
  Config = 3,
  Data = 4,
  LocalData = 5,
  Document = 6,
  Download = 7,
  Picture = 8,
  Public = 9,
  Video = 10,
  Resource = 11,
  Temp = 12,
  AppConfig = 13,
  AppData = 14,
  AppLocalData = 15,
  AppCache = 16,
  AppLog = 17,
  Desktop = 18,
  Executable = 19,
  Font = 20,
  Home = 21,
  Runtime = 22,
  Template = 23,
}

async function bytesFor(path: string): Promise<Uint8Array> {
  const file = pickedFiles.get(path);
  if (file) return new Uint8Array(await file.arrayBuffer());
  const stored = virtualFiles.get(path);
  if (stored) return stored;
  throw new Error(`Browser file not found: ${path}`);
}

export async function readFile(path: string): Promise<Uint8Array> {
  return bytesFor(path);
}

export async function writeFile(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  virtualFiles.set(
    path,
    typeof data === "string" ? new TextEncoder().encode(data) : data,
  );
}

export async function readTextFile(path: string): Promise<string> {
  return new TextDecoder().decode(await bytesFor(path));
}

export async function writeTextFile(
  path: string,
  data: string,
): Promise<void> {
  await writeFile(path, data);
}

export async function exists(path: string): Promise<boolean> {
  return pickedFiles.has(path) || virtualFiles.has(path);
}

export async function createDir(): Promise<void> {}

export async function remove(path: string): Promise<void> {
  pickedFiles.delete(path);
  virtualFiles.delete(path);
}
