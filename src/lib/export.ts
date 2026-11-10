import { invoke } from "@tauri-apps/api/core";

export async function writeExportFile(
  fileName: string,
  contents: string,
): Promise<string> {
  return invoke<string>("export_file", { fileName, contents });
}

export async function databasePath(): Promise<string> {
  return invoke<string>("database_path");
}
