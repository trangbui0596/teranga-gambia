import { createFileRoute } from "@tanstack/react-router";

const FLEURS = "https://huggingface.co/datasets/google/fleurs/resolve/main/data";

// POST ?offset=0&limit=6 with header x-digest-secret. Takes Wolof sentences from the open FLEURS dev set (the same sentences as FLORES-200,
// with the same ids in English), translates them to English with the app's own translator, and stores the pairs in eval_translation
// (service role only). Scoring is done offline. Batches are small to stay inside the Worker time budget.
export const Route = createFileRoute("/api/public/eval-translate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) return new Response("Unauthorized", { status: 401 });
        const u = new URL(request.url);
        const offset = Math.max(0, Number(u.searchParams.get("offset") ?? 0) || 0);
        const limit = Math.min(8, Math.max(1, Number(u.searchParams.get("limit") ?? 6) || 6));
        const tsv = async (lang: string) => {
          const r = await fetch(`${FLEURS}/${lang}/dev.tsv`);
          if (!r.ok) throw new Error(`FLEURS ${lang} ${r.status}`);
          return (await r.text()).split("\n").map((l) => l.split("\t")).filter((c) => c.length > 3);
        };
        const [wo, en] = await Promise.all([tsv("wo_sn"), tsv("en_us")]);
        const enById = new Map<string, string>();
        for (const c of en) if (!enById.has(c[0]!)) enById.set(c[0]!, c[2]!);
        const seen = new Set<string>();
        const pairs: Array<{ id: string; wolof: string; reference: string }> = [];
        for (const c of wo) {
          const id = c[0]!;
          if (seen.has(id) || !enById.has(id)) continue;
          seen.add(id);
          pairs.push({ id, wolof: c[2]!, reference: enById.get(id)! });
        }
        pairs.sort((a, b) => a.id.localeCompare(b.id));
        const batch = pairs.slice(offset, offset + limit);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = [] as Array<{ id: string; wolof: string; reference: string; hypothesis: string | null }>;
        for (const p of batch) rows.push({ ...p, hypothesis: await lib.translate(p.wolof, "en", AbortSignal.timeout(9000)) });
        if (rows.length) await supabaseAdmin.from("eval_translation" as never).upsert(rows as never);
        return Response.json({ total: pairs.length, offset, done: rows.length, next: offset + rows.length < pairs.length ? offset + rows.length : null });
      },
    },
  },
});
