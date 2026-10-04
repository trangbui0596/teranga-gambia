import { useEffect, useState, type KeyboardEvent, type ReactNode, Fragment } from "react";
import { EVIDENCE, INDICATOR_NAMES, RETRIEVED, evidence, wdiUrl } from "@/lib/evidence";
import {
  CHANNELS,
  COMMUNITY,
  CHAIN_TITLE,
  CHAIN,
  CHAIN_SUPPORT,
  STORY_TITLE,
  STORY_STEPS,
  STORY_MORE,
  REFERRALS_TITLE,
  REFERRALS_SUB,
  REFERRAL_STEPS,
  REFERRAL_FACTS,
  COMMUNITY_INTRO,
  COMMUNITY_TITLE,
  EXTRAS,
  FLOW,
  HOW_BANNER,
  NOT_MEASURED,
  OFFLINE_EXAMPLE_NOTE,
  OFFLINE_INTRO,
  OFFLINE_NOTE,
  PEOPLE,
  PRIVACY,
  PROBLEM_SUB,
  PROBLEM_STATEMENT,
  REAL_LIMITS,
  REAL_LIVE,
  REPO_URL,
  ROLES,
  SCREENS,
  SMS_SIM_CHIPS,
  SMS_SIM_NOTE,
  SOURCES_TOOLS,
  TABS,
  TILES,
  TRY_IT,
  VIDEO_URL,
  WHY_WHATSAPP,
  type TabId,
} from "@/lib/landing-content";
import { alertSms, visitorNotice } from "@/lib/community";
import { buildListingPack } from "@/lib/listing";
import { approvalSms, listingSms } from "@/lib/sms-text";

// Example texts for the "Works offline" tab. Built by the same code that sends the real SMS, from sample inputs.
const SAMPLE_PACK = buildListingPack({
  price: { text: "Sample answer.", sample: true },
  children: { text: "Sample answer.", sample: true },
});
const NOTICE_NOW = Date.parse("2026-10-04T12:00:00Z");
const NOTICE_DEMO = visitorNotice(
  [{ kind: "road", place: "Tendaba road", created_at: "2026-10-04T11:30:00Z" }],
  "en",
  NOTICE_NOW,
);
const SMS_EXAMPLES = [
  {
    label: "After Noor approves an answer",
    text: approvalSms("price", SAMPLE_PACK, "wo"),
  },
  { label: "When the community champion posts a notice", text: alertSms("road", "Tendaba road") },
  { label: "Her Google listing progress (she texts LISTING)", text: listingSms(SAMPLE_PACK, "wo") },
];

