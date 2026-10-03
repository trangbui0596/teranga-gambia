import { FlaskConical, Tag } from "lucide-react";

export function SimBadge({ label = "Simulated" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sim px-3 py-1 text-xs font-bold uppercase tracking-wide text-sim-foreground">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden /> {label}
    </span>
  );
}

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-sim px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-sim">
      <Tag className="h-3 w-3" aria-hidden /> Sample
    </span>
  );
}

export function MtBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-river px-2.5 py-0.5 text-xs font-bold text-river-foreground">
      Machine-translated
    </span>
  );
}
