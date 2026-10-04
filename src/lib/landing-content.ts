// Copy for the home page. No statistics are typed here: every number comes from src/lib/evidence.ts,
// where each one carries its World Bank indicator and link. Keep it that way.

export const REPO_URL = "https://github.com/trangbui0596/teranga-gambia";
/** Set to the demo video link once it is uploaded; the "Watch the demo" button appears automatically. */
export const VIDEO_URL = "";
/** Add screenshots after filming (files in public/screens/); the "Screens" tab appears automatically. */
export const SCREENS: Array<{ src: string; alt: string; caption: string }> = [];

export type TabId = "how" | "ai" | "community" | "real" | "sources" | "screens";

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "how", label: "How it works" },
  { id: "ai", label: "AI beyond SMS" },
  { id: "community", label: "Community" },
  { id: "real", label: "What’s real" },
  { id: "sources", label: "Sources" },
  ...(SCREENS.length ? [{ id: "screens" as TabId, label: "Screens" }] : []),
];

export const PROBLEM_SUB =
  "Visitors write in English, German and Dutch. The people who run the tours speak Wolof and work from a basic phone. Every enquiry an operator can’t read or answer is a booking she can’t win.";

export const NOT_MEASURED =
  "We did not measure how many enquiries are lost today, and we claim no number for it.";

export const STEPS = [
  {
    title: "Noor records once, by phone call",
    body: "She answers the common visitor questions out loud, in Wolof, on a basic phone. No internet needed.",
  },
  {
    title: "A family helper approves every answer",
    body: "On WhatsApp she sees the Wolof transcript, the numbers it heard and any flags, then approves. Nothing reaches a visitor before she does.",
  },
  {
    title: "Visitors ask in their own language",
    body: "In English, German or Dutch on WhatsApp. They get Noor’s approved answer as text and an AI voice note, labeled machine-translated. When it isn’t sure, it says “Not sure, Noor will answer.” It never guesses.",
  },
  {
    title: "Noor gets coaching in Wolof",
    body: "From real public Google Maps reviews: what visitors praise, what they complain about, and what to do next. If there isn’t enough data, it says so.",
  },
];

export const TRY_IT =
  "The demo runs on a private Twilio sandbox, so it isn’t open to the public. The recorded walkthrough is the way to see it.";

export const AI_INTRO = "A plain SMS tool can’t do any of this.";

export const AI_DOES = [
  {
    title: "Hears Wolof",
    body: "Speech recognition turns Noor’s phone call into text. SMS needs typing. A call needs nothing.",
  },
  {
    title: "Translates, then checks itself",
    body: "Wolof to English, German and Dutch, with a round-trip check that flags answers whose meaning drifted. Every answer says it is machine-translated.",
  },
  {
    title: "Speaks the answer",
    body: "Visitors get an AI voice note in their language. SMS is text only.",
  },
  {
    title: "Reads the prices",
    body: "It shows the numbers it heard in Wolof (“yuñi ak juróom teemeer” shows as about 1500), so a helper who doesn’t read English can confirm a price.",
  },
  {
    title: "Turns a spoken review into text",
    body: "A visitor talks. Teranga writes it down cleanly, changing no facts and no feeling. The visitor posts it themselves.",
  },
  {
    title: "Reads the market",
    body: "It reads many public Google reviews, finds the themes and gives Noor plain advice in Wolof.",
  },
];

export const SAFEGUARDS = {
  title: "Built to never make things up",
  items: [
    "Visitor questions are matched to approved answers by fixed keyword rules. Nothing is generated, so it can’t invent an answer.",
    "The helper’s chat agent can only propose changes. They run after an explicit YES.",
  ],
};

export const COMMUNITY = [
  {
    title: "Cross-community recommendations",
    tag: "Simulated demo",
    body: "A visitor can opt in to a suggestion for another tour that fits them: nature, culture or food. Suggestions rotate fairly between partner operators, no money changes hands, and the visitor’s number is never shared. If the visitor asks for contact, a person passes it on. The partners in the demo are fictional sample operators.",
  },
  {
    title: "One-tap Google review, in the visitor’s own words",
    tag: "Live up to the link",
    body: "A visitor can say their review out loud. Teranga writes it down as clean text and sends the same Google review link every visitor gets. They tap the link, paste, and choose their own stars. There is no review gating, and Teranga never posts for them.",
  },
  {
    title: "Google Business listing draft",
    tag: "Simulated",
    body: "A draft listing built only from answers the helper approved. Missing fields say “needs input”. A person must submit and verify it; nothing is sent to Google.",
  },
];

export const REAL_LIVE = [
  "A real phone line and WhatsApp number (Twilio sandbox) run the full loop: call, transcript, review, approval, visitor answers, voice notes.",
  "Speech recognition (ElevenLabs Scribe) runs on every recording.",
  "Coaching comes from real public Google Maps reviews. Nothing raw is stored.",
  "Every statistic on this page comes straight from the World Bank, with a link to the data.",
];

export const REAL_LIMITS = [
  "The Wolof test audio is synthetic (text-to-speech). No native Wolof speaker has tested it yet.",
  "All Wolof wording is machine-written and has not been checked by a native speaker.",
  "Translations are machine translations and say so.",
  "The 20-question matching test is agent-written test data. It is not real-visitor accuracy.",
  "SMS delivery is pending US carrier registration, so summaries arrive on WhatsApp.",
  "The partner list and the Google listing draft are simulated.",
  "The demo call asks 2 of the 10 questions to keep it short.",
];

export const SOURCES_TOOLS: Array<{ name: string; what: string; href: string }> = [
  {
    name: "ElevenLabs",
    what: "speech-to-text (Scribe) for Wolof; text-to-speech for English, German and Dutch",
    href: "https://elevenlabs.io",
  },
  {
    name: "Twilio",
    what: "WhatsApp sandbox and the voice line",
    href: "https://www.twilio.com/docs/whatsapp/sandbox",
  },
  {
    name: "Google Maps Platform (Places)",
    what: "public reviews for coaching",
    href: "https://developers.google.com/maps/documentation/places/web-service/overview",
  },
  {
    name: "Lovable",
    what: "the app, database and AI for translation and summaries",
    href: "https://lovable.dev",
  },
];

export const PRIVACY = [
  "No review gating: every visitor is offered the same review link.",
  "Visitor voice reviews are deleted when the visitor says NO, or after 24 hours, unless the visitor chooses to share them with Noor.",
  "Noor’s own recordings are kept until the project owner deletes them. There is no self-serve delete command yet.",
];
