import { useState } from "react";
import { useMiniStore } from "../store/useMiniStore";
import { BoltIcon, FlameIcon } from "./icons";
import { Button } from "./ui";
import { CreateTreeDialog } from "./CreateTreeDialog";
import { ImportSheet } from "./ImportSheet";

export function Onboarding() {
  const skipOnboarding = useMiniStore((state) => state.skipOnboarding);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  return (
    <main className="flex h-full flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-[330px] text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent shadow-sm">
          <FlameIcon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">
          Striker Mini
        </h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          Pick a tree, check what you did, strike the day.
        </p>

        <div className="mt-7 space-y-2">
          <Button
            className="h-12 w-full text-[13px]"
            onClick={() => setImporting(true)}
          >
            <BoltIcon className="h-4 w-4" />
            Import tree (JSON)
          </Button>
          <Button
            variant="subtle"
            className="h-12 w-full text-[13px]"
            onClick={() => setCreating(true)}
          >
            Create blank tree
          </Button>
        </div>

        <button
          type="button"
          onClick={() => void skipOnboarding()}
          className="mt-5 text-[11px] text-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Skip for now
        </button>
      </div>

      <CreateTreeDialog open={creating} onClose={() => setCreating(false)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </main>
  );
}
