// Copy for the home page. No statistics are typed here: every number comes from src/lib/evidence.ts,
// where each one carries its World Bank indicator and link. Keep it that way.

export const REPO_URL = "https://github.com/trangbui0596/teranga-gambia";
/** Set to the demo video link once it is uploaded; the "Watch the demo" button appears automatically. */
export const VIDEO_URL = "";
/** Add screenshots after filming (files in public/screens/); the "Screens" tab appears automatically. */
export const SCREENS: Array<{ src: string; alt: string; caption: string }> = [];

export type TabId = "how" | "offline" | "sms" | "community" | "ai" | "real" | "sources" | "screens";

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "how", label: "How it works" },
  { id: "offline", label: "Works offline" },
  { id: "sms", label: "Try SMS" },
  { id: "community", label: "Community" },
  { id: "ai", label: "AI beyond SMS" },
  { id: "real", label: "What\u2019s real" },
  { id: "sources", label: "Sources" },
  ...(SCREENS.length ? [{ id: "screens" as TabId, label: "Screens" }] : []),
];

export const PROBLEM_SUB =
  "Visitors write in English, German and Dutch. The people who run the tours speak Wolof and work from a basic phone. Every enquiry an operator can’t read or answer is a booking she can’t win.";

/** World Bank format: Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]. */
export const PROBLEM_STATEMENT =
  "Because of this tool, a Gambian tour operator will answer visitors in English, German and Dutch with her own pre-approved words within a week of one phone call, backed by a household champion and a community champion and keeping her coaching, Google listing progress and community notices as plain SMS, work she would otherwise miss, answer late or answer badly because she cannot read or reply to online enquiries; we know because the World Bank figures above show how much tourism earns and how many Gambians are still offline.";

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
    body: "In English, German or Dutch on WhatsApp. They get Noor’s approved answer as text and an AI voice note, labeled machine-translated. When it isn’t sure, it says “Not sure, Noor will answer.”",
  },
  {
    title: "Noor gets coaching in Wolof",
    body: "From real public Google Maps reviews: what visitors praise, what they complain about, and what to do next. Every week the sync re-reads the reviews, adds what visitors asked and found unclear, and refines the advice. If there isn’t enough data, it says so.",
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
    "Visitor questions are matched to approved answers by fixed keyword rules. Nothing is generated, so it can’t invent an answer. Its real risk is picking the wrong approved one, so we measured that on real questions (see What’s real).",
    "The helper’s chat agent can only propose changes. They run after an explicit YES.",
  ],
};

export const EXTRAS = [
  {
    title: "A Google listing built from her own answers",
    tag: "Draft: a person publishes it",
    body: "Once the helper approves answers, Teranga builds a Google Business Profile pack from Noor\u2019s own words: a description inside Google\u2019s 750-character limit, services, meeting point and booking. It shows what is missing, which question card to record next, and what only the helper can add. Noor gets the progress by SMS. Nothing is sent to Google: a person claims the profile and pastes it.",
  },
  {
    title: "One-tap Google review, in the visitor\u2019s own words",
    tag: "Built up to the link",
    body: "A visitor can say their review out loud. Teranga writes it down as clean text and sends the same Google review link every visitor gets. They tap the link, paste, and choose their own stars. There is no review gating, and Teranga never posts for them.",
  },
];

export const OFFLINE_INTRO =
  "Everything Noor and her community need works over a phone call and plain text messages. WhatsApp is the household helper’s weekly smartphone session, and a convenience for visitors.";
export const OFFLINE_ROWS = [
  {
    who: "Noor, on a basic phone",
    does: "Records her answers by phone call. Keeps her coaching, Google listing progress, approval receipts, community notices and weekly learning as plain SMS in Wolof. Can text COACH, LISTING, WEEK or HELP to get them again.",
    net: "No internet",
  },
  {
    who: "Her household helper",
    does: "Reviews and approves the answers in the weekly smartphone session on WhatsApp, when in town. The weekly sync re-reads public reviews and adds what visitors asked and found unclear.",
    net: "Weekly",
  },
  {
    who: "The community champion",
    does: "Logs in and posts or checks community notices by SMS, so notices still go out when mobile data does not. Checks translations on WhatsApp. Members receive notices by SMS.",
    net: "None for notices",
  },
  {
    who: "Visitors",
    does: "Ask on WhatsApp and get text plus an AI voice note. A text-only SMS mode for visitors without data is built and switched off by default.",
    net: "WhatsApp needs data",
  },
];
export const OFFLINE_NOTE =
  "US carrier registration for SMS is still in review, so the live demo runs on WhatsApp and the simulator on this page shows the same texts. Once registered, nothing changes in the code. The texts are written for feature phones: plain letters, at most three parts, and always an opt-out line.";
export const OFFLINE_EXAMPLE_NOTE = "Examples built by the same code, with sample inputs:";

export const COMMUNITY_TITLE = "A champion in every household. A champion in every community.";
export const COMMUNITY_INTRO =
  "Operators share the same roads, rivers and rainy season, so some jobs are too big for one household. Teranga gives each operator a household champion for her own answers, and gives the whole circle a community champion: one trusted person who looks after what no single household can.";
export const ROLES = [
  {
    title: "Household champion",
    tag: "Built",
    body: "A family member of one operator. Reviews that operator\u2019s answers on WhatsApp, in Wolof, about once a week.",
  },
  {
    title: "Community champion",
    tag: "Built, demo PIN",
    body: "One trusted person for a circle of operators: an association, a village, a guides\u2019 group. Posts community notices, checks translations and passes on referral requests.",
  },
];
export const COMMUNITY = [
  {
    title: "Community notices",
    tag: "Built",
    body: "When a road floods or boats stop, the community champion sends one notice. Members get an SMS in Wolof. Visitors see it under every answer in English, German or Dutch. The wording is fixed, so nothing is machine-translated in an emergency, and every notice says it is a community notice, not an official warning.",
  },
  {
    title: "Translation checks",
    tag: "Built",
    body: "When a household helper is not sure a translation is right, the answer goes to a bilingual reviewer in the community. Approved answers carry the label \u201CEnglish checked by a bilingual reviewer\u201D. German and Dutch stay machine translations of that English.",
  },
  {
    title: "Fair referrals",
    tag: "Simulated partners",
    body: "A visitor can ask for a suggestion for another tour. It rotates fairly between partner operators, no money changes hands, and the community champion passes on contact requests. The partners in the demo are fictional.",
  },
  {
    title: "Shared coaching",
    tag: "Real public data",
    body: "Coaching reads many public Google reviews of Gambian operators, so every member learns from the whole sector and not only from their own few reviews.",
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
  "SMS delivery is pending US carrier registration, so in the demo the same texts arrive on WhatsApp.",
  "The partner list is simulated, and the Google listing is a draft that a person must publish.",
  "The demo call asks 2 of the 10 questions to keep it short.",
  "SMS commands, community notices, translation checks and the Google listing pack are built and unit-tested. Real users have not tried them yet.",
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

export const SMS_SIM_NOTE =
  "Simulation: this shows the text Teranga would send. It uses the same code and the demo data, and nothing is sent to any phone. Real SMS delivery in the US waits for carrier registration.";
export const SMS_SIM_CHIPS = {
  noor: ["COACH", "LISTING", "WEEK", "HELP"],
  visitor: ["How much does it cost?", "Where do we meet?", "Do I need a visa?", "STATUS"],
};
