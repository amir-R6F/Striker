/** Fake paths returned by the browser dialog mock. */
export const pickedFiles = new Map<string, File>();

/** Bytes written through the fs mock; never touches real disk. */
export const virtualFiles = new Map<string, Uint8Array>();

export function filePathFor(file: File): string {
  return `browser-file://${file.name}`;
}