const retrievedLabel = new Date(`${RETRIEVED}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const pill =
  "inline-flex min-h-10 items-center rounded-full border-2 border-border bg-card px-4 font-bold no-underline hover:bg-secondary";
const linkCls = "underline decoration-dotted underline-offset-4 hover:decoration-solid";

function Ext({
  href,
  children,
  className = linkCls,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/** A statistic shown as a link to its World Bank data page. */
function Stat({ id, className }: { id: string; className?: string }) {
  const e = evidence(id);
  return (
    <Ext href={e.href} className={className ?? linkCls}>
      {e.value}
    </Ext>
  );
}

function Hero() {
  return (
    <section aria-labelledby="problem" className="pt-6 sm:pt-8">
      <p className="text-sm font-bold uppercase tracking-widest text-primary">The problem</p>
      <h1
        id="problem"
        className="mt-2 text-3xl font-black leading-[1.1] sm:text-5xl sm:leading-[1.08]"
      >
        Tourism earned The Gambia <Stat id="receipts" /> in {evidence("receipts").year}.{" "}
        <Ext href={evidence("online").href}>Half the country</Ext> is still offline.
      </h1>
      <p className="mt-3 max-w-3xl text-lg leading-snug sm:text-xl">{PROBLEM_SUB}</p>

      <ul
        aria-label="The numbers"
        className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {TILES.map((t) => {
          const e = evidence(t.id);
          return (
            <li key={t.id} className="rounded-xl border bg-card p-3">
              <p className="text-2xl" aria-hidden="true">
                {t.icon}
              </p>
              <p className="font-display text-xl font-black leading-tight text-primary">
                {e.value}
              </p>
              <p className="text-sm leading-tight">{t.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {e.year} · <Ext href={e.href}>World Bank</Ext>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Tourism figures are 2019, the last year before COVID. In {evidence("receipts2020").year}:{" "}
        <Stat id="receipts2020" /> and <Stat id="arrivals2020" /> visitors. SIMs are subscriptions,
        not people. Source: World Bank WDI, The Gambia, retrieved {retrievedLabel}. Every number
        links to its data page.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <blockquote className="rounded-xl border-2 border-primary bg-card p-4">
          <p className="mb-1 text-sm font-bold uppercase tracking-widest text-primary">
            Teranga closes the gap
          </p>
          <p className="text-base font-semibold leading-snug sm:text-lg">{PROBLEM_STATEMENT}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This is the gap we target, not a measured result. {NOT_MEASURED}
          </p>
        </blockquote>
        <div
          className="flex flex-col items-stretch justify-center gap-2 text-center"
          aria-label="The gap Teranga closes"
        >
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-xl" aria-hidden="true">
              🧳
            </p>
            <p className="font-bold">Tourists</p>
            <p className="text-sm text-muted-foreground">English · German · Dutch</p>
          </div>
          <div className="rounded-xl bg-primary px-3 py-1.5 font-bold text-primary-foreground">
            <span aria-hidden="true">↕ </span>
            <span className="font-display text-lg">Teranga</span>
            <span aria-hidden="true"> ↕</span>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="text-xl" aria-hidden="true">
              📞
            </p>
            <p className="font-bold">Noor (fictional)</p>
            <p className="text-sm text-muted-foreground">Wolof · basic phone</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Chain() {
  return (
    <section id="chain" aria-labelledby="chain-title" className="mt-8">
      <h2 id="chain-title" className="font-display text-2xl font-black sm:text-3xl">
        {CHAIN_TITLE}
      </h2>
      <ol
        className="mt-3 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]"
        aria-label="Tourist, Teranga and Noor"
      >
        {CHAIN.map((c, i) => (
          <Fragment key={c.name}>
            <li
              className={`rounded-xl border-2 p-3 text-center ${c.name === "Teranga AI" ? "border-primary bg-primary text-primary-foreground" : "border-primary/60 bg-card"}`}
            >
              <p className="text-4xl" aria-hidden="true">
                {c.icon}
              </p>
              <h3 className="font-display text-xl font-black leading-tight">{c.name}</h3>
              <p className="mt-1 text-sm leading-snug">{c.line}</p>
            </li>
            {i < CHAIN.length - 1 ? (
              <li
                key={`${c.name}-arrow`}
                aria-hidden="true"
                className="flex items-center justify-center text-2xl text-primary"
              >
                <span className="sm:hidden">↕</span>
                <span className="hidden sm:inline">↔</span>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Supporting Noor
      </p>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2" aria-label="Champions">
        {CHAIN_SUPPORT.map((c) => (
          <li key={c.name} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <span className="text-3xl" aria-hidden="true">
              {c.icon}
            </span>
            <span>
              <span className="block font-bold leading-tight">{c.name}</span>
              <span className="block text-sm leading-snug">{c.line}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Story() {
  return (
    <section id="story" aria-labelledby="story-title" className="mt-8">
      <h2 id="story-title" className="font-display text-2xl font-black sm:text-3xl">
        {STORY_TITLE}
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Three steps">
        {STORY_STEPS.map((r, i) => (
          <li
            key={r.title}
            className="rounded-xl border-2 border-primary/60 bg-card p-4 text-center"
          >
            <p className="text-5xl" aria-hidden="true">
              {r.icon}
            </p>
            <h3 className="font-display text-xl font-black leading-tight">
              {i + 1}. {r.title}
            </h3>
            <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
              {r.chip}
            </p>
            <p className="mt-2 leading-snug">{r.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        {STORY_MORE}{" "}
        <a href="#explore" className="font-semibold underline">
          More detail ↓
        </a>
      </p>
    </section>
  );
}

function Referrals() {
  return (
    <section
      id="referrals"
      aria-labelledby="referrals-title"
      className="mt-5 rounded-2xl border-2 border-primary/60 bg-card p-4 sm:p-6"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-primary">
        Community feature · simulated partners
      </p>
      <h2 id="referrals-title" className="font-display text-2xl font-black sm:text-3xl">
        {REFERRALS_TITLE}
      </h2>
      <p className="mt-1 max-w-3xl">{REFERRALS_SUB}</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="How a referral works">
        {REFERRAL_STEPS.map((r, i) => (
          <li key={r.title} className="rounded-xl border bg-background p-3 text-center">
            <p className="text-4xl" aria-hidden="true">
              {r.icon}
            </p>
            <h3 className="font-display text-lg font-black leading-tight">
              {i + 1}. {r.title}
            </h3>
            <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
              {r.chip}
            </p>
            <p className="mt-2 text-sm leading-snug">{r.body}</p>
          </li>
        ))}
      </ol>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Safeguards">
        {REFERRAL_FACTS.map((f) => (
          <li
            key={f}
            className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground"
          >
            ✓ {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({
  title,
  tag,
  icon,
  children,
}: {
  title: string;
  tag?: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <li className="rounded-xl border bg-card p-4">
      {icon ? (
        <p className="text-3xl" aria-hidden="true">
          {icon}
        </p>
      ) : null}
      <h3 className="text-lg font-bold leading-snug">{title}</h3>
      {tag ? (
        <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
          {tag}
        </p>
      ) : null}
      <p className="mt-2 leading-snug">{children}</p>
    </li>
  );
}

function HowPanel() {
  return (
    <div>
      <ol className="grid gap-2 lg:grid-cols-5" aria-label="The flow">
        {FLOW.map((f, i) => (
          <li
            key={f.title}
            className="relative rounded-xl border-2 border-primary/60 bg-card p-3 text-center"
          >
            <p className="text-4xl" aria-hidden="true">
              {f.icon}
            </p>
            <h3 className="font-display text-lg font-black leading-tight">
              {i + 1}. {f.title}
            </h3>
            <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
              {f.chip}
            </p>
            <p className="mt-2 text-sm leading-snug">
              <span className="font-bold text-primary">AI </span>
              {f.ai}
            </p>
            {i < FLOW.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 text-xl text-primary lg:-right-3 lg:bottom-auto lg:left-auto lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0"
              >
                <span className="lg:hidden">↓</span>
                <span className="hidden lg:inline">→</span>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl bg-secondary p-3 font-semibold text-secondary-foreground">
        {HOW_BANNER} {WHY_WHATSAPP}
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {EXTRAS.map((c) => (
          <Card key={c.title} title={c.title} tag={c.tag}>
            {c.body}
          </Card>
        ))}
      </ul>
      <Referrals />
      <p className="mt-3 text-sm text-muted-foreground">{TRY_IT}</p>
    </div>
  );
}

function OfflinePanel() {
  return (
    <div>
      <p className="text-lg font-semibold">{OFFLINE_INTRO}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.channel} className="rounded-xl border bg-card p-4 text-center">
            <p className="text-4xl" aria-hidden="true">
              {c.icon}
            </p>
            <p className="font-display text-xl font-black text-primary">{c.channel}</p>
            <p className="font-bold">{c.who}</p>
            <p className="text-sm leading-snug">{c.use}</p>
          </div>
        ))}
      </div>
      <h3 className="mt-5 text-lg font-bold">What Noor keeps on her phone</h3>
      <p className="text-sm text-muted-foreground">{OFFLINE_EXAMPLE_NOTE}</p>
      <ul className="mt-2 grid gap-3 lg:grid-cols-3">
        {SMS_EXAMPLES.map((m) => (
          <li key={m.label}>
            <p className="mb-1 text-sm font-bold">{m.label}</p>
            <pre className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-secondary p-3 font-mono text-sm leading-snug text-secondary-foreground">
              {m.text}
            </pre>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl border-2 border-foreground bg-highlight p-3 text-sm text-foreground">
        {OFFLINE_NOTE}
      </p>
    </div>
  );
}

type Bubble = { from: "me" | "teranga"; text: string; parts?: number };

function SmsPanel() {
  const [as, setAs] = useState<"noor" | "visitor">("noor");
  const [lang, setLang] = useState("wo");
  const [text, setText] = useState("");
  const [log, setLog] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);

  const pickRole = (r: "noor" | "visitor") => {
    setAs(r);
    setLang(r === "noor" ? "wo" : "en");
    setLog([]);
  };
  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    setBusy(true);
    setLog((l) => [...l, { from: "me", text: t }]);
    try {
      const res = await fetch("/api/public/sms-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as, text: t, lang }),
      });
      const j = (await res.json()) as { reply?: string; parts?: number };
      setLog((l) => [
        ...l,
        {
          from: "teranga",
          text: j.reply ?? "The simulator could not answer just now.",
          ...(j.parts ? { parts: j.parts } : {}),
        },
      ]);
    } catch {
      setLog((l) => [...l, { from: "teranga", text: "The simulator could not answer just now." }]);
    } finally {
      setBusy(false);
    }
  };
  const langs =
    as === "noor"
      ? [
          ["wo", "Wolof"],
          ["en", "English"],
        ]
      : [
          ["en", "English"],
          ["de", "Deutsch"],
          ["nl", "Nederlands"],
        ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-lg font-semibold">Text Teranga the way a feature phone would.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Who is texting">
          {(["noor", "visitor"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pickRole(r)}
              aria-pressed={as === r}
              className={`min-h-10 rounded-full border-2 px-4 font-bold ${as === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
            >
              {r === "noor" ? "I am Noor" : "I am a visitor"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Language">
          {langs.map(([code, name]) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code!)}
              aria-pressed={lang === code}
              className={`min-h-9 rounded-full border px-3 text-sm font-bold ${lang === code ? "border-foreground bg-secondary" : "border-border bg-card hover:bg-secondary"}`}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm font-bold">Try:</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SMS_SIM_CHIPS[as].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              className="min-h-9 rounded-full border border-border bg-card px-3 text-sm hover:bg-secondary"
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-xl border-2 border-foreground bg-highlight p-3 text-sm text-foreground">
          {SMS_SIM_NOTE}
        </p>
      </div>

      <div className="rounded-3xl border-2 border-foreground/40 bg-card p-3">
        <div className="min-h-64 space-y-2 rounded-2xl bg-secondary/40 p-3" aria-live="polite">
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet. Tap a suggestion or type below.
            </p>
          ) : null}
          {log.map((b, i) => (
            <div key={i} className={b.from === "me" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-snug ${b.from === "me" ? "bg-primary text-primary-foreground" : "bg-card font-mono"}`}
              >
                {b.text}
                {b.parts ? (
                  <span className="mt-1 block text-xs opacity-70">
                    {b.parts} SMS {b.parts === 1 ? "part" : "parts"}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? <p className="text-sm text-muted-foreground">…</p> : null}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={160}
            aria-label="Your text message"
            placeholder={as === "noor" ? "COACH, LISTING, WEEK, HELP" : "Ask about the tour"}
            className="min-h-11 flex-1 rounded-full border-2 border-border bg-background px-4"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function CommunityPanel() {
  const low = evidence("lowLand");
  return (
    <div>
      <h3 className="text-xl font-black leading-snug sm:text-2xl">{COMMUNITY_TITLE}</h3>
      <p className="mt-1 max-w-3xl leading-snug">
        {COMMUNITY_INTRO} Almost a fifth of the country’s land (<Stat id="lowLand" />, {low.year})
        is under 5 metres above sea level.{" "}
        <span className="text-sm text-muted-foreground">
          <Ext href={low.href}>World Bank {low.indicator}</Ext>
        </span>
      </p>
      <section
        className="mt-4 rounded-xl border-2 border-primary bg-card p-4"
        aria-labelledby="notice"
      >
        <h4 id="notice" className="text-lg font-bold">
          What is a community notice?
        </h4>
        <p className="leading-snug">
          A one-line alert from the community champion when something changes what tourists should
          expect, like a flood or a closed road. Six fixed kinds, no free text except the place. It
          reaches members by SMS and tourists under every answer, for 24 hours.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div>
            <p className="mb-1 text-sm font-bold">1. The community champion texts</p>
            <pre className="whitespace-pre-wrap rounded-2xl bg-primary p-3 font-mono text-sm text-primary-foreground">
              ALERT 2 Tendaba road
            </pre>
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">2. Noor’s phone (SMS, Wolof)</p>
            <pre className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-secondary p-3 font-mono text-sm text-secondary-foreground">
              {alertSms("road", "Tendaba road")}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">3. Under a tourist’s answer (example)</p>
            <pre className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card p-3 font-mono text-sm ring-1 ring-border">{`We meet at the beach gate.\n\n${NOTICE_DEMO}`}</pre>
          </div>
        </div>
      </section>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <Card key={r.name} title={r.name} icon={r.icon} tag={r.role}>
            {r.line}
          </Card>
        ))}
      </ul>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COMMUNITY.map((c) => (
          <Card key={c.title} title={c.title} icon={c.icon} tag={c.tag}>
            {c.body}
          </Card>
        ))}
      </ul>
    </div>
  );
}

function RealPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="live">
        <h3 id="live" className="text-lg font-bold">
          Live and working
        </h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {REAL_LIVE.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <section
        className="rounded-xl border-2 border-foreground bg-highlight p-4 text-foreground"
        aria-labelledby="limits"
      >
        <h3 id="limits" className="text-lg font-bold">
          Labeled limits
        </h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {REAL_LIMITS.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SourcesPanel() {
  const indicators = [...new Set(EVIDENCE.map((e) => e.indicator))];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="wdi">
        <h3 id="wdi" className="text-lg font-bold">
          Statistics: World Bank, WDI, The Gambia
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Retrieved {retrievedLabel}. Each link opens the indicator’s data page.
        </p>
        <ul className="mt-2 space-y-2">
          {indicators.map((code) => (
            <li key={code} className="leading-snug">
              <Ext href={wdiUrl(code)}>{INDICATOR_NAMES[code] ?? code}</Ext>
              <span className="block text-sm text-muted-foreground">
                {code} · used for{" "}
                {EVIDENCE.filter((e) => e.indicator === code)
                  .map((e) => e.year)
                  .sort()
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="space-y-4">
        <section className="rounded-xl border bg-card p-4" aria-labelledby="tools">
          <h3 id="tools" className="text-lg font-bold">
            Built with
          </h3>
          <ul className="mt-2 space-y-2">
            {SOURCES_TOOLS.map((t) => (
              <li key={t.name} className="leading-snug">
                <Ext href={t.href}>{t.name}</Ext>: {t.what}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border bg-card p-4" aria-labelledby="privacy">
          <h3 id="privacy" className="text-lg font-bold">
            Privacy
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {PRIVACY.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ScreensPanel() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SCREENS.map((s) => (
        <li key={s.src} className="rounded-xl border bg-card p-3">
          <img src={s.src} alt={s.alt} loading="lazy" className="w-full rounded-lg border" />
          <p className="mt-2 text-sm leading-snug">{s.caption}</p>
        </li>
      ))}
    </ul>
  );
}

const PANELS: Record<TabId, () => ReactNode> = {
  how: HowPanel,
  sms: SmsPanel,
  community: CommunityPanel,
  offline: OfflinePanel,
  real: RealPanel,
  sources: SourcesPanel,
  screens: ScreensPanel,
};

function Explore({ initialTab }: { initialTab: TabId }) {
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setTab(h as TabId);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const select = (id: TabId) => {
    setTab(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* the hash is only a convenience */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length]!;
    select(target.id);
    document.getElementById(`tab-${target.id}`)?.focus();
  };

  const Panel = PANELS[tab];
  return (
    <section id="explore" aria-labelledby="explore-title" className="mt-8 scroll-mt-4">
      <h2 id="explore-title" className="text-2xl font-black sm:text-3xl">
        Explore Teranga
      </h2>
      <div
        role="tablist"
        aria-label="Explore Teranga"
        onKeyDown={onKeyDown}
        className="mt-4 flex flex-wrap gap-2"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(t.id)}
              className={`min-h-10 rounded-full border-2 px-3 font-bold outline-none transition-colors sm:min-h-11 sm:px-4 focus-visible:ring-4 focus-visible:ring-ring/40 ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="mt-5 outline-none"
      >
        <Panel />
      </div>
    </section>
  );
}

export function Landing({ initialTab = "how" }: { initialTab?: TabId }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pattern-kente h-2" aria-hidden="true" />
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4">
        <div>
          <span className="font-display text-2xl font-black">Teranga</span>
          <span className="ml-3 hidden text-sm text-muted-foreground sm:inline">
            World Bank × Hack-Nation · Small AI for Development · Tourism
          </span>
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-2 text-sm">
          <a href="#explore" className={pill}>
            Explore ↓
          </a>
          {VIDEO_URL ? (
            <Ext
              href={VIDEO_URL}
              className={`${pill} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              Watch the demo
            </Ext>
          ) : null}
          <Ext href={REPO_URL} className={pill}>
            Code on GitHub
          </Ext>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-12">
        <Hero />
        <Chain />
        <Story />
        <Explore initialTab={initialTab} />
      </main>
      <footer className="mx-auto max-w-5xl border-t px-4 py-6 text-sm text-muted-foreground">
        <p>
          Built for the World Bank × Hack-Nation hackathon, Small AI for Development, Tourism track.
          A prototype, not a product. Noor is fictional.
        </p>
        <p className="mt-2">Teranga backend is running</p>
      </footer>
    </div>
  );
}
