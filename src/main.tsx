import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

async function bootstrap(): Promise<void> {
  // Replaced with a literal at build time: false for `tauri dev`/`tauri build`,
  // true for `vite dev` and pure-web `vite build`.
  if (__STRIKER_BROWSER__) {
    const { installBrowserMocks } = await import("./lib/browser");
    installBrowserMocks();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
