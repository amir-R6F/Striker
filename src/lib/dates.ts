/** Local calendar days are stored as YYYY-MM-DD so SQLite and UI agree. */
export function toKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, amount: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + amount);
  return toKey(date);
}

export function formatLongDay(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
