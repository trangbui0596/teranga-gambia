import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_LIMIT,
  TOPIC_CARD,
  buildDescription,
  buildListingPack,
  firstSentence,
  formatListingPack,
  helperFields,
  listingCopyText,
  nextCards,
} from "@/lib/listing";

const A = (text: string, sample = false) => ({ text, sample });

describe("Google listing pack", () => {
  it("with nothing approved: nothing is ready, only defaults to check, and helper-only fields are listed", () => {
    const p = buildListingPack({});
    expect(p.ready).toBe(0);
    expect(p.approved).toBe(0);
    expect(p.description).toBe("");
    expect(listingCopyText(p)).toBeNull();
    expect(p.fields.find((f) => f.key === "category")?.state).toBe("check");
    expect(p.fields.find((f) => f.key === "name")?.value).toBeNull(); // never invented
    expect(helperFields(p).map((f) => f.key)).toEqual(["name", "whatsapp", "hours", "phone", "photos"]);
    expect(nextCards(p).length).toBeGreaterThan(0);
  });

  it("builds from approved answers only, word for word, and never invents contact details", () => {
    const p = buildListingPack({
      price: A("The tour costs 1500 dalasi per adult. Children under five are free."),
      "meeting point": A("We meet at the Kololi beach gate."),
      "whats included": A("Boat, guide and lunch."),
    });
    expect(p.description).toBe(
      "Included: Boat, guide and lunch. Meeting point: We meet at the Kololi beach gate. Price: The tour costs 1500 dalasi per adult. Children under five are free.",
    );
    expect(p.approved).toBe(3);
    expect(p.fields.find((f) => f.key === "meeting")).toMatchObject({
      state: "ready",
      value: "We meet at the Kololi beach gate.",
    });
    expect(p.fields.find((f) => f.key === "description")?.state).toBe("ready");
    expect(p.fields.find((f) => f.key === "phone")?.value).toBeNull();
    expect(p.fields.find((f) => f.key === "hours")?.state).toBe("needs_input");
    expect(p.unapprovedTopics).not.toContain("price");
  });

  it("suggests the cards that fill empty fields first, in card order", () => {
    const p = buildListingPack({ price: A("1500 dalasi.") });
    const cards = nextCards(p);
    expect(cards).toEqual([...cards].sort((a, b) => a - b));
    expect(cards.length).toBeLessThanOrEqual(4);
    expect(cards).toContain(TOPIC_CARD["meeting point"]);
    expect(cards).toContain(TOPIC_CARD["how to book"]);
    expect(cards).not.toContain(TOPIC_CARD["price"]);
  });

  it("keeps the description within Google's limit and uses whole entries only", () => {
    const long = (n: string) => A(`${n} ${"word ".repeat(30)}end.`);
    const d = buildDescription(
      Object.fromEntries(Object.keys(TOPIC_CARD).map((t) => [t, long(t)])),
    );
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(d.endsWith("end.") || d.endsWith("...")).toBe(true);
  });

  it("shortens one very long sentence at a word boundary and keeps short answers whole", () => {
    expect(firstSentence("Short one. Another one.")).toBe("Short one. Another one.");
    const s = firstSentence(`${"word ".repeat(80)}done.`);
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith("...")).toBe(true);
  });

  it("the household champion's WhatsApp message is Wolof first, says nothing is sent to Google, and flags sample data", () => {
    const text = formatListingPack(buildListingPack({ price: A("1500 dalasi per adult.", true) }));
    expect(text).toContain("Sa listing ci Google");
    expect(text).toContain("business.google.com");
    expect(text).toContain("Teranga sends nothing to Google");
    expect(text).toContain("Built partly from Sample answers");
    expect(text).toContain("unverified");
    expect(text).toContain("Tontu yi nangu nañu: 1 ci 10");
  });
});

describe("WhatsApp link in the listing", () => {
  it("builds a wa.me link from the visitor-question line and asks for it when missing", async () => {
    const { whatsappLink } = await import("@/lib/listing");
    expect(whatsappLink("+1 (415) 523-8886")).toBe("https://wa.me/14155238886");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(undefined)).toBeNull();
    expect(buildListingPack({}, { whatsapp: "+14155238886" }).fields.find((f) => f.key === "whatsapp")).toMatchObject({ state: "check", value: "https://wa.me/14155238886" });
    expect(buildListingPack({}).fields.find((f) => f.key === "whatsapp")?.state).toBe("needs_input");
  });
});
