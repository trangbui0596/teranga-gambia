import { HOLDOUT_RESULTS } from "./match-eval-results";
// Copy for the home page. No statistics are typed here: every number comes from src/lib/evidence.ts,
// where each one carries its World Bank indicator and link. Keep it that way.

export const REPO_URL = "https://github.com/trangbui0596/teranga-gambia";
/** Set to the demo video link once it is uploaded; the "Watch the demo" button appears automatically. */
export const VIDEO_URL = "/demo.mp4";
/** Add screenshots after filming (files in public/screens/); the "Screens" tab appears automatically. */
export const SCREENS: Array<{ src: string; alt: string; caption: string }> = [];

export type TabId = "sms" | "community" | "offline" | "real" | "sources" | "screens";

export const TABS: Array<{ id: TabId; label: string; icon: string; teaser: string }> = [
  { id: "sms", label: "Try SMS", icon: "💬", teaser: "Text Teranga yourself (simulated)" },
  {
    id: "community",
    label: "Neighbours together",
    icon: "🤝",
    teaser: "Referrals between operators, and one message that warns everyone",
  },
  {
    id: "offline",
    label: "Works offline",
    icon: "📵",
    teaser: "What Noor can do with no internet",
  },
  { id: "real", label: "What’s real", icon: "✅", teaser: "What works today, and what doesn’t" },
  { id: "sources", label: "Sources", icon: "🔗", teaser: "Every number, with its link" },
  ...(SCREENS.length
    ? [
        {
          id: "screens" as TabId,
          label: "Screens",
          icon: "🖼️",
          teaser: "Screenshots from the demo",
        },
      ]
    : []),
];

export const PROBLEM_SUB =
  "Tourists write in English, German and Dutch. Noor speaks Wolof on a basic phone. Every enquiry she can’t read is a booking she can’t win.";

/** World Bank format: Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]. */
export const PROBLEM_STATEMENT =
  "Because of Teranga, a Gambian tourism operator will turn one phone call in Wolof into answers tourists can read in English, German or Dutch, without internet. Her Google listing is drafted from those answers, and tourists can leave a review by voice. Each week she learns what tourists ask, and her community looks out for one another with shared notices and referrals. Without it, she misses or answers late the enquiries she can’t read. We know because the World Bank figures above show how much tourism earns and how many Gambians are still offline.";

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

export const TRY_IT =
  "The demo runs on a private Twilio sandbox, so it isn’t open to the public. The recorded walkthrough is the way to see it.";

export const CHANNELS = [
  { channel: "Phone call", icon: "📞", who: "Noor", use: "Records her answers. No internet." },
  {
    channel: "SMS",
    icon: "💬",
    who: "Noor and the community champion",
    use: "Approve answers, coaching, listing, weekly digest, notices. No internet.",
  },
  {
    channel: "WhatsApp",
    icon: "🟢",
    who: "Tourists and the household champion",
    use: "Tourists ask by voice or text. The champion syncs once a week.",
  },
];
export const OFFLINE_INTRO =
  "Noor never needs the internet. Her household champion needs it about once a week, and tourists need it to ask.";
export const OFFLINE_NOTE =
  "US carrier registration for SMS is still in review, so the live demo runs the same commands on WhatsApp, which mirrors them. The simulator on this page shows the SMS texts.";
export const OFFLINE_EXAMPLE_NOTE = "Examples built by the same code, with sample inputs:";

export const COMMUNITY_TITLE = "Neighbours who look out for each other";
export const COMMUNITY_INTRO =
  "When one operator is full, a neighbour gets the visitor. When the river rises, one message warns everyone.";
export const REFERRALS_TITLE = "Fair referrals";
export const REFERRALS_SUB =
  "A visitor wants something Noor doesn’t offer? A neighbour welcomes them. Partners take turns, so every operator gets a share.";
export const REFERRAL_STEPS = [
  {
    icon: "🧳",
    title: "The visitor says yes",
    body: "Picks nature, culture or food and agrees to a suggestion.",
    chip: "WhatsApp",
  },
  {
    icon: "🔄",
    title: "One neighbour, in turn",
    body: "The partner with the fewest referrals this month.",
    chip: "Fair rotation",
  },
  {
    icon: "🤝",
    title: "A person connects them",
    body: "Noor or the community champion passes on the contact.",
    chip: "Human step",
  },
];
export const REFERRAL_FACTS = [
  "No money changes hands",
  "The visitor’s number is never shared",
  "Partners shown are fictional",
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
    line: "Smartphone in the family. Each week syncs tourist questions, feedback and public reviews.",
  },
  {
    icon: "🤝",
    name: "Community champion",
    line: "One person for a circle. Notices, translation checks, referrals.",
  },
];

