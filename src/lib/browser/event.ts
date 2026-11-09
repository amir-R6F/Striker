type UnlistenFn = () => void;

interface MockEvent<T> {
  event: string;
  id: number;
  payload: T;
}

type Handler = (event: MockEvent<unknown>) => void;

const listeners = new Map<string, Set<Handler>>();
let nextEventId = 1;

/** Minimal in-page event bus so listen/emit pairs keep working in one tab. */
export async function listen<T>(
  event: string,
  handler: (event: MockEvent<T>) => void,
): Promise<UnlistenFn> {
  const set = listeners.get(event) ?? new Set<Handler>();
  set.add(handler as Handler);
  listeners.set(event, set);
  return async () => {
    set.delete(handler as Handler);
    if (set.size === 0) listeners.delete(event);
  };
}

export async function once<T>(
  event: string,
  handler: (event: MockEvent<T>) => void,
): Promise<UnlistenFn> {
  let unlisten: UnlistenFn = () => {};
  unlisten = await listen<T>(event, (payload) => {
    unlisten();
    handler(payload);
  });
  return unlisten;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  const set = listeners.get(event);
  if (!set) return;
  const detail: MockEvent<unknown> = {
    event,
    id: nextEventId++,
    payload,
  };
  for (const handler of [...set]) handler(detail);
}

export type { MockEvent, UnlistenFn };
