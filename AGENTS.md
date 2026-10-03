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

- No user web UI: all interaction is WhatsApp/SMS via TanStack server routes under src/routes/api/public/ (stack has no Supabase edge functions); logic in src/lib/tourcoach.server.ts, matching in pure src/lib/match.ts — single place for channel handlers.
- Tables have RLS with no policies; only service-role server code touches them — no client data access exists.
- Slow AI/voice work runs after the webhook reply via runInBackground (src/lib/background.server.ts, Worker waitUntil through AsyncLocalStorage set in src/server.ts) — keeps Twilio replies fast.
- Phone-call input (Twilio Voice) lives in voice-incoming / voice-recorded / voice-status routes and reuses processRecording; signature URL = TWILIO_WEBHOOK_URL origin + route path, so one secret serves every route.
