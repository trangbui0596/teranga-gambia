# Teranga

A Gambian tour operator answers visitors in English, German and Dutch with her own pre-approved words.
"Teranga" is Wolof for hospitality. This is a hackathon prototype for the World Bank x Hack-Nation
"Small AI for Development" Tourism track. It is not a product.

**Noor** is a fictional tour operator in The Gambia. She speaks Wolof and has a basic phone.

## How it works

1. **Record.** Noor phones the Teranga number and answers common visitor questions out loud, in Wolof (10 question cards; the demo call asks 2 by default). No internet needed.
2. **Review.** A family helper gets the Wolof transcript, the numbers it heard and any flags on WhatsApp, and approves each answer.
3. **Answer.** Visitors ask on WhatsApp in English, German or Dutch. They get the approved answer as text plus an AI-generated voice note, labeled machine-translated. If the match is weak the bot says "Not sure, Noor will answer" and never guesses.
4. **Coach.** Plain advice for Noor in Wolof, built from real public Google Maps reviews (small sample, no raw review text stored).

There is no web UI beyond a status/landing page at `/`. Everything else is WhatsApp, SMS and voice.

## What the AI does that plain SMS cannot

- **Hears Wolof speech.** Noor answers by phone and ElevenLabs Scribe turns her voice into text. Plain SMS needs typing and has no voice.
- **Translates and checks.** Machine translation Wolof to English to German and Dutch, with a round-trip consistency check that flags answers whose meaning drifted. All labeled machine-translated and unverified.
- **Speaks answers back.** Visitors get an AI-generated voice note in their language. SMS is text only.
- **Reads numbers heard in Wolof.** It shows them (for example "yuñi ak juróom teemeer" as about 1500) so a helper who does not read English can confirm prices.
- **Cleans up a spoken visitor review** into text ready to paste, changing no facts and no sentiment. The visitor posts it; nothing is published for them.
- **Summarizes many public Google reviews** into plain Wolof advice, and says so when there is not enough data.

## Beyond answers: the wider community

- **Cross-community recommendations (simulated demo).** A visitor sends `MORE`, picks nature, culture or food and says YES (opt-in). Teranga suggests a partner operator, rotating fairly (the partner with the fewest suggestions this month). No money, no number shared; `CONNECT` asks a person to pass on the contact, and the helper sees waiting requests with `LEDGER`. The partners are fictional sample operators. Texts are available in English, German and Dutch.
- **One-tap Google review.** A visitor sends `FEEDBACK` and speaks their review. Teranga writes it down as clean text (no facts or sentiment changed), then on `POST` sends that text as its own message (easy to copy) and the same Google review link everyone gets (`GOOGLE_REVIEW_URL`). The visitor taps, pastes and picks their own stars; nothing is posted for them and there is no review gating.
- **Google Business listing draft (simulated).** `LISTING` builds a draft from approved answers only; missing fields say "needs input". Nothing is sent to Google.

Safeguards, not AI features: visitor questions are answered by fixed keyword rules over approved answers
(no generation), so it never makes up an answer. The chat agent for the family helper can only propose
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
| `/api/public/whatsapp-webhook` | WhatsApp messages from helper and visitors |
| `/api/public/voice-incoming` | Incoming call from Noor, asks the questions |
| `/api/public/voice-recorded` | Recording callback (set by the call's TwiML) |
| `/api/public/voice-status` | Call ended; finishes processing, sends the summary |

Protected by header `x-digest-secret` (value of `DIGEST_TRIGGER_SECRET`):

| Route | Purpose |
| --- | --- |
| `/api/public/weekly-digest` | Weekly digest message |
| `/api/public/process-pending` | Finish unfinished voice answers |
| `/api/public/purge` | Delete unshared visitor reviews older than 24 hours |
| `/api/public/coach-run` | Run or return cached review coaching |
| `/api/public/eval-match` | Run the 20-question matching test (agent-written test data) |
| `/api/public/eval-agent` | Dry-run 15 scripted helper messages |

## Secrets (names only, set in the project secrets, never in code)

- Required: `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `LOVABLE_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `DEMO_CHAMPION_PIN`, `DEMO_SMS_NUMBER`, `DEMO_WHATSAPP_NUMBER`, `TWILIO_SMS_FROM`, `DIGEST_TRIGGER_SECRET`, `PHONE_HASH_SALT`.
- Optional: `GOOGLE_REVIEW_URL`, `TWILIO_WEBHOOK_URL`, `CALL_QUESTION_POSITIONS` (default `1,5`, at most 10), `MAX_OUTBOUND_PER_DAY` (default 60).
- Database connection: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (provided by Lovable Cloud).

## Twilio setup

- **WhatsApp sandbox:** Twilio Console, Messaging, Try it out, Send a WhatsApp message, Sandbox settings. Set "When a message comes in" to `https://<published-url>/api/public/whatsapp-webhook`, HTTP POST.
- **Voice:** open your Twilio number's Voice Configuration. "A call comes in" goes to `https://<published-url>/api/public/voice-incoming`, and "Call status changes" goes to `https://<published-url>/api/public/voice-status`, both HTTP POST. Only the number in `DEMO_SMS_NUMBER` is accepted.
- If Twilio signs a different URL than the server sees, set `TWILIO_WEBHOOK_URL` to the exact URL (voice routes use only its origin).

## Run the tests

```sh
npm install --no-package-lock --no-audit --no-fund --legacy-peer-deps
npx vitest run
npx tsc --noEmit -p .
```

## What is real and what is not

- The Wolof test audio is synthetic (text-to-speech), not a native speaker.
- Speech recognition on real Wolof speech is untested.
- All Wolof text in the app is machine-written and unverified by a native speaker.
- Translations are machine translations and say so.
- The 20-question matching test is agent-written test data, not real-visitor accuracy.
- SMS delivery is pending US carrier registration, so summaries arrive on WhatsApp through Twilio's sandbox.
- The partner recommendation, the partner list and the Google listing preview are simulated.
- Google review data is a small real public sample.
- The WDI figures on the landing page show context (tourism matters, about half the population is offline, phones are everywhere). They do not show lost enquiries or that Teranga fixes anything.

Privacy: no review gating (the same review link goes to every visitor); visitor voice reviews are deleted on NO or after 24 hours unless the visitor chooses to share. Noor's own recordings are kept until the project owner deletes them; there is no self-serve delete command yet.

## Next steps

- Test with a real native Wolof speaker and review all Wolof wording.
- Add other languages.
- Add a bilingual reviewer role.
- Turn on real SMS after carrier registration.
- Replace the simulated partner list with real operators who have opted in. Add a pricing range only with real data.
- A self-serve command to delete recordings.

Built with TanStack Start, React, TypeScript and Tailwind CSS. Connected to Lovable; pushes to `main` sync back into the editor.
