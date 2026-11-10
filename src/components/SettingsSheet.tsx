import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useMiniStore } from "../store/useMiniStore";
import {
  idleHideMinutes,
  showCounts as showCountsSetting,
  themeChoice,
} from "../lib/settings";
import type { ThemeChoice } from "../lib/types";
import { CloseIcon } from "./icons";
import { CreateTreeDialog } from "./CreateTreeDialog";
import { ImportSheet } from "./ImportSheet";
import {
  Button,
  IconButton,
  Modal,
  Segmented,
  TextInput,
  Toggle,
} from "./ui";

export function SettingsSheet({ open }: { open: boolean }) {
  const closeSettings = useMiniStore((state) => state.closeSettings);
  const settings = useMiniStore((state) => state.settings);
  const dbPath = useMiniStore((state) => state.dbPath);
  const setTheme = useMiniStore((state) => state.setTheme);
  const setIdleMinutes = useMiniStore((state) => state.setIdleMinutes);
  const toggleShowCounts = useMiniStore((state) => state.toggleShowCounts);
  const toggleAutoStart = useMiniStore((state) => state.toggleAutoStart);
  const exportTree = useMiniStore((state) => state.exportTree);
  const [idleDraft, setIdleDraft] = useState(
    String(idleHideMinutes(settings)),
  );
  const [version, setVersion] = useState("0.1.0");
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setIdleDraft(String(idleHideMinutes(settings)));
  }, [settings]);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  if (!open) return null;

  const theme = themeChoice(settings);
  const counts = showCountsSetting(settings);
  const autoStart = settings.auto_start === "true";

  function commitIdle() {
    const value = Number(idleDraft);
    if (!Number.isFinite(value) || value < 1) {
      setIdleDraft(String(idleHideMinutes(settings)));
      return;
    }
    void setIdleMinutes(value);
  }

  async function resetBrowserDb() {
    if (
      !window.confirm(
        "Reset the browser database? This deletes every tree, strike and setting in this browser.",
      )
    ) {
      return;
    }
    try {
      // Clears the in-memory sql.js database too; otherwise the beforeunload
      // flush would write it straight back to localStorage.
      await invoke("reset_browser_db");
    } catch (error) {
      console.warn("Could not reset the browser database", error);
    }
    window.localStorage.removeItem("striker-mini-browser-db");
    window.location.reload();
  }

  return (
    <Modal label="Settings">
      <div className="flex h-full flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <div>
            <h2 className="text-[14px] font-semibold">Settings</h2>
            <p className="text-[10px] text-muted">Striker Mini</p>
          </div>
          <IconButton label="Close settings" onClick={closeSettings}>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Tree
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="subtle"
                className="h-9 text-[11.5px]"
                onClick={() => setImporting(true)}
              >
                Import roadmap
              </Button>
              <Button
                variant="subtle"
                className="h-9 text-[11.5px]"
                onClick={() => void exportTree()}
              >
                Export JSON
              </Button>
            </div>
            <Button
              variant="ghost"
              className="h-8 w-full justify-start px-2 text-[11.5px]"
              onClick={() => setCreating(true)}
            >
              New blank tree
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Appearance
            </h3>
            <Segmented<ThemeChoice>
              value={theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              onChange={(value) => void setTheme(value)}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Behavior
            </h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium">Idle hide</p>
                <p className="text-[10px] text-muted">
                  Hide the widget after this many minutes.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <TextInput
                  type="number"
                  min={1}
                  max={60}
                  value={idleDraft}
                  onChange={(event) => setIdleDraft(event.target.value)}
                  onBlur={commitIdle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitIdle();
                  }}
                  aria-label="Idle hide minutes"
                  className="h-8 w-14 px-2 text-center text-[12px]"
                />
                <span className="text-[10.5px] text-muted">min</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium">Show strike counts</p>
                <p className="text-[10px] text-muted">
                  Display the “N×” badge on nodes.
                </p>
              </div>
              <Toggle
                checked={counts}
                onChange={() => void toggleShowCounts()}
                label="Show strike counts"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium">
                  Auto-start with Windows
                </p>
                <p className="text-[10px] text-muted">
                  Launch hidden in the tray at sign-in.
                </p>
              </div>
              <Toggle
                checked={autoStart}
                onChange={(value) => void toggleAutoStart(value)}
                label="Auto-start with Windows"
              />
            </div>
          </section>

          {__STRIKER_BROWSER__ ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Browser preview
              </h3>
              <p className="text-[10px] leading-relaxed text-muted">
                This web build keeps its database in localStorage. Resetting
                clears every tree, strike and setting in this browser.
              </p>
              <Button
                variant="subtle"
                className="h-9 w-full justify-start px-3 text-danger"
                onClick={() => void resetBrowserDb()}
              >
                Reset browser DB
              </Button>
            </section>
          ) : null}

          <section className="space-y-2 border-t border-line pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              About
            </h3>
            <dl className="space-y-1.5 text-[10.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Version</dt>
                <dd className="tabular-nums">{version}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Branch</dt>
                <dd className="font-mono">mini</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted">SQLite path</dt>
                <dd className="break-all rounded-md bg-card2/60 px-2 py-1 font-mono text-[9.5px] leading-relaxed">
                  {dbPath}
                </dd>
              </div>
            </dl>
          </section>

          <Button
            variant="subtle"
            className="h-10 w-full"
            onClick={closeSettings}
          >
            Close
          </Button>
        </div>
      </div>

      <ImportSheet open={importing} onClose={() => setImporting(false)} />
      <CreateTreeDialog open={creating} onClose={() => setCreating(false)} />
    </Modal>
  );
}
