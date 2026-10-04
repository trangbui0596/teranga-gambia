// "Numbers heard" for the champion (pure). Digits are listed exactly as before; Wolof number words
// (tolerant ASR spellings, accents ignored) are listed as heard, with a value only when it is certain.
// Never invents a number: anything unclear says "please confirm".

const DIGITS = /\d+(?:[.,:]\d+)*(?:\s*(?:dalasi|gmd|euro|eur|€|d\b|h\b|am\b|pm\b))?/gi;

type Kind =
  | { t: "unit"; v: number }
  | { t: "five" }
  | { t: "tens"; v: number }
  | { t: "ten" }
  | { t: "hundred" }
  | { t: "thousand" }
  | { t: "join" };

const WORDS: Record<string, Kind> = {
  benn: { t: "unit", v: 1 },
  ben: { t: "unit", v: 1 },
  bene: { t: "unit", v: 1 },
  naar: { t: "unit", v: 2 },
  niaar: { t: "unit", v: 2 },
  nar: { t: "unit", v: 2 },
  naari: { t: "unit", v: 2 },
  nett: { t: "unit", v: 3 },
  niet: { t: "unit", v: 3 },
  net: { t: "unit", v: 3 },
  netti: { t: "unit", v: 3 },
  nent: { t: "unit", v: 4 },
  nient: { t: "unit", v: 4 },
  nenti: { t: "unit", v: 4 },
  juroom: { t: "five" },
  jurom: { t: "five" },
  juroomi: { t: "five" },
  juron: { t: "five" },
  jura: { t: "five" },
  jurum: { t: "five" },
  fukk: { t: "ten" },
  fuk: { t: "ten" },
  fanweer: { t: "tens", v: 30 },
  fanwer: { t: "tens", v: 30 },
  teemeer: { t: "hundred" },
  temer: { t: "hundred" },
  temeer: { t: "hundred" },
  teemer: { t: "hundred" },
  teme: { t: "hundred" },
  junni: { t: "thousand" },
  juni: { t: "thousand" },
  yuni: { t: "thousand" },
  yunni: { t: "thousand" },
  juuni: { t: "thousand" },
  ak: { t: "join" },
  ag: { t: "join" },
};
const CURRENCY = new Set([
  "dalasi",
  "dalasis",
  "dalassi",
  "dalasii",
  "dalaasi",
  "daala",
  "daalasi",
  "dalas",
  "d",
  "gmd",
]);
const TIME = new Set(["waxtu"]);

export const norm = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Splits glued joiners such as "juniak" -> "juni" + "ak". */
function split(orig: string): Array<{ orig: string; n: string }> {
  const n = norm(orig);
  const m = /^(.+?)(ak|ag)$/.exec(n);
  if (!WORDS[n] && m && WORDS[m[1]!] && WORDS[m[1]!]!.t !== "join") {
    const cut = orig.length - 2;
    return [
      { orig: orig.slice(0, cut), n: m[1]! },
      { orig: orig.slice(cut), n: m[2]! },
    ];
  }
  return [{ orig, n }];
}

/** Value of one run of Wolof number words, or null when not certain. */
export function wolofValue(kinds: Kind[]): number | null {
  let total = 0,
    hund = 0,
    small = 0;
  let prev: Kind | null = null;
  let any = false;
  for (const k of kinds) {
    if (k.t === "join") {
      prev = k;
      continue;
    }
    any = true;
    if (k.t === "unit") {
      // A unit may follow juroom (5+u) or a joiner/multiplier; two bare units in a row are unclear.
      if (prev && prev.t === "unit") return null;
      small += k.v;
    } else if (k.t === "five") {
      if (prev && (prev.t === "unit" || prev.t === "five")) return null;
      small += 5;
    } else if (k.t === "tens") {
      if (small) return null;
      small += k.v;
    } else if (k.t === "ten") {
      if (small >= 10) return null;
      small = (small || 1) * 10;
    } else if (k.t === "hundred") {
      if (hund && !small) return null;
      hund += (small || 1) * 100;
      small = 0;
    } else if (k.t === "thousand") {
      if (total && !(hund + small)) return null;
      total += (hund + small || 1) * 1000;
      hund = 0;
      small = 0;
    }
    prev = k;
  }
  return any ? total + hund + small : null;
}

