import { useEffect, useRef, useState } from "react";
import { getEvidence } from "../lib/db";
import { formatShort } from "../lib/dates";
import { evidenceName, readEvidenceImage } from "../lib/evidence";
import { openTarget } from "../lib/export";
import type { EvidenceWithEntry, Milestone } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import { FileIcon, ImageIcon, LinkIcon } from "./icons";
import { Card, Select, Skeleton } from "./ui";

interface Props {
  goalId: number;
  milestones: Array<Pick<Milestone, "id" | "title">>;
  active: boolean;
}

function LazyImage({ path, label }: { path: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const dataUrl = await readEvidenceImage(path);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    const element = containerRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      void load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [path]);

  return (
    <div
      ref={containerRef}
      className="grid aspect-[4/3] place-items-center overflow-hidden bg-card2/60"
    >
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : failed ? (
        <ImageIcon className="h-5 w-5 text-muted/60" />
      ) : (
        <span className="text-[8.5px] text-muted/70">Loading…</span>
      )}
    </div>
  );
}

function evidenceIcon(kind: EvidenceWithEntry["kind"]) {
  if (kind === "image") return <ImageIcon className="h-5 w-5 text-muted/70" />;
  if (kind === "link") return <LinkIcon className="h-5 w-5 text-muted/70" />;
  return <FileIcon className="h-5 w-5 text-muted/70" />;
}

export function EvidenceGallery({ goalId, milestones, active }: Props) {
  const revision = useAppStore((state) => state.revision);
  const bumpRevision = useAppStore((state) => state.bumpRevision);
  const notify = useAppStore((state) => state.notify);

  const [milestoneId, setMilestoneId] = useState("");
  const [items, setItems] = useState<EvidenceWithEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const effectiveMilestone =
    milestoneId && milestones.some((milestone) => String(milestone.id) === milestoneId)
      ? Number(milestoneId)
      : null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    getEvidence(goalId, effectiveMilestone)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Could not load evidence", error);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, effectiveMilestone, goalId, revision]);

  async function open(item: EvidenceWithEntry) {
    try {
      await openTarget(item.path);
    } catch (error) {
      console.error("Could not open evidence", error);
      notify("Could not open that evidence", "error");
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Evidence
          </h2>
          <span className="text-[9.5px] tabular-nums text-muted">{items.length}</span>
        </div>
        {milestones.length > 0 ? (
          <div className="w-[145px] shrink-0">
            <Select
              value={milestoneId}
              onChange={(event) => setMilestoneId(event.target.value)}
              aria-label="Filter evidence by milestone"
              className="h-7 py-0 text-[9.5px]"
            >
              <option value="">Whole goal</option>
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.title}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="aspect-[4/3]" />
          <Skeleton className="aspect-[4/3]" />
        </div>
      ) : failed ? (
        <div className="flex items-center justify-between gap-2 py-3">
          <p className="text-[10.5px] text-muted">Could not load evidence.</p>
          <button
            type="button"
            onClick={bumpRevision}
            className="text-[10px] font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-3 text-center text-[10.5px] leading-relaxed text-muted">
          Attach images, PDFs or links while logging to build a portfolio
          {effectiveMilestone ? " for this milestone." : " for this goal."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void open(item)}
              className="overflow-hidden rounded-lg border border-line/70 bg-card2/30 text-left transition hover:border-accent/50"
            >
              {item.kind === "image" ? (
                <LazyImage path={item.path} label={evidenceName(item)} />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-card2/50">
                  {evidenceIcon(item.kind)}
                </div>
              )}
              <div className="p-1.5">
                <p className="truncate text-[9.5px] font-medium">
                  {evidenceName(item)}
                </p>
                <p className="mt-0.5 truncate text-[8.5px] text-muted">
                  {formatShort(item.entry_date)} · {item.kind}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
