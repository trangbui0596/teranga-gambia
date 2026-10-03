import { PLACES } from "@/lib/tour";

const re = new RegExp(`(\\+?\\d[\\d.,:\\s]*\\d|\\d+|${PLACES.map((p) => p.replace(/\s/g, "\\s")).join("|")}|euros?|dalasi|Euro|Dalasi)`, "g");

export function Highlight({ text }: { text: string | null }) {
  if (!text) return null;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-highlight px-1 font-bold text-foreground">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