export function numbersHeard(text: string | null): string {
  if (!text) return "none";
  const digits = text.match(DIGITS);
  const digitPart = digits && digits.length ? [...new Set(digits.map((s) => s.trim()))] : [];

  const tokens = (text.match(/[\p{L}\p{M}']+|\d+/gu) ?? []).flatMap(split);
  const runs: string[] = [];
  let cur: Array<{ orig: string; k: Kind }> = [];
  let unclear = false;
  // A word we do not know directly before "ak"/"ag" + number words ("fuuni ak juroom temer") may be a missing
  // thousand/hundred: never report the shorter number as if it were complete.
  let lastUnknown: string | null = null;
  let lead: string | null = null;
  const flush = () => {
    while (cur.length && cur[cur.length - 1]!.k.t === "join") cur.pop();
    if (cur.length) {
      const words = cur.map((c) => c.orig).join(" ");
      const v = wolofValue(cur.map((c) => c.k));
      if (lead) {
        unclear = true;
        runs.push(
          `${lead} ak ${words} (word before "ak" not understood, number may be incomplete: please confirm)`,
        );
      } else {
        if (v === null) unclear = true;
        runs.push(v === null ? `${words} (please confirm)` : `${words} (about ${v})`);
      }
    }
    cur = [];
    lead = null;
  };
  let currency = false,
    time = false;
  for (const t of tokens) {
    const k = WORDS[t.n];
    if (k && k.t === "join" && !cur.length && lastUnknown) {
      lead = lastUnknown;
      continue;
    }
    if (k && !(k.t === "join" && !cur.length)) {
      cur.push({ orig: t.orig, k });
      lastUnknown = null;
      continue;
    }
    flush();
    lastUnknown = /^\d+$/.test(t.orig) ? null : t.orig;
    if (CURRENCY.has(t.n) && !(t.n === "d" && !/\bD\b/.test(t.orig))) currency = true;
    if (TIME.has(t.n)) time = true;
  }
  flush();

  // Digits only (no Wolof number words): unchanged output.
  if (!runs.length) {
    if (digitPart.length) return digitPart.join(", ");
    if (currency) return "Price words heard but number unclear: please confirm";
    if (time) return "waxtu (time word): please confirm";
    return "none found";
  }
  const parts = [...digitPart, ...runs];
  let out = parts.join(", ");
  if (currency && !digitPart.some((d) => /[a-z€]/i.test(d))) out += " + dalasi";
  if (time) out += " + waxtu (time word)";
  if (unclear) out += ": please confirm";
  return out;
}

/** Prices and counts the Wolof transcript states with certainty (digits are not included: the translator already keeps those). */
export function certainValues(text: string | null): number[] {
  if (!text) return [];
  const out = numbersHeard(text);
  if (/please confirm/.test(out)) return [];
  return [...out.matchAll(/\(about (\d+)\)/g)].map((m) => Number(m[1])).filter((n) => n >= 100);
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0 || !parts.length) parts.push(ONES[n]!);
  return parts.join(" ");
}
export function numberWords(n: number): string {
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000),
    rest = n % 1000;
  return `${below1000(th)} thousand${rest ? " " + below1000(rest) : ""}`;
}

/** True when the English text states the number, as digits (1500 / 1,500) or words (one thousand five hundred / fifteen hundred). */
export function mentionsNumber(english: string, n: number): boolean {
  const t = english
    .toLowerCase()
    .replace(/[-,]/g, (c) => (c === "-" ? " " : ""))
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ");
  const forms = [String(n), numberWords(n).replace(/-/g, " ")];
  if (n >= 1100 && n < 10000 && n % 100 === 0)
    forms.push(`${below1000(n / 100).replace(/-/g, " ")} hundred`);
  return forms.some((f) => t.includes(f));
}
