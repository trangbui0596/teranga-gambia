// Re-checks every statistic on the home page against the live World Bank API.
// Run: node scripts/verify-evidence.mjs   (Node 22.18+ or newer loads the .ts file directly)
// Exit code 1 if any value differs, so a changed or revised statistic never goes unnoticed.
import { EVIDENCE, wdiApiUrl, formatValue } from "../src/lib/evidence.ts";

let bad = 0;
for (const e of EVIDENCE) {
  let live = null;
  try {
    const res = await fetch(wdiApiUrl(e.indicator, e.year));
    const json = await res.json();
    live = json?.[1]?.[0]?.value ?? null;
  } catch (err) {
    console.error(`  could not fetch ${e.indicator} ${e.year}: ${err.message}`);
  }
  const ok = typeof live === "number" && Math.abs(live - e.raw) <= Math.abs(e.raw) * 1e-6;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"} ${e.id.padEnd(13)} ${e.indicator.padEnd(18)} ${e.year}  page: ${formatValue(e).padEnd(16)} live: ${live}`);
}
console.log(bad ? `\n${bad} statistic(s) differ from the World Bank API. Fix src/lib/evidence.ts.` : "\nAll statistics match the World Bank API.");
process.exit(bad ? 1 : 0);
