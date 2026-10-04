// Every statistic on the home page lives here, with its World Bank indicator code, year and link.
// Nothing on the page is estimated or invented: values were read from the World Bank API (WDI, country GMB)
// on 2026-10-04, and `node scripts/verify-evidence.mjs` re-checks them against the live API.
// Keep this file free of imports so the script can load it directly.

export const RETRIEVED = "2026-10-04";

export type EvidenceKind = "usd_millions" | "percent" | "count" | "per100";
export type Evidence = {
  id: string;
  /** World Bank WDI indicator code. */
  indicator: string;
  year: number;
  raw: number;
  kind: EvidenceKind;
  label: string;
  note?: string;
};

export const EVIDENCE: Evidence[] = [
  {
    id: "receipts",
    indicator: "ST.INT.RCPT.CD",
    year: 2019,
    raw: 157000000,
    kind: "usd_millions",
    label: "earned from international tourism",
  },
  {
    id: "exportShare",
    indicator: "ST.INT.RCPT.XP.ZS",
    year: 2019,
    raw: 43.5859283990599,
    kind: "percent",
    label: "of all exports came from tourism",
  },
  {
    id: "arrivals",
    indicator: "ST.INT.ARVL",
    year: 2019,
    raw: 620000,
    kind: "count",
    label: "international visitor arrivals",
  },
  {
    id: "online",
    indicator: "IT.NET.USER.ZS",
    year: 2024,
    raw: 49.49430084,
    kind: "percent",
    label: "of people use the Internet",
  },
  {
    id: "mobile",
    indicator: "IT.CEL.SETS.P2",
    year: 2024,
    raw: 126.243773523653,
    kind: "per100",
    label: "mobile subscriptions per 100 people",
    note: "SIM subscriptions, not unique users",
  },
  {
    id: "selfEmployed",
    indicator: "SL.EMP.SELF.ZS",
    year: 2025,
    raw: 68.6086050801459,
    kind: "percent",
    label: "of employed people are self-employed",
    note: "ILO modeled estimate",
  },
  {
    id: "receipts2020",
    indicator: "ST.INT.RCPT.CD",
    year: 2020,
    raw: 53000000,
    kind: "usd_millions",
    label: "earned from international tourism in the COVID year",
  },
  {
    id: "arrivals2020",
    indicator: "ST.INT.ARVL",
    year: 2020,
    raw: 246000,
    kind: "count",
    label: "international visitor arrivals in the COVID year",
  },
];

export const INDICATOR_NAMES: Record<string, string> = {
  "ST.INT.RCPT.CD": "International tourism, receipts (current US$)",
  "ST.INT.RCPT.XP.ZS": "International tourism, receipts (% of total exports)",
  "ST.INT.ARVL": "International tourism, number of arrivals",
  "IT.NET.USER.ZS": "Individuals using the Internet (% of population)",
  "IT.CEL.SETS.P2": "Mobile cellular subscriptions (per 100 people)",
  "SL.EMP.SELF.ZS": "Self-employed, total (% of total employment) (modeled ILO estimate)",
};

export const wdiUrl = (indicator: string) =>
  `https://data.worldbank.org/indicator/${indicator}?locations=GM`;
export const wdiApiUrl = (indicator: string, year: number) =>
  `https://api.worldbank.org/v2/country/GMB/indicator/${indicator}?format=json&date=${year}`;

export function formatValue(e: Pick<Evidence, "kind" | "raw">): string {
  switch (e.kind) {
    case "usd_millions":
      return `US$${Math.round(e.raw / 1e6)} million`;
    case "percent":
      return `${e.raw.toFixed(1)}%`;
    case "count":
      return Math.round(e.raw).toLocaleString("en-US");
    case "per100":
      return String(Math.round(e.raw));
  }
}

export function evidence(id: string): Evidence & { value: string; href: string } {
  const e = EVIDENCE.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown statistic: ${id}`);
  return { ...e, value: formatValue(e), href: wdiUrl(e.indicator) };
}
