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
