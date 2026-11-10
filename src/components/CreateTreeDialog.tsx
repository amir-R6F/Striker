import { useState, type FormEvent } from "react";
import { useMiniStore } from "../store/useMiniStore";
import { Button, Modal, TextInput } from "./ui";

export function CreateTreeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createTree = useMiniStore((state) => state.createTree);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await createTree(title);
      setTitle("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Create a blank tree">
      <form
        onSubmit={(event) => void submit(event)}
        className="flex h-full flex-col justify-center gap-4 px-6"
      >
        <div>
          <h2 className="text-[17px] font-semibold">Create a blank tree</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Give it a name now. You can import nodes into it later.
          </p>
        </div>
        <TextInput
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Tree title"
          aria-label="Tree title"
          maxLength={120}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="subtle"
            className="h-10 flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-10 flex-1"
            disabled={!title.trim() || busy}
          >
            {busy ? "Creating…" : "Create tree"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
