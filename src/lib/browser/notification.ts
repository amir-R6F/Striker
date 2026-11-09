function browserNotification():
  | (typeof Notification)
  | undefined {
  return typeof Notification === "undefined" ? undefined : Notification;
}

export async function isPermissionGranted(): Promise<boolean> {
  return browserNotification()?.permission === "granted";
}

export async function requestPermission(): Promise<NotificationPermission> {
  const api = browserNotification();
  if (!api) return "denied";
  try {
    return await api.requestPermission();
  } catch {
    return "denied";
  }
}

export function sendNotification(options: {
  title: string;
  body?: string;
}): void {
  const api = browserNotification();
  if (!api || api.permission !== "granted") {
    console.info("[browser-notification]", options.title, options.body ?? "");
    return;
  }
  try {
    new api(options.title, { body: options.body });
  } catch (error) {
    console.info("[browser-notification] could not show", options.title, error);
  }
}
