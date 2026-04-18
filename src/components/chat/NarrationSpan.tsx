import { splitNarration } from "@/lib/narration";

export function NarrationText({ value }: { value: string }) {
  const segments = splitNarration(value);
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "narration" ? (
          <span key={i} className="narration">
            {s.value}
          </span>
        ) : (
          <span key={i}>{s.value}</span>
        )
      )}
    </>
  );
}
