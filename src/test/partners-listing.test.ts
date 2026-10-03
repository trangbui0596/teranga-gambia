// TEST DATA ONLY: fictional sample partners and sample answers.
import { describe, expect, it } from "vitest";
import { pickPartner, suggestionText, buildListing, ledgerText, MORE_ASK, type Partner } from "@/lib/partners";

const P: Partner[] = [
  { id: "a", name: "Sunbird Trails (fictional sample)", tour_type: "birdwatching", fit: "nature", language_support: ["en"] },
  { id: "b", name: "Mangrove Drift (fictional sample)", tour_type: "river cruise", fit: "nature", language_support: ["nl"] },
  { id: "c", name: "Kora Village (fictional sample)", tour_type: "village culture", fit: "culture", language_support: ["de"] },
];

describe("2E partner recommendation", () => {
  it("asks for opt-in", () => expect(MORE_ASK).toMatch(/YES.*opt-in/));
  it("round-robin picks the fit with fewest entries", () => {
    expect(pickPartner(P, {}, "nature")!.id).toBe("b"); // tie -> name order (Mangrove < Sunbird)
    expect(pickPartner(P, { b: 2, a: 1 }, "nature")!.id).toBe("a");
    expect(pickPartner(P, {}, "culture")!.id).toBe("c");
    expect(pickPartner(P, {}, "food")).toBeNull();
  });
  it("labels and no money", () => {
    const t = suggestionText(P[0]!);
    expect(t).toMatch(/\(Simulated partner\)/);
    expect(t).toMatch(/No payment involved/);
    expect(t).toMatch(/CONNECT/);
    expect(t).not.toMatch(/\+?\d{7,}/);
    expect(ledgerText([{ name: "x", received: 2 }], 2)).not.toMatch(/dalasi|€|euro|\$|GMD/i);
  });
});

describe("2F draft listing", () => {
  it("uses only given answers and marks missing as needs input", () => {
    const t = buildListing({ price: "1,500 dalasi per adult" });
    expect(t).toMatch(/^DRAFT, Simulated: not published to Google/);
    expect(t).toMatch(/Price range: 1,500 dalasi per adult/);
    expect(t).toMatch(/Meeting point: needs input/);
    expect(t).toMatch(/Hours: needs input/);
    expect(t).toMatch(/\[Noor's tour name\]/);
  });
});
