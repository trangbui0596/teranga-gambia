import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teranga" },
      {
        name: "description",
        content:
          "Teranga lets a Gambian tour operator answer visitors in English, German and Dutch with her own pre-approved words. A hackathon prototype.",
      },
      { property: "og:title", content: "Teranga" },
      {
        property: "og:description",
        content:
          "A Gambian tour operator answers visitors in English, German and Dutch with her own pre-approved words.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Home,
});

const STEPS = [
  {
    title: "Noor records her answers by phone call",
    body: "She answers 10 common visitor questions out loud, in Wolof, on a basic phone. No internet needed. By default the demo call asks 2 of the 10 to keep it short.",
  },
  {
    title: "A family helper checks every answer on WhatsApp",
    body: "The helper sees the Wolof transcript, the numbers the system heard, and any flags, then approves each answer. Nothing reaches a visitor before approval.",
  },
  {
    title: "Visitors ask on WhatsApp in English, German or Dutch",
    body: "They get the approved answer as text plus an AI-generated voice note, labeled machine-translated. If the system is not sure it says “Not sure, Noor will answer” and never guesses.",
  },
  {
    title: "Coaching for Noor, in Wolof",
    body: "Plain advice built from real public Google Maps reviews. It is a small sample, and no raw reviews are stored.",
  },
];

const AI_DOES = [
  {
    title: "Hears Wolof speech",
    body: "Noor answers by phone call and speech recognition (ElevenLabs Scribe) turns her voice into text. Plain SMS needs typing and has no voice.",
  },
  {
    title: "Translates and checks",
    body: "Machine translation from Wolof to English, then German and Dutch, plus a round-trip check that flags answers whose meaning drifted. All of it is labeled machine-translated and unverified.",
  },
  {
    title: "Speaks answers back",
    body: "Visitors get an AI-generated voice note in their language. SMS is text only.",
  },
  {
    title: "Reads numbers heard in Wolof",
    body: "It shows the numbers it heard (for example \u201Cyu\u00F1i ak jur\u00F3om teemeer\u201D shown as about 1500), so a helper who does not read English can confirm prices.",
  },
  {
    title: "Cleans up a spoken visitor review",
    body: "It turns a spoken review into clean text, changing no facts and no sentiment. The visitor posts it themselves. Nothing is published for them.",
  },
  {
    title: "Summarizes many public reviews",
    body: "It reads public Google reviews, finds the themes and gives plain advice in Wolof. It says so when there is not enough data.",
  },
];

const COMMUNITY = [
  {
    title: "Cross-community recommendations",
    tag: "Simulated demo",
    body: "A visitor can opt in to a suggestion for another tour that fits them: nature, culture or food. Suggestions rotate fairly between partner operators, no money changes hands, and the visitor\u2019s number is never shared. If the visitor asks for contact, a person passes it on. The partners in the demo are fictional sample operators.",
  },
  {
    title: "One-tap Google review, in the visitor\u2019s own words",
    tag: "Real flow, nothing posted for the visitor",
    body: "A visitor can say their review out loud. Teranga writes it down as clean text and sends the same Google review link every visitor gets. They tap the link, paste, and choose their own stars. There is no review gating, and Teranga never posts for them.",
  },
  {
    title: "Google Business listing draft",
    tag: "Simulated",
    body: "A draft listing built only from answers the helper approved. Missing fields say \u201Cneeds input\u201D. A person must submit and verify it; nothing is sent to Google.",
  },
];

const SAFEGUARDS = [
  "Answering visitor questions uses fixed keyword rules over approved answers. Nothing is generated, so it never makes up an answer.",
  "The chat agent for the family helper can only propose changes. They run after an explicit YES.",
];

const STATS = [
  { value: "49.5%", label: "of people use the Internet", meta: "2024 · IT.NET.USER.ZS" },
  { value: "126", label: "mobile subscriptions per 100 people", meta: "2024 · IT.CEL.SETS.P2" },
  {
    value: "US$53 million",
    label: "international tourism receipts, 30.2% of exports",
    meta: "2020, a COVID year, latest value in the series · ST.INT.RCPT.CD, ST.INT.RCPT.XP.ZS",
  },
  {
    value: "246,000",
    label: "international tourism arrivals",
    meta: "2020, same caveat · ST.INT.ARVL",
  },
];

