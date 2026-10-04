import { HOLDOUT_RESULTS } from "./match-eval-results";
// Copy for the home page. No statistics are typed here: every number comes from src/lib/evidence.ts,
// where each one carries its World Bank indicator and link. Keep it that way.

export const REPO_URL = "https://github.com/trangbui0596/teranga-gambia";
/** Set to the demo video link once it is uploaded; the "Watch the demo" button appears automatically. */
export const VIDEO_URL = "";
/** Add screenshots after filming (files in public/screens/); the "Screens" tab appears automatically. */
export const SCREENS: Array<{ src: string; alt: string; caption: string }> = [];

export type TabId = "how" | "sms" | "community" | "offline" | "real" | "sources" | "screens";

export const TABS: Array<{ id: TabId; label: string }> = [
  { id: "how", label: "Full flow" },
  { id: "sms", label: "Try SMS" },
  { id: "community", label: "Community" },
  { id: "offline", label: "Works offline" },
  { id: "real", label: "What’s real" },
  { id: "sources", label: "Sources" },
  ...(SCREENS.length ? [{ id: "screens" as TabId, label: "Screens" }] : []),
];

export const PROBLEM_SUB =
  "Tourists write in English, German and Dutch. Noor speaks Wolof on a basic phone. Every enquiry she can’t read is a booking she can’t win.";

/** World Bank format: Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]. */
export const PROBLEM_STATEMENT =
  "Because of Teranga, a Gambian tourism operator will turn one phone call in Wolof into answers tourists can read in English, German or Dutch, within a week and without internet. Her Google listing is drafted from those answers, and tourists can leave a review by voice. Each week she learns what tourists ask, and her community looks out for one another with shared notices and referrals. Without it, she misses or answers late the enquiries she can’t read. We know because the World Bank figures above show how much tourism earns and how many Gambians are still offline.";

export const NOT_MEASURED =
  "We did not measure how many enquiries are lost today, and we claim no number for it.";

export const TILES = [
  { id: "receipts", icon: "💰", label: "tourism earnings" },
  { id: "exportShare", icon: "📊", label: "of all exports" },
  { id: "arrivals", icon: "✈️", label: "visitors" },
  { id: "online", icon: "🌐", label: "use the Internet" },
  { id: "mobile", icon: "📱", label: "SIMs per 100 people" },
  { id: "selfEmployed", icon: "🛠️", label: "are self-employed" },
];

export const PEOPLE = [
  {
    icon: "📞",
    name: "Noor",
    role: "Tourism operator",
    line: "Basic phone. Records and approves her own answers, by call and SMS.",
  },
  {
    icon: "📱",
    name: "Household champion",
    role: "Family member with a smartphone",
    line: "Syncs the tourists’ WhatsApp questions. The AI re-reads reviews each week.",
  },
  {
    icon: "🤝",
    name: "Community champion",
    role: "One person for a whole circle",
    line: "Posts notices. Checks translations.",
  },
  {
    icon: "🧳",
    name: "Tourist",
    role: "From anywhere",
    line: "Asks on WhatsApp, by voice or text, in their language.",
  },
];

export const FLOW = [
  {
    icon: "📞",
    title: "Noor records and approves",
    chip: "Call + SMS",
    ai: "Hears Wolof, translates",
  },
  { icon: "🗺️", title: "Her Google listing", chip: "Google Maps", ai: "Built from her own words" },
  {
    icon: "🧳",
    title: "Tourist asks",
    chip: "WhatsApp",
    ai: "Hears the voice, answers in their language",
  },
  {
    icon: "🔄",
    title: "Weekly sync",
    chip: "Household champion’s smartphone",
    ai: "New questions in, review insights out",
  },
  {
    icon: "⭐",
    title: "Voice-note review",
    chip: "WhatsApp",
    ai: "Voice to clean text for Google",
  },
];

export const HOW_BANNER =
  "AI does what plain SMS can’t: hears Wolof, translates, listens to tourists, speaks back.";
export const WHY_WHATSAPP =
  "Why WhatsApp for tourists? They already have data and it carries voice. Noor never needs it.";

export const TRY_IT =
  "The demo runs on a private Twilio sandbox, so it isn’t open to the public. The recorded walkthrough is the way to see it.";

