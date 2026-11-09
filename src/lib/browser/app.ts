export async function getVersion(): Promise<string> {
  return "0.0.0-browser";
}

export async function getName(): Promise<string> {
  return "Striker (browser)";
}

export async function getTauriVersion(): Promise<string> {
  return "2-mock";
}
