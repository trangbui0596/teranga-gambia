# Teranga

**One phone call in Wolof becomes answers every tourist can read.**

"Teranga" is Wolof for hospitality. This is a hackathon prototype for the World Bank x Hack-Nation
"Small AI for Development" Tourism track. It is a prototype, not a product.

**Live page:** https://teranga-gambia.lovable.app

**Noor** is a fictional tourism operator in The Gambia. She speaks Wolof and has a basic phone.

## The problem

Tourism earned The Gambia US$157 million in 2019 (43.6% of exports), and about half of Gambians are still offline
([World Bank WDI](https://data.worldbank.org/country/gambia-the)). Tourists write in English, German and Dutch.
Operators like Noor speak Wolof on basic phones, so enquiries they cannot read are missed or answered late.
We did not measure how many enquiries are lost, and claim no number for it. Every statistic on the page is linked
to its World Bank indicator.

## Three people

| Who | What they do | Needs the internet? |
| --- | --- | --- |
| **Noor** (tourism operator) | Records her answers once by phone call, approves them by text, and receives coaching, her Google listing draft and weekly digest by SMS | No |
| **The tourist** | Asks on WhatsApp in text or voice, in English, German or Dutch, and gets Noor's approved answer as text and an AI voice note. Can leave a Google review by voice | Yes |
| **The community champion** (and a **household champion** with a smartphone who syncs once a week) | Sends flood and closure notices, checks translations, passes on referrals between neighbouring operators | Household champion about once a week; Noor never |

## How it works

1. **Record.** Noor phones the Teranga number and answers ready-made questions aloud in Wolof (10 question cards; the demo call asks 2 by default).
2. **Approve.** She gets the Wolof transcript, the numbers it heard and any flags by text, and approves each answer with one digit. Nothing reaches a tourist without her approval.
3. **Answer.** Tourists ask on WhatsApp. Answers come from Noor's approved words, matched by fixed keyword rules (no AI writes an answer at question time). If the match is weak the bot says "Not sure, Noor will answer".
4. **List.** Teranga drafts a Google Business listing from her approved answers; anything it does not know says "needs input". Nothing is sent to Google.
5. **Review.** A tourist speaks a review, Teranga cleans it up without changing facts, and the tourist pastes and posts it themselves.
6. **Learn.** Each week the household champion syncs new tourist questions and feedback; public reviews are summarised into up to three plain actions, texted to Noor in Wolof. One light weekly batch, no always-on model.
7. **Look out for each other.** A community champion posts fixed-wording notices (flood, closed road, storm) that reach members by SMS and appear under every tourist answer. Fair referrals rotate extra guests between neighbouring operators (simulated partners).

The page at `/` shows the problem first, then who is in the chain, a swipeable storybook ("A week with Noor"), and short chapters (Try SMS, Works offline, What's real, Sources). Everything else is voice, SMS and WhatsApp.

## What the AI does that plain SMS cannot

- **Hears Wolof speech.** Noor answers by phone and ElevenLabs Scribe turns her voice into text. Plain SMS needs typing and has no voice.
- **Translates and checks.** Machine translation Wolof to English to German and Dutch, with a round-trip consistency check that flags answers whose meaning drifted. All labeled machine-translated and unverified.
- **Speaks answers back.** Visitors get an AI-generated voice note in their language. SMS is text only.
- **Reads numbers heard in Wolof.** It shows them (for example "yuñi ak juróom teemeer" as about 1500) so a household champion who does not read English can confirm prices.
- **Cleans up a spoken visitor review** into text ready to paste, changing no facts and no sentiment. The visitor posts it; nothing is published for them.
- **Summarizes many public Google reviews** into plain Wolof advice, and says so when there is not enough data.

## Beyond answers: the wider community

- **Cross-community recommendations (simulated demo).** A visitor sends `MORE`, picks nature, culture or food and says YES (opt-in). Teranga suggests a partner operator, rotating fairly (the partner with the fewest suggestions this month). No money, no number shared; `CONNECT` asks a person to pass on the contact, and the household champion sees waiting requests with `LEDGER`. The partners are fictional sample operators. Texts are available in English, German and Dutch.
- **One-tap Google review.** A visitor sends `FEEDBACK` and speaks their review. Teranga writes it down as clean text (no facts or sentiment changed), then on `POST` sends that text as its own message (easy to copy) and the same Google review link everyone gets (`GOOGLE_REVIEW_URL`). The visitor taps, pastes and picks their own stars; nothing is posted for them and there is no review gating.
- **Google Business listing draft (simulated).** `LISTING` builds a draft from approved answers only; missing fields say "needs input". Nothing is sent to Google.

Safeguards, not AI features: visitor questions are answered by fixed keyword rules over approved answers
(no generation), so it never makes up an answer. The chat agent for the household champion can only propose
changes, which run after an explicit YES.

## Architecture

- TanStack Start app on Cloudflare Workers (Lovable Cloud database and hosting).
- Server routes live in `src/routes/api/public/`. Logic lives in `src/lib/`: I/O in `tourcoach.server.ts`, `agent.server.ts`, `coach.server.ts`; pure, unit-tested code in `match.ts`, `pipeline.ts`, `sms.ts`, `coach.ts`, `numbers.ts` and others.
- Voice answers go through **resumable stages** (received, transcribed, translated, checked) in `src/lib/pipeline.ts`. The stages run inside the request with a time budget and are resumed by later webhooks or `/api/public/process-pending`.
- Workers constraints: no work after the response is relied on (background work is best effort only), and no Request/Response objects, timers, random values or I/O at module scope in server routes.
- Tables have RLS with no policies; only service-role server code touches them.

## Routes

Twilio-signed (signature checked with `TWILIO_AUTH_TOKEN`):

| Route | Purpose |
| --- | --- |
| `/api/public/whatsapp-webhook` | WhatsApp messages from Noor, champions and visitors |
| `/api/public/sms-webhook` | Inbound SMS: Noor's number can text COACH, LISTING, WEEK or HELP (EN for English) |
| `/api/public/sms-sim` | Public simulator for the home page: returns the SMS text Teranga would send (reads demo data, sends and writes nothing) |
| `/api/public/voice-incoming` | Incoming call from Noor, asks the questions |
| `/api/public/voice-recorded` | Recording callback (set by the call's TwiML) |
| `/api/public/voice-status` | Call ended; finishes processing, sends the summary |

Protected by header `x-digest-secret` (value of `DIGEST_TRIGGER_SECRET`):

| Route | Purpose |
| --- | --- |
| `/api/public/weekly-digest` | Weekly digest message |
| `/api/public/weekly-sync` | Weekly sync: fresh public-review scan + what visitors asked and found unclear; report to the household champion on WhatsApp, short SMS to Noor |
| `/api/public/process-pending` | Finish unfinished voice answers |
| `/api/public/purge` | Delete unshared visitor reviews older than 24 hours |
| `/api/public/coach-run` | Run or return cached review coaching |
| `/api/public/eval-match` | Run the 20-question matching test (agent-written test data) |
| `/api/public/eval-agent` | Dry-run 15 scripted champion messages |

## Secrets (names only, set in the project secrets, never in code)

- Required: `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `LOVABLE_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `DEMO_CHAMPION_PIN`, `DEMO_SMS_NUMBER`, `DEMO_WHATSAPP_NUMBER`, `TWILIO_SMS_FROM`, `DIGEST_TRIGGER_SECRET`, `PHONE_HASH_SALT`.
- Optional: `SMS_RECEIPTS` (`off` stops approval receipts to Noor), `SMS_VISITOR_MODE` (`on` lets visitors use text-only SMS), `GOOGLE_REVIEW_URL`, `TWILIO_WEBHOOK_URL`, `CALL_QUESTION_POSITIONS` (default `1,5`, at most 10), `MAX_OUTBOUND_PER_DAY` (default 60).
- Database connection: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (provided by Lovable Cloud).

## Twilio setup

- **WhatsApp sandbox:** Twilio Console, Messaging, Try it out, Send a WhatsApp message, Sandbox settings. Set "When a message comes in" to `https://<published-url>/api/public/whatsapp-webhook`, HTTP POST.
- **Voice:** open your Twilio number's Voice Configuration. "A call comes in" goes to `https://<published-url>/api/public/voice-incoming`, and "Call status changes" goes to `https://<published-url>/api/public/voice-status`, both HTTP POST. Only the number in `DEMO_SMS_NUMBER` is accepted.
- **SMS (optional, for Noor's texts):** your Twilio number's Messaging configuration, "A message comes in" -> `https://<published-url>/api/public/sms-webhook`, HTTP POST. US delivery needs carrier (A2P 10DLC) registration; until then replies fall back to WhatsApp.
- If Twilio signs a different URL than the server sees, set `TWILIO_WEBHOOK_URL` to the exact URL (voice routes use only its origin).

## Offline SMS, Google listing and the community layer

- **Noor needs no internet.** She records by phone call. Coaching, Google listing progress, approval receipts, community notices and the weekly digest reach her as plain SMS (GSM-7 letters, at most three parts, opt-out line always kept). She can text `COACH`, `LISTING`, `WEEK` or `HELP` (`EN` for English). Wolof SMS text is machine-written and unverified.
- **Google listing:** `LISTING` (Noor by SMS, or a champion on WhatsApp) builds a Google Business Profile pack from approved answers only: description inside Google's 750-character limit, services, meeting point, booking, what is missing, which question card to record next, what only the household champion can add, and claim steps. Nothing is sent to Google.
- **Community Circle:** a community champion (`COMMUNITY <PIN>`, demo PIN) posts notices with `ALERT` (flood, closed road, storm, boats paused, tours closed, all clear), sees them with `ALERTS`, checks translations with `BILINGUAL` and sees an overview with `PULSE`. Notices are fixed templates in English, German, Dutch and Wolof, last 24 hours, are sent to members by SMS and appear under every visitor answer, always labeled as a community notice, not an official warning. Visitors can send `STATUS` to see them. Members other than Noor are simulated in the demo.

- **Weekly sync (`SYNC`, `/api/public/weekly-sync`):** re-reads public Google reviews, compares them with the previous run (themes whose share moved by 5 points or more), adds what visitors asked and marked "not clear" this week, and turns it into up to three plain actions (counts only, no AI). It does not yet scan news sources: none was reachable from our environment to test, so that is a next step.
- **SMS first:** everything Noor and the community champion do works over voice and SMS; WhatsApp is the household champion's weekly smartphone session and a convenience for visitors. US SMS delivery waits for carrier registration, so the live demo uses WhatsApp plus the simulator on the home page ("Try SMS").

## Landing page statistics

Every number on the landing page lives in `src/lib/evidence.ts` with its World Bank indicator code, year and link; nothing is typed by hand in the page. A test (`src/test/landing-evidence.test.tsx`) fails if a percentage, dollar amount or thousands figure appears that is not listed there, or if a number has no link to its data page. To re-check the values against the live World Bank API run `node scripts/verify-evidence.mjs` (Node 22.18 or newer).

Storybook pictures live in `public/photos/` (AI-generated illustrations, credited on the page). To show a "Watch the demo" button, set `VIDEO_URL` in `src/lib/landing-content.ts`; to show a "Screens" tab, add images to `public/screens/` and entries to `SCREENS`.

## Run the tests

```sh
npm install --no-package-lock --no-audit --no-fund --legacy-peer-deps
npx vitest run
npx tsc --noEmit -p .
```

## What is real and what is not

- The Wolof test audio is synthetic (text-to-speech), not a native speaker.
- Speech recognition on real Wolof speech is untested and unreliable.
- All Wolof text in the app is machine-written and unverified by a native speaker.
- Translations are machine translations and say so.
- Matching was tested on real visitor questions from Gambian operators' public FAQ pages (82 for tuning, 103 untuned held-out). Results are in `src/lib/match-eval-results.ts` and on the page. The labels are our own judgment and the questions are English only.
- Speech recognition sometimes writes Wolof in the wrong alphabet; the app retries once and flags the answer instead of showing it. Prices are checked after translation, and a mismatch is flagged for Noor.
- SMS delivery is pending US carrier registration, so summaries arrive on WhatsApp through Twilio's sandbox.
- The partner recommendation, the partner list and the Google listing preview are simulated.
- Google review data is a small real public sample.
- The World Bank figures on the landing page show context (tourism is a large share of exports, about half the population is offline, mobile subscriptions outnumber people). They do not show lost enquiries or that Teranga fixes anything.

Privacy: no review gating (the same review link goes to every visitor); visitor voice reviews are deleted on NO or after 24 hours unless the visitor chooses to share. Noor's own recordings are kept until the project owner deletes them; there is no self-serve delete command yet.

## Next steps

- Test with a real native Wolof speaker and review all Wolof wording.
- Add other languages.
- Add a bilingual reviewer role.
- Turn on real SMS after carrier registration.
- Replace the simulated partner list with real operators who have opted in. Add a pricing range only with real data.
- A self-serve command to delete recordings.

## Tech stack

- **Lovable**: app, hosting and Postgres database (Lovable Cloud); Lovable AI for translation, summaries and review clean-up.
- **Twilio**: voice line, WhatsApp sandbox and SMS.
- **ElevenLabs**: Scribe speech-to-text (Wolof recordings, tourist voice notes) and text-to-speech (English, German, Dutch).
- **Google Maps Platform (Places)**: public reviews for weekly coaching.
- **World Bank WDI API**: every statistic, re-checked by `scripts/verify-evidence.mjs`.
- TanStack Start, React, TypeScript, Tailwind CSS; 472 unit and smoke tests.

## Docs

Demo runbook, video script, filming guide, data notes and the matcher evaluation are in the companion docs repository:
https://github.com/trangbui0596/hacknation-worldbank-small-ai-for-tourism

Connected to Lovable; pushes to `main` sync back into the editor.
