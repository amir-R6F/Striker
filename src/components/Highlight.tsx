export function Highlight({
  text,
  query,
}: {
  text: string | null | undefined;
  query: string;
}) {
  if (!text) return null;

  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  const needleLower = needle.toLowerCase();

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needleLower ? (
          <mark
            key={index}
            className="rounded bg-accent/25 px-0.5 text-ink"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
