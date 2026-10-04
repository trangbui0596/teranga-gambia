import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "@/components/landing/Landing";
import { EVIDENCE, formatValue, wdiUrl } from "@/lib/evidence";
import { SCREENS, TABS, VIDEO_URL, type TabId } from "@/lib/landing-content";

const html = (tab: TabId) => renderToStaticMarkup(<Landing initialTab={tab} />);
const doc = (tab: TabId) => {
  const d = document.implementation.createHTMLDocument("t");
  d.body.innerHTML = html(tab);
  return d;
};

/** Visible text with a space between neighbouring elements (textContent would glue "2024" and "49.5%" together). */
const textOf = (d: Document) => {
  const out: string[] = [];
  const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n.textContent ?? "");
  return out.join(" ");
};

describe("home page statistics are sourced, never invented", () => {
  it("every statistic has a World Bank indicator, a year, a number and a data-page link", () => {
    for (const e of EVIDENCE) {
      expect(e.indicator).toMatch(/^[A-Z]{2}\.[A-Z]{3}\.[A-Z0-9.]+$/);
      expect(Number.isInteger(e.year) && e.year >= 2015 && e.year <= 2025).toBe(true);
      expect(Number.isFinite(e.raw)).toBe(true);
      expect(wdiUrl(e.indicator)).toBe(
        `https://data.worldbank.org/indicator/${e.indicator}?locations=GM`,
      );
    }
  });

  it("every statistic appears on the page with a link to its data page", () => {
    for (const e of EVIDENCE) {
      const found = TABS.some((tab) => {
        const d = doc(tab.id);
        return (
          d.querySelector(`a[href="${wdiUrl(e.indicator)}"]`) !== null &&
          textOf(d).includes(formatValue(e))
        );
      });
      expect(found, `${e.id} is shown with a link`).toBe(true);
    }
  });

  it("no percentage, dollar amount or thousands figure appears unless it is a sourced statistic", () => {
    const allowed = new Set(EVIDENCE.map(formatValue));
    const pattern =
      /US\$\s?\d[\d.,]*(?:\s?(?:million|billion))?|\d[\d.,]*\s?%|\b\d{1,3}(?:,\d{3})+\b/g;
    for (const tab of TABS) {
      const text = textOf(doc(tab.id));
      for (const token of text.match(pattern) ?? []) {
        expect(
          allowed.has(token.trim()),
          `"${token}" on tab ${tab.id} is not in src/lib/evidence.ts`,
        ).toBe(true);
      }
    }
  });

  it("every place a sourced number is shown sits in a link or next to its source link", () => {
    const values = EVIDENCE.map(formatValue);
    for (const tab of TABS) {
      const d = doc(tab.id);
      const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!values.some((v) => node!.textContent?.includes(v))) continue;
        const el = node.parentElement!;
        const ok =
          el.closest("a") ||
          el.closest("li")?.querySelector('a[href^="https://data.worldbank.org/indicator/"]');
        expect(ok, `"${node.textContent}" on tab ${tab.id} has no source link`).toBeTruthy();
      }
    }
  });

  it("external links open safely", () => {
    for (const tab of TABS) {
      for (const a of doc(tab.id).querySelectorAll('a[href^="http"]')) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toContain("noopener");
      }
    }
  });
});

describe("home page structure", () => {
  it("shows the problem first, before the tabs", () => {
    const h = html("sms");
    expect(h.indexOf("The problem")).toBeLessThan(h.indexOf("Explore Teranga"));
    expect(h).toContain("Teranga backend is running");
  });

  it("every tab renders its panel", () => {
    for (const tab of TABS) expect(doc(tab.id).querySelector(`#panel-${tab.id}`)).not.toBeNull();
  });

  it("Screens tab and demo button appear only once there is something to show", () => {
    expect(TABS.some((t) => t.id === "screens")).toBe(SCREENS.length > 0);
    expect(html("sms").includes("Watch the demo")).toBe(VIDEO_URL.length > 0);
  });
});

import { COACHING_PROMISE, DATA_ANALYSED, REAL_LIVE } from "@/lib/landing-content";
import tuning from "./fixtures/gambia_tour_questions.json";
import holdout from "./fixtures/gambia_tour_questions_holdout.json";
describe("the data we say we analysed", () => {
  it("states the coaching promise in the live list and in the highlighted panel", () => {
    expect(REAL_LIVE).toContain(COACHING_PROMISE);
    expect(COACHING_PROMISE).toBe("Coaching comes from real public Google Maps reviews. Nothing raw is stored.");
  });
  it("question and sentence counts match the files they come from", () => {
    const q = DATA_ANALYSED.find((d) => d.label.includes("visitor questions"))!;
    expect(Number(q.figure)).toBe((tuning as unknown[]).length + (holdout as unknown[]).length);
    expect(q.detail).toContain(`${(tuning as unknown[]).length} tuned`);
    expect(q.detail).toContain(`${(holdout as unknown[]).length} were kept back`);
    expect(DATA_ANALYSED.find((d) => d.label.includes("Wolof"))!.figure).toBe("54");
  });
  it("shows the promise and every figure on the What's real tab", () => {
    const h = html("real");
    expect(h).toContain("Coaching comes from real public Google Maps reviews. Nothing raw is stored.");
    for (const d of DATA_ANALYSED) { expect(h).toContain(`>${d.figure}<`); expect(h).toContain(d.detail.slice(0, 30).replace(/’/g, "&#x27;")); }
  });
});
