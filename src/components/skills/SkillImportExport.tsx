import { useState, type ChangeEvent } from "react";
import { writeExportFile } from "../../lib/export";
import {
  RoadmapValidationError,
  buildRoadmap,
  parseRoadmap,
  roadmapFileName,
  roadmapPromptTemplate,
  type ParsedRoadmap,
  type RoadmapStats,
} from "../../lib/skillTree";
import type { Skill, SkillTree } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import { Button, Card, Segmented, TextArea } from "../ui";

export type ImportMode = "merge" | "replace" | "append";

interface Props {
  tree: SkillTree;
  nodes: Skill[];
  stats: Map<number, RoadmapStats>;
  onImport: (mode: ImportMode, roadmap: ParsedRoadmap) => Promise<void>;
}

export function SkillImportExport({ tree, nodes, stats, onImport }: Props) {
  const notify = useAppStore((state) => state.notify);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    try {
      const roadmap = buildRoadmap(tree, nodes, stats);
      const path = await writeExportFile(
        roadmapFileName(tree),
        JSON.stringify(roadmap, null, 2),
      );
      notify(`Roadmap exported to ${path}`);
    } catch (error) {
      console.error("Could not export roadmap", error);
      notify("Could not export the roadmap", "error");
    }
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(roadmapPromptTemplate());
      notify("AI prompt copied to the clipboard");
    } catch (error) {
      console.error("Could not copy the AI prompt", error);
      notify("Could not copy the AI prompt", "error");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setText(await file.text());
      setErrors([]);
      setOpen(true);
    } catch (error) {
      console.error("Could not read roadmap file", error);
      notify("Could not read that file", "error");
    }
  }

  async function handleImport() {
    if (busy) return;
    let parsed: ParsedRoadmap;
    try {
      parsed = parseRoadmap(text);
      setErrors([]);
    } catch (error) {
      if (error instanceof RoadmapValidationError) {
        setErrors(error.errors);
      } else {
        setErrors([error instanceof Error ? error.message : "Invalid roadmap."]);
      }
      return;
    }

    if (
      mode === "replace" &&
      !window.confirm(
        "Replace the current roadmap? Its nodes and their entry links will be removed first.",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await onImport(mode, parsed);
      setText("");
      setOpen(false);
    } catch (error) {
      console.error("Could not import roadmap", error);
      setErrors([error instanceof Error ? error.message : "Import failed."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="subtle"
          className="h-7 px-2 text-[10px]"
          onClick={() => void handleExport()}
        >
          Export JSON
        </Button>
        <Button
          variant="subtle"
          className="h-7 px-2 text-[10px]"
          onClick={() => void handleCopyPrompt()}
        >
          Copy AI prompt
        </Button>
        <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-line bg-card2/60 px-2 text-[10px] font-medium text-ink hover:bg-card2">
          Import file
          <input
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={(event) => void handleFile(event)}
          />
        </label>
        <Button
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide paste" : "Paste JSON"}
        </Button>
      </div>

      {open ? (
        <div className="space-y-2 border-t border-line pt-2">
          <TextArea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setErrors([]);
            }}
            rows={5}
            placeholder='Paste a roadmap JSON object with "schema_version": 1'
            aria-label="Roadmap JSON"
            className="font-mono text-[10px]"
          />
          <Segmented
            value={mode}
            options={[
              { value: "merge", label: "Merge" },
              { value: "replace", label: "Replace" },
              { value: "append", label: "New tree" },
            ]}
            onChange={setMode}
          />
          <p className="text-[9.5px] leading-relaxed text-muted">
            Merge adds new ids and updates matching ids. Replace clears this tree
            first. New tree appends the imported roadmap as a separate tree.
          </p>
          {errors.length > 0 ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2">
              <p className="text-[9.5px] font-semibold text-danger">
                Fix these before importing:
              </p>
              <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-[9.5px] leading-relaxed text-muted">
                {errors.slice(0, 12).map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            className="h-8 w-full text-[11px]"
            onClick={() => void handleImport()}
            disabled={busy || !text.trim()}
          >
            {busy ? "Importing…" : `Import (${mode})`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
