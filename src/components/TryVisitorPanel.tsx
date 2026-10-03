import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { answerVisitorQuestion } from "@/lib/matching.functions";
import { LANGS, type Lang } from "@/lib/tour";
import { MtBadge, SampleBadge, SimBadge } from "./Badges";
import { Highlight } from "./Highlight";

type Result = Awaited<ReturnType<typeof answerVisitorQuestion>>;

export function TryVisitorPanel() {
  const ask = useServerFn(answerVisitorQuestion);
  const [lang, setLang] = useState<Lang>("en");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function go() {
    setBusy(true);
    try { setRes(await ask({ data: { text, lang } })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mb-6 rounded-3xl border-4 border-dashed border-sim bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Try a visitor question</h2>
        <SimBadge />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Stand-in for a WhatsApp/SMS message. Keyword matching only.</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {LANGS.map((l) => (
          <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
            className={`tap rounded-2xl border-4 font-bold ${lang === l.code ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            <span className="text-2xl">{l.flag}</span> {l.code.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} aria-label="Visitor question"
          className="tap flex-1 rounded-2xl border-4 border-input bg-background px-4 text-lg outline-none focus:border-primary" />
        <button onClick={go} disabled={busy || !text.trim()} aria-label="Send"
          className="tap flex items-center justify-center rounded-2xl bg-primary px-4 text-primary-foreground disabled:opacity-50">
          <Send className="h-7 w-7" />
        </button>
      </div>
      {res && (
        <div className="mt-4 space-y-3 rounded-2xl bg-secondary p-4">
          <div className="flex flex-wrap gap-2"><MtBadge />{res.isSample && <SampleBadge />}</div>
          {res.matched
            ? <p className="text-lg leading-relaxed"><Highlight text={res.text} /></p>
            : <p className="flex items-center gap-2 text-lg font-bold"><HelpCircle className="h-8 w-8 text-primary" />{res.text}</p>}
          <a href={res.reviewUrl} target="_blank" rel="noopener noreferrer"
            className="tap flex items-center justify-center gap-2 rounded-2xl border-4 border-foreground bg-card font-bold">
            <Star className="h-5 w-5" /> Leave a Google review
          </a>
        </div>
      )}
    </section>
  );
}
