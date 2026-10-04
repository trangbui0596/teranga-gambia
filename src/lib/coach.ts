// Pure review-coaching logic (no I/O). Counts are computed here from per-review labels so every
// statement is traceable to "n of N reviews". Nothing here stores or returns review text.

export const THEMES = [
  "price_value", "guide_quality", "punctuality", "safety", "communication_booking",
  "food", "boat_equipment", "wildlife", "duration", "children",
] as const;
export type Theme = (typeof THEMES)[number];
export type Sentiment = "positive" | "negative";

export const THEME_LABEL: Record<Theme, string> = {
  price_value: "Price/value", guide_quality: "Guide quality", punctuality: "Punctuality",
  safety: "Safety", communication_booking: "Communication/booking", food: "Food",
  boat_equipment: "Boat/equipment", wildlife: "Wildlife", duration: "Duration", children: "Children",
};
/** Question-card topic for each theme (null = no matching card). */
export const THEME_TOPIC: Record<Theme, string | null> = {
  price_value: "price", guide_quality: null, punctuality: "meeting point", safety: "safety",
  communication_booking: "how to book", food: "food", boat_equipment: "what's included",
  wildlife: null, duration: "duration", children: "children",
};

export const MIN_REVIEWS = 10;
export const CACHE_MS = 24 * 3600 * 1000;
export const MAX_MSG = 1400;
export const SOURCE = "Source: Google Maps public reviews.";
export const AI_LABEL = "AI-generated summary of public reviews, may be wrong.";

export type ReviewLabel = { themes: Array<{ theme: string; sentiment: string }>; prices: Array<{ amount: number; currency: string }> };
export type ThemeCount = { theme: Theme; sentiment: Sentiment; count: number };
export type StoredRun = {
  place_ids: string[]; places_count: number; reviews_count: number;
  date_from: string | null; date_to: string | null;
  price_count: number; price_min: number | null; price_max: number | null; price_currency: string | null;
  actions: string[]; api_calls: number; api_errors: string[];
  themes: ThemeCount[];
};

