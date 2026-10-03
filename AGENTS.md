<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Teranga

- No user web UI: all interaction is WhatsApp/SMS via TanStack server routes under src/routes/api/public/ (stack has no Supabase edge functions); logic in src/lib/tourcoach.server.ts, matching in pure src/lib/match.ts — single place for channel handlers.
- Tables have RLS with no policies; only service-role server code touches them — no client data access exists.
- Never rely on work after the response in Workers; use resumable stages: voice answers advance received→transcribed→translated→checked in src/lib/pipeline.ts, awaited with a time budget inside the request (finishAnswers), resumed by later webhooks, REVIEW and /api/public/process-pending; approved-answer voice files (one answer_audio row per language = its stage) are made inside the approval or visitor request and completed by finishAnswers; runInBackground (waitUntil) is best effort only — published Workers silently cut background work off.
- Phone-call input (Twilio Voice) lives in voice-incoming / voice-recorded / voice-status routes and reuses the resumable pipeline; signature URL = TWILIO_WEBHOOK_URL origin + route path, so one secret serves every route.
- Champion free text goes to src/lib/agent.server.ts (AI SDK, fixed tool set); review changes run only from a stored pending_action after an explicit YES, executed by server code, never by the model.
- SMS summaries and digests use the pure formatter in src/lib/sms.ts, with one capped WhatsApp fallback after a send failure — keeps A2P wording stable and avoids repeated sends.
- Never create Response/Request objects, timers, random values or I/O at module scope in server routes — Cloudflare Workers reject global-scope I/O and every route 500s.