export type StoryPage = {
  kind: "cover" | "step" | "end";
  day?: string;
  icon: string;
  title: string;
  text: string;
  net?: { online: boolean; text: string };
  chip?: string;
  /** Add a real photo here (file in public/photos/) with its credit; until then the page shows an illustration. */
  photo?: { src: string; alt: string; credit: string };
};
export const STORYBOOK: StoryPage[] = [
  {
    kind: "cover",
    icon: "🌍",
    title: "A week with Noor",
    photo: {
      src: "/photos/page1.jpg",
      alt: "Noor, a tourism operator in The Gambia, holding a basic phone on a river jetty at sunset",
      credit: "AI-generated illustration",
    },
    text: "Noor runs river tours in The Gambia. She speaks Wolof and has a basic phone. Turn the page to follow her week.",
    chip: "An illustrative story. Noor is fictional.",
  },
  {
    kind: "step",
    day: "Monday",
    icon: "📞",
    title: "The call",
    photo: {
      src: "/photos/page2.jpg",
      alt: "Noor on a phone call on a veranda by the river, a tour boat behind her",
      credit: "AI-generated illustration",
    },
    text: "Noor calls the Teranga number. A voice asks her ready-made questions and she answers aloud in Wolof.",
    net: { online: false, text: "No internet" },
    chip: "Phone call",
  },
  {
    kind: "step",
    day: "Tuesday",
    icon: "✅",
    title: "She approves",
    photo: {
      src: "/photos/page3.jpg",
      alt: "Hands holding a basic phone showing a text with a green tick, a river tour boat behind",
      credit: "AI-generated illustration",
    },
    text: "A text shows what the AI heard, in Wolof, with the numbers. One digit approves it. Nothing goes out without her.",
    net: { online: false, text: "No internet" },
    chip: "SMS",
  },
  {
    kind: "step",
    day: "Wednesday",
    icon: "🗺️",
    title: "Her Google listing",
    photo: {
      src: "/photos/page4.jpg",
      alt: "A young man with a smartphone showing a map pin and a listing card, a river boat behind him",
      credit: "AI-generated illustration",
    },
    text: "Teranga drafts her Google listing from her own answers. What it doesn’t know stays “needs input”. Her household champion claims it.",
    net: {
      online: false,
      text: "Noor: no internet. Claiming it on Google needs internet (household champion)",
    },
    chip: "SMS + Google Maps",
  },
  {
    kind: "step",
    day: "Thursday",
    icon: "🧳",
    title: "A tourist asks",
    photo: {
      src: "/photos/page5.jpg",
      alt: "A tourist in a sun hat speaking into her phone on a jetty by a river tour boat",
      credit: "AI-generated illustration",
    },
    text: "A visitor asks on WhatsApp, by voice, in German. Teranga answers in German, as text and voice, in Noor’s approved words.",
    net: { online: true, text: "Tourist needs internet" },
    chip: "WhatsApp",
  },
  {
    kind: "step",
    day: "Friday",
    icon: "🔄",
    title: "The weekly sync",
    photo: {
      src: "/photos/page6.jpg",
      alt: "A household champion under a tree with a smartphone, chat, star and map icons floating above it",
      credit: "AI-generated illustration",
    },
    text: "Her household champion syncs new questions, feedback and public reviews from tourists across the whole sector, not only Noor’s. The AI sends Noor a short Wolof SMS on what to improve.",
    net: { online: true, text: "Household champion needs internet. Noor gets it by SMS" },
    chip: "One light batch a week: counts and a short summary, no heavy model",
  },
  {
    kind: "step",
    day: "Saturday",
    icon: "⭐",
    title: "A voice review",
    photo: {
      src: "/photos/page7.jpg",
      alt: "A tourist on a painted river boat speaking a review into her phone, five stars glowing above her",
      credit: "AI-generated illustration",
    },
    text: "After the tour, the visitor speaks a review. Teranga cleans up the text. The visitor pastes and posts it themselves.",
    net: { online: true, text: "Tourist needs internet" },
    chip: "WhatsApp",
  },
  {
    kind: "step",
    day: "Sunday",
    icon: "🤝",
    title: "Neighbours look out for each other",
    photo: {
      src: "/photos/page8.jpg",
      alt: "Three neighbours on a flooded riverside road reading a warning on a basic phone",
      credit: "AI-generated illustration",
    },
    text: "The river road floods. The community champion sends one notice by SMS, and visitors see it under every answer. Extra guests are referred to a neighbour, in turn.",
    net: { online: false, text: "Members read the notice by SMS, no internet" },
    chip: "Community champion",
  },
  {
    kind: "end",
    icon: "✨",
    title: "That is the loop",
    photo: {
      src: "/photos/page9.jpg",
      alt: "A family in a painted boat on the river at sunset",
      credit: "AI-generated illustration",
    },
    text: "One call, answers in three languages, a listing, reviews and a community that looks out for each other. See the details, or try it.",
  },
];

export const REAL_LIVE = [
  "A real phone line and WhatsApp number (Twilio sandbox) run the full loop: call, transcript, Noor’s approval, visitor answers in text and voice, voice reviews, notices and referrals.",
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
  "Speech recognition is unreliable on real Wolof speech: it sometimes writes Wolof in the wrong alphabet, so the app retries and flags those answers instead of showing them. Prices are checked after translation, and a mismatch is flagged for Noor.",
  "The demo call asks 2 of the 10 questions to keep it short.",
  "SMS commands, community notices, translation checks and the Google listing pack are built and unit-tested, and the builder has run them live on WhatsApp. No real operator or tourist has used them yet.",
];

export const SOURCES_TOOLS: Array<{ name: string; what: string; href: string }> = [
  {
    name: "ElevenLabs",
    what: "speech-to-text (Scribe) for Wolof; text-to-speech for English, German and Dutch",
    href: "https://elevenlabs.io",
  },
  {
    name: "Twilio",
    what: "WhatsApp sandbox, SMS and the voice line",
    href: "https://www.twilio.com/docs/whatsapp/sandbox",
  },
  {
    name: "Google Maps Platform (Places)",
    what: "public reviews for coaching",
    href: "https://developers.google.com/maps/documentation/places/web-service/overview",
  },
  {
    name: "Lovable",
    what: "the app, database and AI for translation, summaries and review clean-up",
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
  noor: ["REVIEW", "COACH", "LISTING", "WEEK", "HELP"],
  visitor: ["How much does it cost?", "Where do we meet?", "Do I need a visa?", "STATUS"],
};