const LIMITS = [
  "The Wolof test audio is synthetic (text-to-speech), not a native speaker.",
  "Speech recognition on real Wolof speech is untested.",
  "All Wolof text in the app is machine-written and has not been checked by a native speaker.",
  "Translations are machine translations and say so.",
  "The 20-question matching test is agent-written test data. It is not real-visitor accuracy.",
  "SMS delivery is pending US carrier registration, so summaries arrive on WhatsApp through Twilio’s sandbox.",
  "The partner recommendation, partner list and Google listing preview are simulated.",
  "Google review data is a small real public sample.",
];

const TECH = [
  "ElevenLabs: Scribe speech-to-text for Wolof, text-to-speech for English, German and Dutch.",
  "Lovable AI: translation and summaries.",
  "Twilio: WhatsApp sandbox and voice.",
  "Google Maps Places data: reviews for coaching.",
  "Lovable Cloud database.",
  "Matching visitor questions to answers uses keyword rules. There is no AI in the matching.",
];

const PRIVACY = [
  "No review gating: every visitor is offered the same review link.",
  "Visitor voice reviews are deleted when the visitor says NO, or after 24 hours, unless the visitor chooses to share them with Noor.",
  "Noor\u2019s own recordings are kept until the project owner deletes them. There is no self-serve delete command yet.",
];

function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pattern-kente h-2" aria-hidden="true" />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        <header>
          <h1 className="text-5xl font-black leading-none sm:text-6xl">Teranga</h1>
          <p className="mt-4 text-xl leading-snug">
            A Gambian tour operator answers visitors in English, German and Dutch with her own
            pre-approved words.
          </p>
          <p className="mt-2 text-muted-foreground">
            &ldquo;Teranga&rdquo; is Wolof for hospitality.
          </p>
          <p className="mt-4 rounded-xl border bg-card p-4">
            <strong>Meet Noor.</strong> Noor is a <strong>fictional</strong> tour operator in The
            Gambia. She speaks Wolof and has a basic phone.
          </p>
        </header>

        <section className="mt-10" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-bold">
            How it works
          </h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-xl border bg-card p-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold leading-snug">{s.title}</h3>
                  <p className="mt-1">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="ai">
          <h2 id="ai" className="text-2xl font-bold">
            What the AI does that plain SMS cannot
          </h2>
          <ul className="mt-4 space-y-3">
            {AI_DOES.map((a) => (
              <li key={a.title} className="rounded-xl border-2 border-primary bg-card p-4">
                <h3 className="text-lg font-bold leading-snug">{a.title}</h3>
                <p className="mt-1">{a.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl border bg-secondary p-4 text-secondary-foreground">
            <h3 className="text-lg font-bold">Safeguards, not AI features</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {SAFEGUARDS.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="community">
          <h2 id="community" className="text-2xl font-bold">
            Beyond answers: the wider community
          </h2>
          <ul className="mt-4 space-y-3">
            {COMMUNITY.map((c) => (
              <li key={c.title} className="rounded-xl border bg-card p-4">
                <h3 className="text-lg font-bold leading-snug">{c.title}</h3>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">{c.tag}</p>
                <p className="mt-1">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-10 rounded-xl border-2 border-foreground bg-highlight p-5 text-foreground"
          aria-labelledby="real"
        >
          <h2 id="real" className="text-2xl font-bold">
            What is real and what is not
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="gap">
          <h2 id="gap" className="text-2xl font-bold">
            The gap we target
          </h2>
          <p className="mt-1 text-muted-foreground">
            World Bank WDI, The Gambia. Context, not proof of impact.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-3xl font-black font-display leading-tight">
                    {s.value}
                  </span>
                  <span className="block">{s.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{s.meta}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4">
            This shows tourism matters and about half the population is not online while phones are
            everywhere. It does not show that operators lose enquiries or that Teranga fixes it.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="try">
          <h2 id="try" className="text-2xl font-bold">
            How to try it
          </h2>
          <p className="mt-2">
            The demo runs on a Twilio WhatsApp sandbox and a Twilio phone number, so it is not open
            to the public. The way to see it is a recorded walkthrough video. The repo README has
            setup notes.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="tech">
          <h2 id="tech" className="text-2xl font-bold">
            Tech and data notes
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {TECH.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <h3 className="mt-5 text-lg font-bold">Privacy</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {PRIVACY.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <p>
            Built for the World Bank x Hack-Nation hackathon, Small AI for Development, Tourism
            track.
          </p>
          <p className="mt-1">Prototype, not a product.</p>
          <p className="mt-3">Teranga backend is running</p>
        </footer>
      </main>
    </div>
  );
}