export const EXTRAS = [
  {
    title: "Google listing",
    tag: "Draft: a person publishes it",
    body: "Built only from Noor’s approved answers. Shows what’s missing. Nothing is sent to Google.",
  },
  {
    title: "One-tap review",
    tag: "Built up to the link",
    body: "A tourist speaks, Teranga writes it clean, they paste it into Google. Never posted for them.",
  },
];

export const CHANNELS = [
  { channel: "Phone call", icon: "📞", who: "Noor", use: "Records her answers. No internet." },
  {
    channel: "SMS",
    icon: "💬",
    who: "Noor and both champions",
    use: "Review, coaching, listing, notices. No internet.",
  },
  {
    channel: "WhatsApp",
    icon: "🟢",
    who: "Tourists",
    use: "Voice or text questions, answered in their language.",
  },
];
export const OFFLINE_INTRO =
  "Noor, her household champion and the community champion never need the internet for the core loop.";
export const OFFLINE_NOTE =
  "US carrier registration for SMS is still in review, so the live demo runs the same commands on WhatsApp, which mirrors them. The simulator on this page shows the SMS texts.";
export const OFFLINE_EXAMPLE_NOTE = "Examples built by the same code, with sample inputs:";

export const COMMUNITY_TITLE = "A champion in every household. A champion in every community.";
export const COMMUNITY_INTRO =
  "Floods and storms hit every operator on a road or river at once. One trusted person can reach them all.";
export const ROLES = PEOPLE.filter((p) => p.name.includes("champion"));
export const COMMUNITY = [
  {
    icon: "⚠️",
    title: "Community notices",
    tag: "Built",
    body: "One notice: SMS to members, and under every tourist answer in their language. Fixed wording. Never an official warning.",
  },
  {
    icon: "🌐",
    title: "Translation checks",
    tag: "Built",
    body: "A bilingual reviewer approves the English. Tourists see “English checked”.",
  },
  {
    icon: "🤝",
    title: "Fair referrals",
    tag: "Simulated partners",
    body: "Rotating tour suggestions. No money. Fictional partners.",
  },
  {
    icon: "📈",
    title: "Shared coaching",
    tag: "Real public data",
    body: "Learn from the whole sector’s reviews, not just your own.",
  },
];

export const CHAIN_TITLE = "Who is in the chain";
export const CHAIN = [
  { icon: "🧳", name: "Tourist", line: "Asks in their own language" },
  { icon: "✨", name: "Teranga AI", line: "Hears, translates, speaks back" },
  { icon: "📞", name: "Noor", line: "Answers in Wolof and approves" },
];
export const CHAIN_SUPPORT = [
  {
    icon: "📱",
    name: "Household champion",
    line: "Smartphone in the family. Syncs tourist questions each week.",
  },
  {
    icon: "🤝",
    name: "Community champion",
    line: "One person for a circle. Notices, translation checks, referrals.",
  },
];

export const REFERRALS_TITLE = "Fair referrals";
export const REFERRALS_SUB =
  "Wants something Noor doesn’t offer? A neighbour gets the visitor. Partners take turns.";
export const REFERRAL_STEPS = [
  {
    icon: "🧳",
    title: "Visitor opts in",
    body: "Picks nature, culture or food.",
    chip: "WhatsApp",
  },
  {
    icon: "🔄",
    title: "One partner, in turn",
    body: "Fewest referrals this month.",
    chip: "Fair rotation",
  },
  {
    icon: "🤝",
    title: "A person connects",
    body: "Noor or the community champion passes on the contact.",
    chip: "Human step",
  },
];
export const REFERRAL_FACTS = ["No money", "Number never shared", "Fictional partners"];

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
  `Matching was tested on real visitor questions from Gambian operators’ public FAQ pages, not on made-up ones. On 103 questions not used for tuning: ${HOLDOUT_RESULTS.score.correct} of ${HOLDOUT_RESULTS.score.inScope} questions about Noor’s ten topics were answered correctly, none got a wrong-topic answer, and ${HOLDOUT_RESULTS.score.outDeclined} of ${HOLDOUT_RESULTS.score.outOfScope} questions she has no answer for were correctly declined (${HOLDOUT_RESULTS.score.outAnswered} were answered wrongly). Before the fix, 17 of 37 such questions were answered wrongly. The labels are our own judgment and the questions are English only.`,
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
