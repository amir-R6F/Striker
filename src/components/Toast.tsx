import { useMiniStore } from "../store/useMiniStore";
import { cx } from "./ui";

export function Toast() {
  const toast = useMiniStore((state) => state.toast);
  const dismiss = useMiniStore((state) => state.dismissToast);
  if (!toast) return null;

  return (
    <button
      type="button"
      onClick={dismiss}
      role="status"
      className={cx(
        "toast-in absolute inset-x-3 bottom-[72px] z-50 rounded-lg border px-3 py-2 text-left text-[11.5px] font-medium shadow-lg",
        toast.kind === "error" &&
          "border-danger/35 bg-card text-danger",
        toast.kind === "success" &&
          "border-success/35 bg-card text-success",
        toast.kind === "info" && "border-line bg-card text-ink",
      )}
    >
      {toast.message}
    </button>
  );
}
