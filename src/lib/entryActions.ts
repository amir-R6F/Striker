import { deleteEntry, getEntryEvidence } from "./db";
import { deleteEvidenceFile } from "./evidence";

/**
 * Confirms and deletes an entry. Linked rows are removed by `deleteEntry`;
 * copied files are only removed when the user confirms the second prompt.
 */
export async function confirmDeleteEntry(entryId: number): Promise<boolean> {
  const confirmed = window.confirm(
    "Delete this entry? Its skill links are removed and linked milestones are updated.",
  );
  if (!confirmed) return false;

  const evidence = await getEntryEvidence(entryId);
  const files = evidence.filter((item) => item.kind !== "link");
  let deleteFiles = false;
  if (files.length > 0) {
    deleteFiles = window.confirm(
      `Also delete ${files.length === 1 ? "the attached file" : `${files.length} attached files`} from disk?\n\nChoose Cancel to keep the files.`,
    );
  }

  await deleteEntry(entryId);
  if (deleteFiles) {
    for (const item of files) {
      await deleteEvidenceFile(item.path).catch((error: unknown) => {
        console.warn("Could not delete evidence file", error);
      });
    }
  }
  return true;
}
