import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { TryVisitorPanel } from "@/components/TryVisitorPanel";
import { ChampionShell } from "@/components/ChampionNav";
import { MtBadge, SampleBadge } from "@/components/Badges";
import { Highlight } from "@/components/Highlight";
import { fetchAnswers, LANGS, TOPIC_ICON } from "@/lib/tour";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Answer library — TourCoach" }, { name: "description", content: "All approved answers." }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const answers = useQuery({ queryKey: ["answers", "approved"], queryFn: () => fetchAnswers("approved") });
  return (
    <ChampionShell title="Library" icon={<BookOpen className="h-8 w-8" />}>
      <TryVisitorPanel />
      {answers.data?.length === 0 && <p className="text-center text-5xl">📭</p>}
      <div className="space-y-4">
        {(answers.data ?? []).map((a) => {
          const q = a.recordings?.questions;
          return (
            <article key={a.id} className="rounded-3xl border-4 border-success bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-3xl">{TOPIC_ICON[q?.topic ?? ""]}</span>
                <h2 className="text-lg font-bold">{q?.text_en}</h2>
                {a.is_sample && <SampleBadge />}
              </div>
              {LANGS.map((l) => (
                <p key={l.code} className="mb-2 leading-relaxed"><span className="mr-2 text-xl">{l.flag}</span><Highlight text={a[l.field]} /></p>
              ))}
              <MtBadge />
            </article>
          );
        })}
      </div>
    </ChampionShell>
  );
}
