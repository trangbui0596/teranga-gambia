# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## TourCoach: Twilio WhatsApp sandbox setup

There is no user web UI; everything happens over WhatsApp and SMS.

1. In the Twilio Console open **Messaging → Try it out → Send a WhatsApp message → Sandbox settings**.
2. Set **"When a message comes in"** to
   `https://project--8698e7a7-7be2-4ef9-87d0-56f82e8d381d.lovable.app/api/public/whatsapp-webhook`
   (published app; use `https://project--8698e7a7-7be2-4ef9-87d0-56f82e8d381d-dev.lovable.app/api/public/whatsapp-webhook` for the preview build), method **HTTP POST**.
3. If Twilio signs a different URL than the server sees, set the secret `TWILIO_WEBHOOK_URL` to the exact URL from step 2.

Weekly digest: `POST /api/public/weekly-digest` with header `x-digest-secret: <DIGEST_TRIGGER_SECRET>`.

Secrets (Project Settings → Secrets, never in code): `DEMO_CHAMPION_PIN`, `DEMO_SMS_NUMBER`, `DEMO_WHATSAPP_NUMBER` (sandbox number), `TWILIO_AUTH_TOKEN` (signature check), `TWILIO_SMS_FROM` (Twilio SMS sender), `DIGEST_TRIGGER_SECRET`, optional `GOOGLE_REVIEW_URL`, optional `TWILIO_WEBHOOK_URL`. `PHONE_HASH_SALT` is generated automatically.

## Phase 2A: voice pipeline

- Champion voice note → "Got question N" right away; in the background: Twilio media download → ElevenLabs speech-to-text (scribe_v2, Wolof) → Lovable AI translation (Wolof→English, English→German/Dutch) → round-trip check (English→Wolof, score 0–1). Score < 0.7 or differing numbers/names adds the flag "round-trip mismatch". Answers always stay pending until the champion approves.
- The champion then gets the Wolof transcript (labelled "unverified (no native reviewer yet)") and "Numbers heard: …". REVIEW shows only Wolof, numbers and flags — never English.
- After approval, ElevenLabs (eleven_multilingual_v2, stock voice) makes EN/DE/NL mp3s in the private `answer-audio` bucket. Visitors get one text plus at most one voice note ("AI-generated voice").
- Daily cap: `MAX_OUTBOUND_PER_DAY` (default 60). After that the bot stops replying and logs it.
- Evaluation: `POST /api/public/eval-match` with header `x-digest-secret`. Empty body uses the 20 seeded evaluation questions (test data, not real visitors); or send `{"questions":[{"text":"…","expected_topic":"price"}]}`.

## Phase 2B: phone-call input (Noor's feature phone)

In the Twilio Console open **Phone Numbers → Manage → Active numbers → (your number) → Voice Configuration**:

1. **A call comes in** → Webhook `https://<published-url>/api/public/voice-incoming`, **HTTP POST**.
2. **Call status changes** → `https://<published-url>/api/public/voice-status`, **HTTP POST** (sends the one summary SMS if the call ends before question 10).

Only calls from the number in `DEMO_SMS_NUMBER` are accepted; everyone else hears "Sorry, this line is private." The bot says only "Question 1" … "Question 10" (Noor uses a printed card). Each answer goes through the same pipeline as WhatsApp voice notes and appears in the champion's WhatsApp REVIEW. After the call: one SMS "TourCoach demo: Got N of 10 answers. The family helper will check them." (counts toward `MAX_OUTBOUND_PER_DAY`).

Secrets used (no new ones): `TWILIO_AUTH_TOKEN`, `DEMO_SMS_NUMBER`, `TWILIO_SMS_FROM`, optional `TWILIO_WEBHOOK_URL` (only its domain is used for the voice routes' signature check).

## Phase 2G: champion assistant on WhatsApp

In champion mode, free-text or voice messages go to an AI assistant (Lovable AI, tool calling). It can only: list pending answers, show one (Wolof transcript, Numbers heard, flags), propose approve / re-record / bilingual reviewer (executed only after the champion replies YES; round-trip mismatches are called out), start a recording round, show week stats, list unanswered questions, show help. Max 3 tool calls and one reply per message; replies labelled AI-generated; Wolof replies labelled "machine-generated, unverified". START, REVIEW, 1/2/3 and EXIT still work as shortcuts. Visitor mode is unchanged.

Evaluation: `POST /api/public/eval-agent` with header `x-digest-secret` (dry run, 15 scripted messages, nothing changed or sent).

## Visitor voice reviews (phase 2C)
Visitor sends FEEDBACK, then a voice note (language auto-detected) or text. The bot returns a lightly cleaned version
(punctuation/fillers only; falls back to the raw transcript if numbers or names changed) with POST / EDIT / NO / SHARE.
POST sends the text plus the GOOGLE_REVIEW_URL link (same link for everyone, no rating asked). We never post anything.
Only SHARE lets Noor see it. NO deletes it at once; unshared reviews are deleted after 24h by
`POST /api/public/purge` (header `x-digest-secret`), which also runs with every weekly digest.
