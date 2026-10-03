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
- Visitor matching is client-side keyword matching in src/lib/tour.ts against approved answers only; low confidence never answers and logs to `unanswered` — no guessing until AI is added.
