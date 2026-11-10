import { listen, type UnlistenFn } from "./event";

interface FocusEvent {
  event: string;
  id: number;
  payload: boolean;
}

interface MockWindow {
  show: () => Promise<void>;
  hide: () => Promise<void>;
  isVisible: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  setSkipTaskbar: (skip: boolean) => Promise<void>;
  setSize: (size: unknown) => Promise<void>;
  setPosition: (position: unknown) => Promise<void>;
  setFocus: () => Promise<void>;
  setDecorations: (decorations: boolean) => Promise<void>;
  listen: <T>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ) => Promise<UnlistenFn>;
  onFocusChanged: (
    handler: (event: FocusEvent) => void,
  ) => Promise<UnlistenFn>;
  onCloseRequested: (
    handler: (event: { preventDefault: () => void }) => void,
  ) => Promise<UnlistenFn>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  unminimize: () => Promise<void>;
}

const noop = async (): Promise<void> => {};

const currentWindow: MockWindow = {
  show: noop,
  hide: noop,
  isVisible: async () => true,
  setAlwaysOnTop: noop,
  setSkipTaskbar: noop,
  setSize: noop,
  setPosition: noop,
  setFocus: noop,
  setDecorations: noop,
  listen: (event, handler) => listen(event, handler),
  onFocusChanged: (handler) => {
    const onFocus = () =>
      handler({ event: "tauri://focus", id: 0, payload: true });
    window.addEventListener("focus", onFocus);
    return Promise.resolve(() => {
      window.removeEventListener("focus", onFocus);
    });
  },
  onCloseRequested: () => Promise.resolve(async () => {}),
  close: noop,
  minimize: noop,
  unminimize: noop,
};

export function getCurrentWindow(): MockWindow {
  return currentWindow;
}

export function getCurrent(): MockWindow {
  return currentWindow;
}

export default getCurrent;
