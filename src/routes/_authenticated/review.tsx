import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Ear, Mic, Repeat, UsersRound, Volume2, Gauge, Bot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChampionShell } from "@/components/ChampionNav";
import { MtBadge, SampleBadge, SimBadge } from "@/components/Badges";
import { Highlight } from "@/components/Highlight";
import { fetchAnswers, LANGS, TOPIC_ICON, type AnswerRow } from "@/lib/tour";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({ meta: [{ title: "Review answers — TourCoach" }, { name: "description", content: "Listen, check and approve each answer." }] }),
  component: ReviewPage,
});

const STATUS: Record<AnswerRow["review_status"], { icon: string; cls: string }> = {
  pending: { icon: "⏳", cls: "bg-muted" },
  approved: { icon: "✅", cls: "bg-success text-success-foreground" },
  rerecord: { icon: "🎙️", cls: "bg-warning text-warning-foreground" },
  needs_bilingual: { icon: "👥", cls: "bg-river text-river-foreground" },
};

const FLAG_ICON: Record<string, { icon: typeof Repeat; label: string }> = {
  "round-trip mismatch": { icon: Repeat, label: "Round-trip mismatch" },
  "low confidence": { icon: Gauge, label: "Low confidence" },
  "machine-translated": { icon: Bot, label: "Machine-translated" },
};

function speak(text: string | null, lang: string) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

function Original({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    supabase.storage.from("recordings").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  if (!path) return (
    <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm"><Mic className="h-6 w-6" /> No audio <SampleBadge /></div>
  );
  return url ? <audio controls src={url} className="w-full" /> : <div className="h-12 animate-pulse rounded-xl bg-muted" />;
}

function ReviewPage() {
  const qc = useQueryClient();
  const answers = useQuery({ queryKey: ["answers", "all"], queryFn: () => fetchAnswers() });

  async function setStatus(a: AnswerRow, s: AnswerRow["review_status"]) {
    const { error } = await supabase.from("answers")
      .update({ review_status: s, approved_at: s === "approved" ? new Date().toISOString() : null }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(STATUS[s].icon);
    qc.invalidateQueries({ queryKey: ["answers"] });
  }

  return (
    <ChampionShell title="Review" icon={<Ear className="h-8 w-8" />}>
      <div className="space-y-6">
        {(answers.data ?? []).map((a) => {
          const q = a.recordings?.questions;
          return (
            <article key={a.id} className="overflow-hidden rounded-3xl border-4 border-border bg-card">
              <div className="flex items-center gap-3 bg-secondary p-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-2xl font-black">{q?.position}</span>
                <span className="text-4xl">{TOPIC_ICON[q?.topic ?? ""]}</span>
                <span className={`ml-auto rounded-full px-3 py-1 text-2xl ${STATUS[a.review_status].cls}`} aria-label={a.review_status}>
                  {STATUS[a.review_status].icon}
                </span>
                {a.is_sample && <SampleBadge />}
              </div>
              <div className="space-y-4 p-4">
                <section>
                  <div className="mb-1 flex items-center gap-2 font-bold"><Mic className="h-5 w-5" /> Fatou</div>
                  <Original path={a.recordings?.audio_path ?? null} />
                  <p className="mt-2 text-sm italic text-muted-foreground">{a.transcript_src}</p>
                </section>

                {a.flags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {a.flags.map((f) => {
                      const F = FLAG_ICON[f] ?? { icon: AlertTriangle, label: f };
                      const warn = f !== "machine-translated";
                      return (
                        <span key={f} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ${warn ? "bg-warning text-warning-foreground" : "bg-river text-river-foreground"}`}>
                          <F.icon className="h-5 w-5" /> {F.label}
                        </span>
                      );
                    })}
                    {a.roundtrip_score != null && (
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-border px-3 py-1.5 text-sm font-bold">
                        <Repeat className="h-4 w-4" /> {Math.round(Number(a.roundtrip_score) * 100)}%
                      </span>
                    )}
                  </div>
                )}

                {LANGS.map((l) => (
                  <section key={l.code} className="rounded-2xl border-2 border-border p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-2xl">{l.flag}</span>
                      <MtBadge />
                      <button onClick={() => speak(a[l.field], l.code)} aria-label={`Listen ${l.label}`}
                        className="tap ml-auto flex items-center justify-center rounded-xl bg-river text-river-foreground">
                        <Volume2 className="h-7 w-7" />
                      </button>
                    </div>
                    <p className="text-lg leading-relaxed"><Highlight text={a[l.field]} /></p>
                  </section>
                ))}
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Volume2 className="h-4 w-4" /> Phone voice preview <SimBadge /></p>

                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => setStatus(a, "approved")} aria-label="Approve"
                    className="tap flex flex-col items-center justify-center gap-1 rounded-2xl bg-success py-4 text-success-foreground">
                    <Check className="h-12 w-12" strokeWidth={3} />
                  </button>
                  <button onClick={() => setStatus(a, "rerecord")} aria-label="Re-record"
                    className="tap flex flex-col items-center justify-center gap-1 rounded-2xl bg-warning py-4 text-warning-foreground">
                    <Mic className="h-12 w-12" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setStatus(a, "needs_bilingual")} aria-label="Needs bilingual reviewer"
                    className="tap flex flex-col items-center justify-center gap-1 rounded-2xl bg-river py-4 text-river-foreground">
                    <UsersRound className="h-12 w-12" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </ChampionShell>
  );
}
