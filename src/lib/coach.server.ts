// Review coaching from public Google Maps reviews (server-only). All work happens inside the request
// with a time budget. Raw review text and author names live only in memory for this request.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  THEMES, buildActions, countThemes, formatCoach, isFresh, priceSummary, toStoredRun, verifiedPrices,
  type ReviewLabel, type StoredRun,
} from "./coach";
import { COACH_TEMPLATES, type CoachLanguage } from "./coach.templates";

const MAPS = "https://connector-gateway.lovable.dev/google_maps";
// More places = more real reviews. Stay well under the Workers subrequest limit (about 50 per request, shared with
// the database and AI calls): 10 searches + up to 24 detail calls + AI batches + a few database calls.
const MAX_CALLS = 36;
const MAX_PLACES = 24;
const AI_BATCH = 60;
const QUERIES = [
  "tour operator Gambia", "river boat tour Gambia", "birdwatching tour Gambia",
  "Banjul tour guide", "Kunta Kinteh island tour", "Kololi tour operator",
  "Kartong Gunjur nature tour", "Serrekunda Bakau excursion", "Janjanbureh Tendaba safari", "Abuko Makasutu eco tour",
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
      body: JSON.stringify({ textQuery: q, pageSize: 20, regionCode: "GM" }),
    }, ctl.signal)));
    // Interleave the searches so one query does not fill every slot.
    const lists = searches.map((s) => ((s?.places ?? []) as Array<{ id: string }>).map((p) => p.id));
    const ids: string[] = [];
    for (let i = 0; ids.length < MAX_PLACES && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const id = l[i];
        if (id && !ids.includes(id) && ids.length < MAX_PLACES) ids.push(id);
      }
    }
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
      // Batches run in parallel so a bigger sample does not cost more time or overflow one answer.
      const batches: Review[][] = [];
      for (let i = 0; i < reviews.length; i += AI_BATCH) batches.push(reviews.slice(i, i + AI_BATCH));
      const outs = await Promise.all(batches.map((b) => aiText(LABEL_RULES, b.map((r, i) => `[${i}] ${r.text}`).join("\n"), ctl.signal)));
      labels = batches.flatMap((b, bi) => {
        const raw = outs[bi]!;
        const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { labels: Array<ReviewLabel & { i: number }> };
        return b.map((r, i) => {
          const l = json.labels?.find((x) => x.i === i);
          return { themes: l?.themes ?? [], prices: verifiedPrices(r.text, l?.prices ?? []) };
        });
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

/** The run before the latest one, for week-on-week changes. */
export async function previousRun(): Promise<StoredRun | null> {
  const { data } = await supabaseAdmin.from("coach_runs" as never).select("*").order("fetched_at", { ascending: false }).range(1, 1);
  const run = ((data ?? []) as unknown as Array<StoredRun & { id: string }>)[0];
  if (!run) return null;
  const { data: th } = await supabaseAdmin.from("coach_themes" as never).select("theme, sentiment, count").eq("run_id", run.id).order("count", { ascending: false });
  return { ...run, themes: (th ?? []) as unknown as StoredRun["themes"] };
}

/** Fresh Google Maps run for the weekly sync (ignores the 24 h cache). Failed runs are not saved. */
export async function refreshCoaching(aiText: AiFn, budgetMs = 45000, store: CoachStore = dbStore, fetcher = fetchAndAnalyze) {
  const run = await fetcher(aiText, budgetMs);
  if (run.places_count > 0 || run.api_errors.length === 0) await store.save(run);
  return run;
}

/** Cached for 24 h: repeated COACH calls make no Google or AI calls. */
const fixedMessage = (key: "notReady" | "noRecent" | "nothingMore", lang: CoachLanguage) =>
  `${COACH_TEMPLATES[key][lang]}${lang === "wo" ? `\n${COACH_TEMPLATES.englishHint.wo}\n${COACH_TEMPLATES.machineLabel.wo}\n${COACH_TEMPLATES.machineLabel.en}` : ""}`;
export async function getCoaching(aiText: AiFn, budgetMs = 10000, store: CoachStore = dbStore, fetcher = fetchAndAnalyze, cacheOnly = false, lang: CoachLanguage = "wo") {
  const cached = await store.latest();
  if (cached && isFresh(cached.fetched_at)) return { run: cached, cached: true, messages: formatCoach(cached, lang) };
  if (cacheOnly) return { run: null, cached: false, messages: [fixedMessage("notReady", lang), null] as [string, string | null] };
  const run = await fetcher(aiText, budgetMs);
  // Do not cache a run that failed outright, so it can be retried.
  if (run.places_count > 0 || run.api_errors.length === 0) await store.save(run);
  return { run, cached: false, messages: formatCoach(run, lang) };
}

export async function coachMore(store: CoachStore = dbStore, lang: CoachLanguage = "wo") {
  const cached = await store.latest();
  if (!cached || !isFresh(cached.fetched_at)) return fixedMessage("noRecent", lang);
  return formatCoach(cached, lang)[1] ?? fixedMessage("nothingMore", lang);
}
