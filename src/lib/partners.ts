// Pure helpers for phase 2E (scripted partner recommendation) and 2F (draft listing). Both are SIMULATED demos.

export type Fit = "nature" | "culture" | "food";
export const FIT_BY_CHOICE: Record<string, Fit> = { "1": "nature", "2": "culture", "3": "food" };

export const MORE_ASK =
  "Do you prefer nature, culture or food? Reply 1, 2 or 3 and YES to allow us to suggest a partner (opt-in). Example: 1 YES. (Simulated)";

export type Partner = { id: string; name: string; tour_type: string; fit: string; language_support: string[] };

/** Round-robin: among partners that fit, the one with the fewest ledger entries this month; ties by name. */
export function pickPartner(partners: Partner[], countsThisMonth: Record<string, number>, fit: Fit): Partner | null {
  const fitting = partners.filter((p) => p.fit === fit);
  if (!fitting.length) return null;
  return [...fitting].sort((a, b) => (countsThisMonth[a.id] ?? 0) - (countsThisMonth[b.id] ?? 0) || a.name.localeCompare(b.name))[0]!;
}

export function suggestionText(p: Partner | null): string {
  if (!p) return "Simulated: no partner fits that choice yet. Nothing was shared.";
  return [
    `Suggestion (Simulated partner): ${p.name}, ${p.tour_type}. Languages: ${p.language_support.map((l) => l.toUpperCase()).join(", ")}.`,
    "No payment involved. Your number is not shared with anyone.",
    "Reply CONNECT if you want Noor or the champion to pass on the contact.",
  ].join("\n");
}

export type ApprovedByTopic = Record<string, string | undefined>;
const NI = "needs input";

/** Draft listing from APPROVED answers only. Never invents: missing fields read "needs input". */
export function buildListing(a: ApprovedByTopic): string {
  const f = (t: string) => a[t]?.trim() || NI;
  return [
    "DRAFT, Simulated: not published to Google. A person must submit and verify it.",
    "",
    "Business name: [Noor's tour name]",
    "Category: Tour operator",
    `Short description: ${NI}`,
    `Services / what's included: ${f("whats included")}`,
    `Meeting point: ${f("meeting point")}`,
    `Duration: ${f("duration")}`,
    `Price range: ${f("price")}`,
    "Languages offered: English, German, Dutch (machine-translated)",
    `How to book: ${f("how to book")}`,
    `Hours: ${NI}`,
    "",
    "To claim for real: the owner signs in at business.google.com, adds or claims the business, and verifies it",
    "(Google chooses the method: phone, SMS, email, video or postcard). Nothing is sent to Google from here.",
  ].join("\n");
}

export function ledgerText(rows: Array<{ name: string; received: number }>, given: number): string {
  return [
    "LEDGER (Simulated, this month, no money involved)",
    `Given by Noor: ${given}`,
    ...rows.map((r, i) => `${i + 1}. ${r.name}: received ${r.received}`),
  ].join("\n");
}
