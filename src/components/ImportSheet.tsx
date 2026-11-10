import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useMiniStore } from "../store/useMiniStore";
import type { ImportMode } from "../lib/db";
import {
  RoadmapValidationError,
  parseRoadmap,
  roadmapPromptTemplate,
} from "../lib/roadmap";
import { Button, cx, IconButton, Modal, Segmented, TextArea } from "./ui";
import { CloseIcon } from "./icons";

export function ImportSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const activeTree = useMiniStore((state) => state.activeTree);
  const importTree = useMiniStore((state) => state.importTree);
  const notify = useMiniStore((state) => state.notify);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("append");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(activeTree ? "merge" : "append");
    setErrors([]);
  }, [activeTree, open]);

  if (!open) return null;

  async function chooseFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: "Import a Striker roadmap",
        filters: [{ name: "Striker roadmap", extensions: ["json"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const contents = await invoke<string>("read_json_file", {
        path: selected,
      });
      setText(contents);
      setErrors([]);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not read that file",
        "error",
      );
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(roadmapPromptTemplate());
      notify("AI prompt copied", "success");
    } catch {
      notify("Could not copy the AI prompt", "error");
    }
  }

  async function submit() {
    if (busy) return;
    let roadmap;
    try {
      roadmap = parseRoadmap(text);
      setErrors([]);
    } catch (error) {
      if (error instanceof RoadmapValidationError) setErrors(error.errors);
      else {
        setErrors([
          error instanceof Error ? error.message : "Invalid roadmap.",
        ]);
      }
      return;
    }

    if (
      mode === "replace" &&
      !window.confirm(
        "Replace this tree's nodes? Current nodes and their strike links will be removed.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await importTree(mode, roadmap);
      setText("");
      onClose();
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Could not import the tree.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Import a tree">
      <div className="flex h-full flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <div>
            <h2 className="text-[14px] font-semibold">Import tree</h2>
            <p className="text-[10px] text-muted">Schema v1 · same as Striker</p>
          </div>
          <IconButton label="Close import" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="subtle"
              className="h-8 px-2.5 text-[11px]"
              onClick={() => void chooseFile()}
            >
              Choose JSON file
            </Button>
            <Button
              variant="subtle"
              className="h-8 px-2.5 text-[11px]"
              onClick={() => void copyPrompt()}
            >
              Copy AI prompt
            </Button>
          </div>

          <TextArea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setErrors([]);
            }}
            rows={8}
            aria-label="Roadmap JSON"
            placeholder='Paste a roadmap JSON object with "schema_version": 1'
            className="text-[10.5px] leading-relaxed"
          />

          {activeTree ? (
            <>
              <Segmented
                value={mode}
                options={[
                  { value: "merge", label: "Merge" },
                  { value: "replace", label: "Replace" },
                  { value: "append", label: "New tree" },
                ]}
                onChange={setMode}
              />
              <p className="text-[10px] leading-relaxed text-muted">
                Merge adds new ids and updates matching ids. Replace clears this
                tree first. New tree adds the roadmap as a separate tree.
              </p>
            </>
          ) : (
            <p className="text-[10px] leading-relaxed text-muted">
              This creates a new tree. Merge and Replace become available once a
              tree exists.
            </p>
          )}

          {errors.length > 0 ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5">
              <p className="text-[10px] font-semibold text-danger">
                Fix these before importing:
              </p>
              <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 text-[10px] leading-relaxed text-muted">
                {errors.slice(0, 12).map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            className={cx("h-10 w-full")}
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
          >
            {busy
              ? "Importing…"
              : mode === "append"
                ? "Import as new tree"
                : `Import (${mode})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
