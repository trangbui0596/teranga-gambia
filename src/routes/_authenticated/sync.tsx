import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Languages, Repeat, RefreshCw, Volume2, Check } from "lucide-react";
import { ChampionShell } from "@/components/ChampionNav";
import { SampleBadge, SimBadge } from "@/components/Badges";
import { fetchAnswers, TOPIC_ICON } from "@/lib/tour";

export const Route = createFileRoute("/_authenticated/sync")({
  head: () => ({ meta: [{ title: "Weekly sync — TourCoach" }, { name: "description", content: "Run the weekly transcribe, translate, check and voice steps." }] }),
  component: SyncPage,
});

const STEPS = [
  { icon: FileText, name: "Transcribe" },
  { icon: Languages, name: "Translate" },
  { icon: Repeat, name: "Round-trip check" },
  { icon: Volume2, name: "Voice" },
];

function SyncPage() {
  const answers = useQuery({ queryKey: ["answers", "all"], queryFn: () => fetchAnswers() });
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setProgress({});
    for (const a of answers.data ?? []) {
      for (let s = 1; s <= STEPS.length; s++) {
        await new Promise((r) => setTimeout(r, 180));
        setProgress((p) => ({ ...p, [a.id]: s }));
      }
    }
    setRunning(false);
  }

  return (
    <ChampionShell title="Sync" icon={<RefreshCw className="h-8 w-8" />}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SimBadge label="Simulated — no real processing yet" />
      </div>
      <button onClick={run} disabled={running} aria-label="Run weekly sync"
        className="tap mb-6 flex w-full items-center justify-center rounded-2xl bg-primary py-8 text-primary-foreground disabled:opacity-60">
        <RefreshCw className={`h-14 w-14 ${running ? "animate-spin" : ""}`} strokeWidth={2.5} />
      </button>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs font-bold text-muted-foreground">
        {STEPS.map(({ icon: I, name }) => (
          <div key={name} className="flex flex-col items-center gap-1"><I className="h-7 w-7" />{name}</div>
        ))}
      </div>
      <ul className="space-y-3">
        {(answers.data ?? []).map((a) => {
          const p = progress[a.id] ?? 0;
          const q = a.recordings?.questions;
          return (
            <li key={a.id} className="rounded-2xl border-2 border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl font-black">{q?.position}</span>
                <span className="text-2xl">{TOPIC_ICON[q?.topic ?? ""]}</span>
                {a.is_sample && <SampleBadge />}
                {p === STEPS.length && <Check className="ml-auto h-7 w-7 text-success" />}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {STEPS.map((s, i) => (
                  <div key={s.name} className={`h-4 rounded-full transition-colors ${i < p ? "bg-success" : "bg-muted"}`} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </ChampionShell>
  );
}
