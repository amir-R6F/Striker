import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { CheckIcon } from "./icons";
import { cx } from "./ui";

export function Toasts() {
  const toast = useAppStore((state) => state.toast);
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => dismissToast(toast.id), 2_600);
    return () => window.clearTimeout(id);
  }, [dismissToast, toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4"
    >
      <div
        className={cx(
          "toast-in flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium shadow-lg",
          toast.tone === "error"
            ? "bg-danger text-white"
            : "bg-ink text-bg",
        )}
      >
        {toast.tone === "success" ? <CheckIcon className="h-3.5 w-3.5" /> : null}
        <span className="truncate">{toast.message}</span>
      </div>
    </div>
  );
}
