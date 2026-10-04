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

  it("the hero links every statistic to its data page", () => {
    const d = doc("how");
    for (const e of EVIDENCE) {
      const links = [...d.querySelectorAll(`a[href="${wdiUrl(e.indicator)}"]`)];
      expect(links.length, `${e.id} has a link`).toBeGreaterThan(0);
      expect(textOf(d)).toContain(formatValue(e));
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
    const d = doc("how");
    const values = EVIDENCE.map(formatValue);
    const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!values.some((v) => node!.textContent?.includes(v))) continue;
      const el = node.parentElement!;
      const ok =
        el.closest("a") ||
        el.closest("li")?.querySelector('a[href^="https://data.worldbank.org/indicator/"]');
      expect(ok, `"${node.textContent}" has no source link`).toBeTruthy();
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
    const h = html("how");
    expect(h.indexOf("The problem")).toBeLessThan(h.indexOf("Explore Teranga"));
    expect(h).toContain("Teranga backend is running");
  });

  it("every tab renders its panel", () => {
    for (const tab of TABS) expect(doc(tab.id).querySelector(`#panel-${tab.id}`)).not.toBeNull();
  });

  it("Screens tab and demo button appear only once there is something to show", () => {
    expect(TABS.some((t) => t.id === "screens")).toBe(SCREENS.length > 0);
    expect(html("how").includes("Watch the demo")).toBe(VIDEO_URL.length > 0);
  });
});