/** Counts each (theme, sentiment) at most once per review; ignores unknown themes/sentiments. */
export function countThemes(labels: ReviewLabel[]): ThemeCount[] {
  const m = new Map<string, number>();
  for (const l of labels) {
    const seen = new Set<string>();
    for (const t of l.themes ?? []) {
      if (!(THEMES as readonly string[]).includes(t.theme)) continue;
      if (t.sentiment !== "positive" && t.sentiment !== "negative") continue;
      seen.add(`${t.theme}|${t.sentiment}`);
    }
    for (const k of seen) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => {
    const [theme, sentiment] = k.split("|") as [Theme, Sentiment];
    return { theme, sentiment, count };
  }).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

/** Keeps only price amounts whose digits literally appear in the review text (no invented prices). */
export function verifiedPrices(text: string, prices: ReviewLabel["prices"]) {
  const digits = text.replace(/[,\s.](?=\d{3}\b)/g, "");
  return (prices ?? []).filter((p) => Number.isFinite(p.amount) && p.amount > 0 && digits.includes(String(Math.round(p.amount))))
    .map((p) => ({ amount: p.amount, currency: normCurrency(p.currency) }));
}
function normCurrency(c: string) {
  const s = (c ?? "").trim().toUpperCase();
  if (/^(D|GMD|DALASI|DALASIS)$/.test(s)) return "GMD";
  if (/^(€|EUR|EURO|EUROS)$/.test(s)) return "EUR";
  if (/^(£|GBP|POUND|POUNDS)$/.test(s)) return "GBP";
  if (/^(\$|USD|DOLLAR|DOLLARS)$/.test(s)) return "USD";
  return s || "?";
}

export function priceSummary(all: Array<{ amount: number; currency: string }>) {
  if (!all.length) return { price_count: 0, price_min: null, price_max: null, price_currency: null };
  const byCur = new Map<string, number[]>();
  for (const p of all) byCur.set(p.currency, [...(byCur.get(p.currency) ?? []), p.amount]);
  const [cur, vals] = [...byCur.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  return { price_count: vals.length, price_min: Math.min(...vals), price_max: Math.max(...vals), price_currency: cur };
}

/** Deterministic coaching actions (max 5), each tied to a theme count. None when data is thin. */
export function buildActions(themes: ThemeCount[], n: number): string[] {
  if (n < MIN_REVIEWS) return [];
  const out: string[] = [];
  const neg = themes.filter((t) => t.sentiment === "negative");
  const pos = themes.filter((t) => t.sentiment === "positive");
  for (const t of neg) {
    const topic = THEME_TOPIC[t.theme];
    out.push(`${THEME_LABEL[t.theme]}: ${t.count} of ${n} reviews complain.` +
      (topic ? ` Record or improve your "${topic}" answer.` : " Talk about it with Noor."));
  }
  for (const t of pos) {
    const topic = THEME_TOPIC[t.theme];
    out.push(`${THEME_LABEL[t.theme]}: ${t.count} of ${n} reviews praise it.` +
      (topic ? ` Make sure your "${topic}" answer covers it.` : " Mention it when you greet visitors."));
  }
  return out.slice(0, 5);
}

export function isFresh(fetchedAt: string | Date, now = Date.now()) {
  return now - new Date(fetchedAt).getTime() < CACHE_MS;
}

/** Builds the storable run from derived values only (explicit whitelist: no review text, no authors). */
export function toStoredRun(x: StoredRun): StoredRun {
  return {
    place_ids: x.place_ids.map(String), places_count: x.places_count, reviews_count: x.reviews_count,
    date_from: x.date_from, date_to: x.date_to, price_count: x.price_count, price_min: x.price_min,
    price_max: x.price_max, price_currency: x.price_currency, actions: x.actions.slice(0, 5),
    api_calls: x.api_calls, api_errors: x.api_errors.map((e) => e.slice(0, 200)).slice(0, 10),
    themes: x.themes.map((t) => ({ theme: t.theme, sentiment: t.sentiment, count: t.count })),
  };
}

/** Returns [main message, optional "COACH MORE" message], each under MAX_MSG chars. */
export function formatCoach(r: StoredRun): [string, string | null] {
  const N = r.reviews_count, M = r.places_count;
  if (N === 0) {
    return [`Teranga coaching: Google Maps returned no reviews (${M} places found). Nothing to coach yet.\n${SOURCE}`, null];
  }
  const range = r.date_from && r.date_to ? `${r.date_from} to ${r.date_to}` : "unknown dates";
  const head = `Teranga coaching (${AI_LABEL})\n${M} places, ${N} reviews analyzed, ${range}. ${SOURCE}`;
  const thin = N < MIN_REVIEWS ? `\nNot enough real review data to coach reliably (${N} reviews from ${M} places).` : "";
  const top = r.themes.slice(0, 3).map((t, i) => `${i + 1}. ${THEME_LABEL[t.theme]} (${t.sentiment}): ${t.count} of ${N} reviews`);
  const themes = top.length ? `\nTop themes:\n${top.join("\n")}` : "\nNo tour themes found.";
  const price = r.price_count
    ? `\nPrices mentioned: ${r.price_count} times, ${r.price_min}${r.price_min !== r.price_max ? `-${r.price_max}` : ""} ${r.price_currency}. Ask a person: no automatic price changes.`
    : "";
  const acts = r.actions.slice(0, 3).map((a, i) => `${i + 1}. ${a}`);
  const actions = acts.length ? `\nActions:\n${acts.join("\n")}` : "";
  const limits = `\nLimits: Google shows only up to 5 reviews per place, so this sample is not complete.`;
  const rest = [
    ...r.themes.slice(3).map((t) => `${THEME_LABEL[t.theme]} (${t.sentiment}): ${t.count} of ${N} reviews`),
    ...r.actions.slice(3).map((a, i) => `Action ${i + 4}. ${a}`),
  ];
  const moreHint = rest.length ? "\nSend COACH MORE for the rest." : "";
  let main = head + thin + themes + price + actions + limits + moreHint;
  let overflow: string[] = [];
  if (main.length > MAX_MSG) { // drop actions to the second message first
    overflow = acts;
    main = head + thin + themes + price + limits + "\nSend COACH MORE for the rest.";
  }
  const moreBody = [...overflow, ...rest];
  const more = moreBody.length
    ? `Teranga coaching, more (${AI_LABEL})\n${moreBody.join("\n")}\n${SOURCE}`.slice(0, MAX_MSG)
    : null;
  return [main.slice(0, MAX_MSG), more];
}
