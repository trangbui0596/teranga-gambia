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

- Champion screens live under src/routes/_authenticated and query via the browser client with RLS (has_role 'champion'); first signup gets the role via trigger — keeps write access server-enforced.
- Visitors use WhatsApp/SMS only (no public web page). Matching lives in pure src/lib/match.ts, exposed via answerVisitorQuestion in src/lib/matching.functions.ts; approved answers only, below threshold returns "Not sure" and logs to `unanswered` — reusable by future channel handlers.
