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
- Review coaching (src/lib/coach.ts pure, coach.server.ts I/O): Google reviews live only in request memory; only derived counts persist; fresh runs happen in /api/public/coach-run, while commands read the 24 h cache; all Wolof output uses fixed bilingual templates, never runtime generation.
- Code can also be edited from GitHub (Claude Code); pushes to main sync into Lovable.
- Do not run `prettier --write` on src/lib/tourcoach.server.ts or other existing files: the repo's code is not prettier-formatted (printWidth 100 would rewrite whole files). Format only new files you create, and keep diffs to the lines you change.
- SMS for Noor's feature phone: src/lib/sms-text.ts (pure: GSM-7 plain text, at most 3 parts, opt-out line always kept) and POST /api/public/sms-webhook (Noor's number only: COACH, LISTING, WEEK, HELP, EN for English; STOP/START never answered; visitors by SMS only with SMS_VISITOR_MODE=on). Approval receipts and coaching copies go out by SMS best effort (SMS_RECEIPTS=off disables receipts); if US SMS is blocked a command reply falls back to WhatsApp once.
- Google listing: src/lib/listing.ts builds the pack from APPROVED answers only; nothing is sent to Google and no contact detail is ever invented.
- Community Circle: src/lib/community.ts (pure) plus the community_alerts table. The community champion logs in with COMMUNITY <PIN> (same demo PIN) and uses ALERT / ALERTS / BILINGUAL / PULSE. Notices use fixed templates in four languages (never machine-translated), last 24 h and appear under every visitor answer. BILINGUAL approves answers that a household champion sent to a bilingual reviewer and adds the flag "bilingual verified".
- Weekly sync: src/lib/weekly-insight.ts (pure, counts only) + weeklySync()/runWeeklySync() in tourcoach.server.ts; POST /api/public/weekly-sync (digest secret) and the champion command SYNC. Home-page simulator: POST /api/public/sms-sim -> simulateSms() (must stay read-only and send nothing). A community champion may post ALERT notices by SMS; every other champion function stays on WhatsApp.
