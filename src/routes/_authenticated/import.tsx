import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Bluetooth, CheckCircle2, Upload, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChampionShell } from "@/components/ChampionNav";
import { SimBadge } from "@/components/Badges";
import { TOPIC_ICON, isoWeek } from "@/lib/tour";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Question card & import — TourCoach" }, { name: "description", content: "Import recorded answers for the 10 questions." }] }),
  component: ImportPage,
});

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function ImportPage() {
  const qc = useQueryClient();
  const week = isoWeek();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const questions = useQuery({
    queryKey: ["questions"],
    queryFn: async () => (await supabase.from("questions").select("*").order("position")).data ?? [],
  });
  const recs = useQuery({
    queryKey: ["recordings", week],
    queryFn: async () => (await supabase.from("recordings").select("question_id, audio_path").eq("week", week)).data ?? [],
  });
  const done = new Set((recs.data ?? []).filter((r) => r.audio_path).map((r) => r.question_id));

  async function onFiles(files: FileList | null) {
    if (!files || !questions.data) return;
    const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setBusy(true);
    try {
      for (let i = 0; i < Math.min(sorted.length, questions.data.length); i++) {
        const q = questions.data[i]!;
        const f = sorted[i]!;
        const path = `${week}/q${q.position}-${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("recordings").upload(path, f, { contentType: f.type || "audio/mpeg" });
        if (up.error) throw up.error;
        const ins = await supabase.from("recordings").insert({ question_id: q.id, audio_path: path, week, status: "imported" });
        if (ins.error) throw ins.error;
      }
      toast.success(`✅ ${Math.min(sorted.length, 10)}`);
      qc.invalidateQueries({ queryKey: ["recordings"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChampionShell title="Record" icon={<Upload className="h-8 w-8" />}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-sim/10 p-3">
        <Bluetooth className="h-6 w-6 text-sim" />
        <span className="text-sm font-bold">Upload simulates Bluetooth transfer from the feature phone (demo: a smartphone in airplane mode stands in for it)</span>
        <SimBadge />
      </div>
      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button disabled={busy} onClick={() => inputRef.current?.click()} aria-label="Upload audio files"
        className="tap mb-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-6 text-2xl font-bold text-primary-foreground disabled:opacity-50">
        <Upload className="h-10 w-10" /> {busy ? "…" : "1 → 10"}
      </button>
      <ol className="space-y-3">
        {(questions.data ?? []).map((q) => (
          <li key={q.id} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl font-black">{q.position}</span>
            <span className="text-3xl" aria-hidden>{TOPIC_ICON[q.topic]}</span>
            <span className="flex-1 text-base">{q.text_en}</span>
            <button onClick={() => speak(q.text_en)} aria-label="Listen" className="tap flex items-center justify-center rounded-xl bg-river text-river-foreground">
              <Volume2 className="h-7 w-7" />
            </button>
            {done.has(q.id) && <CheckCircle2 className="h-8 w-8 text-success" aria-label="Recorded" />}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">Week {week}. Files are matched to questions by order (sorted by file name).</p>
    </ChampionShell>
  );
}
