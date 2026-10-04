// Review coaching from public Google Maps reviews (server-only). All work happens inside the request
// with a time budget. Raw review text and author names live only in memory for this request.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  THEMES, buildActions, countThemes, formatCoach, isFresh, priceSummary, toStoredRun, verifiedPrices,
  type ReviewLabel, type StoredRun,
} from "./coach";

const MAPS = "https://connector-gateway.lovable.dev/google_maps";
const MAX_CALLS = 25;
const MAX_PLACES = 15;
const QUERIES = [
  "tour operator Gambia", "river boat tour Gambia", "birdwatching tour Gambia",
  "Banjul tour guide", "Kunta Kinteh island tour", "Kololi tour operator",
];

type Review = { text: string; rating: number | null; publishTime: string | null };
export type AiFn = (instructions: string, input: string, signal: AbortSignal | null) => Promise<string>;

function mapsHeaders(extra: Record<string, string>) {
  const lk = process.env["LOVABLE_API_KEY"], gk = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lk || !gk) throw new Error("Missing secret LOVABLE_API_KEY or GOOGLE_MAPS_API_KEY");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk, ...extra };
}

async function mapsCall(state: { calls: number; errors: string[] }, url: string, init: RequestInit, signal: AbortSignal) {
  if (state.calls >= MAX_CALLS) return null;
  state.calls++;
  try {
    const res = await fetch(url, { ...init, signal });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      state.errors.push(`${res.status}: ${body}`);
      console.error(`[coach] places error ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    state.errors.push((e as Error).name === "AbortError" ? "timeout" : (e as Error).message.slice(0, 100));
    return null;
  }
}

const LABEL_RULES = `You label tour-operator reviews. Use ONLY what each review says. Never invent.
Allowed themes: ${THEMES.join(", ")}. Sentiment: positive or negative.
For each review return its themes (only if clearly mentioned) and any prices literally written (amount as number, currency as written).
Output ONLY JSON: {"labels":[{"i":0,"themes":[{"theme":"guide_quality","sentiment":"positive"}],"prices":[{"amount":1500,"currency":"dalasi"}]}]}`;

export async function fetchAndAnalyze(aiText: AiFn, budgetMs: number): Promise<StoredRun> {
  const deadline = Date.now() + budgetMs;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), budgetMs);
  const state = { calls: 0, errors: [] as string[] };
  try {
    const searches = await Promise.all(QUERIES.map((q) => mapsCall(state, `${MAPS}/places/v1/places:searchText`, {
      method: "POST",
      headers: mapsHeaders({ "Content-Type": "application/json", "X-Goog-FieldMask": "places.id" }),
      body: JSON.stringify({ textQuery: q, pageSize: 10, regionCode: "GM" }),
    }, ctl.signal)));
    const ids = [...new Set(searches.flatMap((s) => ((s?.places ?? []) as Array<{ id: string }>).map((p) => p.id)))].slice(0, MAX_PLACES);
    console.log(`[coach] search done places=${ids.length} calls=${state.calls}`);

    const details = await Promise.all(ids.map((id) => mapsCall(state, `${MAPS}/places/v1/places/${encodeURIComponent(id)}`, {
      headers: mapsHeaders({ "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,priceLevel,reviews.text,reviews.rating,reviews.publishTime,googleMapsUri" }),
    }, ctl.signal)));
    const reviews: Review[] = [];
    const placeIds: string[] = [];
    for (const d of details) {
      if (!d?.id) continue;
      placeIds.push(d.id);
      for (const r of (d.reviews ?? []) as Array<{ text?: { text?: string }; rating?: number; publishTime?: string }>) {
        const text = r.text?.text?.trim();
        if (text) reviews.push({ text: text.slice(0, 800), rating: r.rating ?? null, publishTime: r.publishTime ?? null });
      }
    }
    console.log(`[coach] details done places=${placeIds.length} reviews=${reviews.length} calls=${state.calls}`);

    let labels: ReviewLabel[] = [];
    if (reviews.length) {
      const left = deadline - Date.now();
      if (left < 2000) throw new Error("Time budget used up before analysis");
      const input = reviews.map((r, i) => `[${i}] ${r.text}`).join("\n");
      const raw = await aiText(LABEL_RULES, input, ctl.signal);
      const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { labels: Array<ReviewLabel & { i: number }> };
      labels = reviews.map((r, i) => {
        const l = json.labels?.find((x) => x.i === i);
        return { themes: l?.themes ?? [], prices: verifiedPrices(r.text, l?.prices ?? []) };
      });
    }
    const themes = countThemes(labels);
    const dates = reviews.map((r) => r.publishTime).filter(Boolean).sort() as string[];
    return toStoredRun({
      place_ids: placeIds, places_count: placeIds.length, reviews_count: reviews.length,
      date_from: dates[0]?.slice(0, 10) ?? null, date_to: dates.at(-1)?.slice(0, 10) ?? null,
      ...priceSummary(labels.flatMap((l) => l.prices)),
      actions: buildActions(themes, reviews.length),
      api_calls: state.calls, api_errors: state.errors, themes,
    });
  } finally {
    clearTimeout(timer);
  }
}

export type CoachStore = {
  latest: () => Promise<(StoredRun & { fetched_at: string }) | null>;
  save: (r: StoredRun) => Promise<void>;
};

export const dbStore: CoachStore = {
  latest: async () => {
    const { data } = await supabaseAdmin.from("coach_runs" as never).select("*").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const run = data as unknown as StoredRun & { id: string; fetched_at: string };
    const { data: th } = await supabaseAdmin.from("coach_themes" as never).select("theme, sentiment, count").eq("run_id", run.id).order("count", { ascending: false });
    return { ...run, themes: (th ?? []) as unknown as StoredRun["themes"] };
  },
  save: async (r) => {
    const { themes, ...row } = toStoredRun(r);
    const { data, error } = await supabaseAdmin.from("coach_runs" as never).insert(row as never).select("id").single();
    if (error) throw new Error(`coach save failed: ${error.message}`);
    const id = (data as { id: string }).id;
    if (themes.length) await supabaseAdmin.from("coach_themes" as never).insert(themes.map((t) => ({ ...t, run_id: id })) as never);
  },
};

/** Cached for 24 h: repeated COACH calls make no Google or AI calls. */
export async function getCoaching(aiText: AiFn, budgetMs = 10000, store: CoachStore = dbStore, fetcher = fetchAndAnalyze) {
  const cached = await store.latest();
  if (cached && isFresh(cached.fetched_at)) return { run: cached, cached: true, messages: formatCoach(cached) };
  const run = await fetcher(aiText, budgetMs);
  // Do not cache a run that failed outright, so it can be retried.
  if (run.places_count > 0 || run.api_errors.length === 0) await store.save(run);
  return { run, cached: false, messages: formatCoach(run) };
}

export async function coachMore(store: CoachStore = dbStore) {
  const cached = await store.latest();
  if (!cached || !isFresh(cached.fetched_at)) return "No recent coaching. Send COACH first.";
  return formatCoach(cached)[1] ?? "Nothing more: everything was in the first message.";
}
