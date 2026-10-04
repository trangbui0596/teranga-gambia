import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { EVIDENCE, INDICATOR_NAMES, RETRIEVED, evidence, wdiUrl } from "@/lib/evidence";
import {
  AI_DOES,
  AI_INTRO,
  COMMUNITY,
  COMMUNITY_INTRO,
  COMMUNITY_TITLE,
  EXTRAS,
  NOT_MEASURED,
  PROBLEM_STATEMENT,
  OFFLINE_EXAMPLE_NOTE,
  OFFLINE_INTRO,
  OFFLINE_NOTE,
  OFFLINE_ROWS,
  PRIVACY,
  PROBLEM_SUB,
  REAL_LIMITS,
  REAL_LIVE,
  REPO_URL,
  ROLES,
  SAFEGUARDS,
  SCREENS,
  SOURCES_TOOLS,
  STEPS,
  TABS,
  TRY_IT,
  VIDEO_URL,
  type TabId,
} from "@/lib/landing-content";
import { alertSms } from "@/lib/community";
import { buildListingPack } from "@/lib/listing";
import { approvalSms, listingSms } from "@/lib/sms-text";

// Example texts for the "Works offline" tab. Built by the same code that sends the real SMS, from sample inputs.
const SAMPLE_PACK = buildListingPack({
  price: { text: "Sample answer.", sample: true },
  children: { text: "Sample answer.", sample: true },
});
const SMS_EXAMPLES = [
  { label: "After the helper approves an answer", text: approvalSms("price", SAMPLE_PACK, "wo") },
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

function StatRow({ id }: { id: string }) {
  const e = evidence(id);
  return (
    <li className="grid grid-cols-[6.25rem_1fr] sm:grid-cols-[7.25rem_1fr] items-baseline gap-x-3 py-2">
      <span className="font-display text-xl font-black leading-tight text-primary sm:text-2xl">
        {e.value}
      </span>
      <span className="leading-snug">
        {e.label}
        <span className="block text-sm text-muted-foreground">
          {e.year}
          {e.note ? ` · ${e.note}` : ""} · <Ext href={e.href}>World Bank {e.indicator}</Ext>
        </span>
      </span>
    </li>
  );
}

function StatGroup({
  title,
  ids,
  children,
}: {
  title: string;
  ids: string[];
  children?: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="mt-1 divide-y divide-border/60">
        {ids.map((id) => (
          <StatRow key={id} id={id} />
        ))}
      </ul>
      {children}
    </div>
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
      <p className="mt-4 max-w-3xl text-lg leading-snug sm:text-xl">{PROBLEM_SUB}</p>

      <aside aria-label="The numbers" className="mt-6 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
          <StatGroup
            title="Tourism · 2019, the last year before COVID"
            ids={["receipts", "exportShare", "arrivals"]}
          >
            <p className="mt-1 text-sm text-muted-foreground">
              Then COVID: in {evidence("receipts2020").year}, receipts fell to{" "}
              <Stat id="receipts2020" /> and arrivals to <Stat id="arrivals2020" />.
            </p>
          </StatGroup>
          <div className="space-y-3 lg:border-l lg:pl-10">
            <StatGroup title="Connectivity · 2024" ids={["online", "mobile"]} />
            <StatGroup title="Who does the work · 2025" ids={["selfEmployed"]}>
              <p className="mt-1 text-sm text-muted-foreground">Noor is one of them.</p>
            </StatGroup>
          </div>
        </div>
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          Source: World Bank, World Development Indicators, The Gambia. Retrieved {retrievedLabel}.
          Every number links to its data page.
        </p>
      </aside>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <blockquote className="rounded-xl border-2 border-primary bg-card p-4">
          <p className="mb-1 text-sm font-bold uppercase tracking-widest text-primary">
            Teranga closes the gap
          </p>
          <p className="text-lg font-semibold leading-snug">{PROBLEM_STATEMENT}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This is the gap we target, not a measured result. {NOT_MEASURED}
          </p>
        </blockquote>

        <div
          className="flex flex-col items-stretch justify-center gap-2 text-center"
          aria-label="The gap Teranga closes"
        >
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="font-bold">Visitors</p>
            <p className="text-sm text-muted-foreground">English · German · Dutch</p>
          </div>
          <div className="rounded-xl bg-primary px-3 py-1.5 font-bold text-primary-foreground">
            <span aria-hidden="true">↕ </span>
            <span className="font-display text-lg">Teranga</span>
            <span aria-hidden="true"> ↕</span>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2">
            <p className="font-bold">Noor (fictional)</p>
            <p className="text-sm text-muted-foreground">Wolof · basic phone</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({ title, tag, children }: { title: string; tag?: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border bg-card p-4">
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
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border bg-card p-4 lg:block">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground lg:mb-3"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-lg font-bold leading-snug">{s.title}</h3>
              <p className="mt-1 leading-snug">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="mt-6 text-lg font-bold">Then, for visibility</h3>
      <ul className="mt-2 grid gap-3 lg:grid-cols-2">
        {EXTRAS.map((c) => (
          <Card key={c.title} title={c.title} tag={c.tag}>
            {c.body}
          </Card>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">{TRY_IT}</p>
    </div>
  );
}

function OfflinePanel() {
  return (
    <div>
      <p className="text-lg font-semibold">{OFFLINE_INTRO}</p>
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {OFFLINE_ROWS.map((r) => (
          <li key={r.who} className="rounded-xl border bg-card p-4">
            <h3 className="text-lg font-bold leading-snug">{r.who}</h3>
            <p className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
              Internet: {r.net}
            </p>
            <p className="mt-2 leading-snug">{r.does}</p>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-lg font-bold">What Noor keeps on her phone</h3>
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

function AiPanel() {
  return (
    <div>
      <p className="text-lg font-semibold">{AI_INTRO}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AI_DOES.map((a) => (
          <li key={a.title} className="rounded-xl border-2 border-primary/70 bg-card p-4">
            <h3 className="text-lg font-bold leading-snug">{a.title}</h3>
            <p className="mt-1 leading-snug">{a.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-secondary p-4 text-secondary-foreground">
        <h3 className="text-lg font-bold">{SAFEGUARDS.title}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {SAFEGUARDS.items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CommunityPanel() {
  const low = evidence("lowLand");
  return (
    <div>
      <h3 className="text-xl font-black leading-snug sm:text-2xl">{COMMUNITY_TITLE}</h3>
      <p className="mt-2 max-w-3xl leading-snug">{COMMUNITY_INTRO}</p>
      <p className="mt-2 max-w-3xl leading-snug">
        Almost a fifth of The Gambia’s land (<Stat id="lowLand" />, {low.year}) is less than 5
        metres above sea level. When water rises, every operator on that road or river is affected
        at once.{" "}
        <span className="text-sm text-muted-foreground">
          Source: <Ext href={low.href}>World Bank {low.indicator}</Ext>.
        </span>
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {ROLES.map((r) => (
          <Card key={r.title} title={r.title} tag={r.tag}>
            {r.body}
          </Card>
        ))}
      </ul>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {COMMUNITY.map((c) => (
          <Card key={c.title} title={c.title} tag={c.tag}>
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
  offline: OfflinePanel,
  community: CommunityPanel,
  ai: AiPanel,
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
