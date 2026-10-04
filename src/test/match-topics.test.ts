import { describe, it, expect, vi } from "vitest";
import {
  matchQuestion, topicHitsDetailed, CONFIDENCE_THRESHOLD, KEYWORDS, GENERIC, STANDS_ALONE, OUT_OF_SCOPE, STAY_WORDS, CONTEXT_WORDS, tokenize,
} from "@/lib/match";
import { gateApproval } from "@/lib/approval";

const TOPICS = ["price", "meeting point", "duration", "what to bring", "children", "food", "safety", "whats included", "how to book", "cancellation"];
const mk = (topic: string, is_sample: boolean, id = `${is_sample ? "s" : "r"}-${topic}`) => ({ id, is_sample, recordings: { questions: { topic } } });
const samples = TOPICS.map((t) => mk(t, true));

describe("matcher topics", () => {
  it.each([
    ["How much does it cost?", "price"], ["Wie viel kostet die Tour?", "price"], ["Hoeveel kost het?", "price"],
    ["Where do we meet?", "meeting point"], ["Can kids come?", "children"],
    ["How long is the tour?", "duration"], ["Can I cancel and get a refund?", "cancellation"], ["Is it safe?", "safety"],
  ])("%s -> %s", (q, topic) => {
    const r = matchQuestion(q, samples);
    expect(r.answer?.recordings.questions.topic).toBe(topic);
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("prefers real over sample for the same topic (no tie)", () => {
    const r = matchQuestion("How much does it cost?", [mk("price", true), mk("price", false), mk("children", true)]);
    expect(r.answer?.id).toBe("r-price");
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("uses sample when no real answer exists", () => {
    expect(matchQuestion("How much does it cost?", samples).answer?.id).toBe("s-price");
  });
  it("still says not sure for unrelated text", () => {
    expect(matchQuestion("Tell me a joke", samples).answer).toBeNull();
  });
});

describe("approval gate", () => {
  it("refuses while untranslated after one finish attempt", async () => {
    const finish = vi.fn(async () => {});
    const ok = await gateApproval("a", { load: async () => ({ stage: "transcribed", english: null, german: null, dutch: null }), finish }, 10);
    expect(ok).toBe(false); expect(finish).toHaveBeenCalledTimes(1);
  });
  it("approves after finish completes translation", async () => {
    let row = { stage: "transcribed", english: null as string | null, german: null as string | null, dutch: null as string | null };
    const ok = await gateApproval("a", { load: async () => row, finish: async () => { row = { stage: "checked", english: "e", german: "d", dutch: "n" }; } });
    expect(ok).toBe(true);
  });
  it("skips finish when already processed", async () => {
    const finish = vi.fn(async () => {});
    expect(await gateApproval("a", { load: async () => ({ stage: "checked", english: "e", german: "d", dutch: "n" }), finish })).toBe(true);
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("tie-break and pickup wording", () => {
  it.each([
    ["Can we bring our kids?", "children"],
    ["Can you pick us up from our hotel?", "meeting point"],
    ["What should I bring with me?", "what to bring"],
    ["Is it ok to bring a baby?", "children"],
  ])("%s -> %s", (q, topic) => {
    const r = matchQuestion(q, samples);
    expect(r.answer?.recordings.questions.topic).toBe(topic);
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
  it("still unsure when two topics tie on non-generic words", () => {
    // 'safe' (safety) and 'lunch' (food) both strong, one each: never guess
    expect(matchQuestion("Is lunch safe?", samples).answer).toBeNull();
  });
});

// ---------- Precision rules (never guess). General phrasings, not copies of the real-question fixture. ----------
const topicOf = (q: string) => matchQuestion(q, samples).answer?.recordings.questions.topic ?? null;

describe("R2 weak words never answer alone", () => {
  it.each([
    "Do I need a visa?", "Do you need any special papers?", "When is the best time to visit?", "What time is sunset?",
    "Where can I buy souvenirs?", "How can I pay?", "Can I bring my laptop?", "Is it ok to drink alcohol in public?",
    "Do I need to be fit?", "Is it a full day tour?",
  ])("%s -> not sure", (q) => {
    expect(topicOf(q)).toBeNull();
  });
  it.each([
    ["When does the tour start?", "meeting point"], ["What time does the boat trip start?", "meeting point"], ["Is there a minimum age?", "children"],
    ["What does the tour include?", "whats included"], ["What is the booking procedure?", "how to book"],
    ["What should I bring?", "what to bring"], ["What do I need to bring?", "what to bring"], ["Do I need special shoes?", "what to bring"],
  ])("allow-listed or specific: %s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
  it("a weak word still supports a strong one", () => {
    expect(topicHitsDetailed("Where do we meet?", "meeting point")).toEqual({ hits: 2, strong: 1 });
  });
});

describe("R1 one word = one vote", () => {
  it("child + children, include + included each count once", () => {
    expect(topicHitsDetailed("Are children welcome?", "children")).toEqual({ hits: 1, strong: 1 });
    expect(topicHitsDetailed("What is included?", "whats included")).toEqual({ hits: 1, strong: 1 });
  });
  it("so two topics with one word each stay unsure", () => {
    expect(topicOf("Is it safe for children?")).toBeNull();
    expect(topicOf("Is breakfast included?")).toBeNull();
  });
});

describe("R3 the longest phrase wins", () => {
  it.each([
    ["How much time does the tour take?", "duration"], ["Wie viel Zeit brauche ich?", "duration"], ["Wat is de duur van de tour?", "duration"],
    ["Is de tour duur?", "price"], ["Can I change my booking?", "cancellation"], ["Can I cancel my booking?", "cancellation"],
    ["Is there a cancellation fee?", "cancellation"], ["Can I get my money back?", "cancellation"],
    ["What is included in the price?", "whats included"], ["What does the price include?", "whats included"],
    ["How much water should I bring?", "what to bring"], ["How much is the tour?", "price"],
  ])("%s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
  it("my booking is an existing booking, not a how-to-book question", () => {
    expect(topicOf("Is my booking confirmed?")).toBeNull();
    expect(topicOf("How do I make a booking?")).toBe("how to book");
  });
});

describe("R4 words that mean something else in another language", () => {
  it.each([
    "What kind of boat do you use?", "That is very kind of you", "Kind regards", "I would like to alter the date",
    "Hat die Tour einen Guide?", "Is the tour kind to nature?",
  ])("%s -> not sure", (q) => {
    expect(topicOf(q)).toBeNull();
  });
  it.each([
    ["Ist die Tour für mein Kind geeignet?", "children"], ["Is de tour geschikt voor mijn kind?", "children"], ["Können Kinder mitkommen?", "children"],
    ["Zijn kinderen welkom?", "children"], ["Ab welchem Alter dürfen Kinder mit?", "children"], ["Should I bring a hat?", "what to bring"],
  ])("%s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
});

describe("R5 out-of-scope subjects go to Noor, even next to an in-scope word", () => {
  it.each([
    // entry rules, health, money, travel, language, water, venue tips, "about us"
    "How much does a visa cost?", "Do children need their own passport?", "Which vaccinations do I need?", "Do I need travel insurance?",
    "Is it safe to use my credit card?", "Where can I change money? Are there ATMs?", "How much cash should I carry?", "How much should I tip the guide?",
    "Can you pick us up from the airport?", "Can I book assistance at the airport?", "How long is the flight?", "What is the baggage allowance?",
    "Does the guide speak German?", "Can I book a guide who speaks Dutch?", "Is the tap water safe to drink?",
    "Do you know a vegetarian restaurant nearby?", "How long have you been in business?", "Do you visit the nature reserve?", "Can I bring my dog?",
    "Do you have a swimming pool?", "Is there a time difference?",
    "Kann ich mit Kreditkarte bezahlen?", "Brauche ich ein Visum?", "Wie viel Geld soll ich mitnehmen?", "Spricht der Guide Deutsch?",
    "Heb ik een visum nodig?", "Waar kan ik geld wisselen?", "Spreekt de gids Engels?", "Hoe laat is de vlucht?",
  ])("%s -> not sure", (q) => {
    expect(topicOf(q)).toBeNull();
  });
  it("without the out-of-scope word the same in-scope word answers", () => {
    expect(topicOf("Do you have insurance?")).toBe("safety");
    expect(topicOf("How much does the tour cost?")).toBe("price");
    expect(topicOf("Can you pick us up from my hotel?")).toBe("meeting point");
  });
  it("a longer in-scope phrase is not blocked by the word inside it", () => {
    expect(topicOf("Is there a money back guarantee?")).toBe("cancellation");
  });
  it("returns no answer and zero confidence", () => {
    expect(matchQuestion("How much does a visa cost?", samples)).toEqual({ answer: null, confidence: 0 });
  });
});

describe("R5 hotel words only count in pure pick-up questions", () => {
  it.each([
    "Is breakfast included at the hotel?", "Can I book a hotel through you?", "Does the hotel have a safe?", "Is the lodge safe?",
    "Do rooms in the hotel cost extra?",
  ])("%s -> not sure", (q) => {
    expect(topicOf(q)).toBeNull();
  });
  it.each([
    ["Do you pick up from hotels in Kololi?", "meeting point"], ["Will the guide collect us from the lodge?", "meeting point"],
    ["Do you include hotel pickup and drop-off?", "meeting point"],
  ])("%s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
});

describe("R5 circumstance words only remove weak evidence", () => {
  it.each([
    "When does the rainy season start?", "Can I pay in euros?", "Is it better to bring pounds or dollars?", "Does the season start in November?",
  ])("%s -> not sure", (q) => {
    expect(topicOf(q)).toBeNull();
  });
  it.each([
    ["Can I cancel because of bad weather?", "cancellation"], ["What should I wear in the rainy season?", "what to bring"],
    ["How much is the tour in euros?", "price"], ["Is the tour safe during the rainy season?", "safety"],
    ["Can I book and pay online?", "how to book"],
  ])("%s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
});

describe("recall: plain topical words in EN/DE/NL", () => {
  it.each([
    ["Are there any sharks in the sea?", "safety"], ["Is crime a problem?", "safety"], ["Can we swim in the river?", "safety"],
    ["Are your guides licensed?", "safety"], ["Do you provide life jackets?", "safety"], ["Is there a risk of theft?", "safety"],
    ["Hat die Tour Schwimmwesten?", "safety"], ["Gibt es Schwimmwesten?", "safety"], ["Zijn er reddingsvesten?", "safety"],
    ["Is there a dress code?", "what to bring"], ["Should I pack sunscreen?", "what to bring"], ["What clothes are suitable?", "what to bring"],
    ["Welche Kleidung brauche ich?", "what to bring"], ["Wat moet ik meenemen?", "what to bring"],
    ["Do you cater for special diets?", "food"], ["Is there a vegan menu?", "food"], ["What dishes will we cook?", "food"], ["Is breakfast served?", "food"],
    ["Gibt es Mittagessen?", "food"], ["Is er eten bij?", "food"],
    ["Do you offer private tours?", "how to book"], ["Can you arrange a custom tour?", "how to book"], ["Do you take group bookings?", "how to book"],
    ["How do I reserve a seat?", "how to book"], ["Kann ich online buchen?", "how to book"], ["Hoe kan ik boeken?", "how to book"],
    ["Is there a group discount?", "price"], ["What are your rates?", "price"], ["Wat zijn de prijzen?", "price"], ["Was kostet ein Ausflug?", "price"],
    ["Can I reschedule my tour?", "cancellation"], ["Kann ich stornieren?", "cancellation"], ["Kan ik annuleren?", "cancellation"],
    ["How many hours does the tour take?", "duration"], ["Wie lange dauert die Tour?", "duration"], ["Hoe lang duurt de excursie?", "duration"],
    ["Are toddlers allowed?", "children"], ["Can teenagers join?", "children"], ["How old do children have to be?", "children"],
    ["Wo ist der Treffpunkt?", "meeting point"], ["Waar ontmoeten we elkaar?", "meeting point"], ["Wo startet die Tour?", "meeting point"],
  ])("%s -> %s", (q, topic) => {
    expect(topicOf(q)).toBe(topic);
  });
});

describe("robustness", () => {
  it("never throws and says not sure for empty or odd input", () => {
    for (const q of ["", "   ", "?!?!", "1234", "\u{1F4B0}", "ñ ŋ", "A".repeat(2000)]) expect(topicOf(q)).toBeNull();
  });
  it("topics without an approved answer are never returned", () => {
    const onlyPrice = [mk("price", false)];
    expect(matchQuestion("Is it safe?", onlyPrice).answer).toBeNull();
    expect(matchQuestion("How much is it?", onlyPrice).answer?.id).toBe("r-price");
  });
  it("a duration phrase takes the words 'how much' away from price even when no duration answer exists", () => {
    expect(matchQuestion("How much time does it take?", [mk("price", false)]).answer).toBeNull();
  });
});

describe("vocabulary invariants (keep the keyword tables honest for whoever edits them)", () => {
  const topics = Object.entries(KEYWORDS);
  const inScope = new Set(topics.flatMap(([, keys]) => keys));
  const lists: Record<string, string[]> = { OUT_OF_SCOPE, STAY_WORDS, CONTEXT_WORDS };

  it("every keyword is already normalised (lower case, no accents, letters only), so it can match", () => {
    const bad = [...topics.flatMap(([t, keys]) => keys.map((k) => [t, k] as const)), ...Object.entries(lists).flatMap(([n, keys]) => keys.map((k) => [n, k] as const))]
      .filter(([, k]) => tokenize(k).join(" ") !== k);
    expect(bad).toEqual([]);
  });
  it("no keyword is listed twice in the same list", () => {
    const dup = [...topics, ...Object.entries(lists)].flatMap(([n, keys]) => keys.filter((k, i) => keys.indexOf(k) !== i).map((k) => `${n}: ${k}`));
    expect(dup).toEqual([]);
  });
  it("every weak word is a keyword, and every stand-alone word is a weak keyword of its own topic", () => {
    expect([...GENERIC].filter((w) => !inScope.has(w))).toEqual([]);
    const bad = Object.entries(STANDS_ALONE).flatMap(([t, words]) => words.filter((w) => !GENERIC.has(w) || !KEYWORDS[t]?.includes(w)).map((w) => `${t}: ${w}`));
    expect(bad).toEqual([]);
  });
  it("an out-of-scope, hotel or circumstance word is never also an in-scope keyword", () => {
    expect(Object.entries(lists).flatMap(([n, keys]) => keys.filter((k) => inScope.has(k)).map((k) => `${n}: ${k}`))).toEqual([]);
  });
  it("every out-of-scope term declines a question that also has strong in-scope words", () => {
    expect(OUT_OF_SCOPE.filter((term) => topicOf(`How much does it cost? ${term}`) !== null)).toEqual([]);
  });
  it("every circumstance word cancels a lone weak word but not a strong one", () => {
    expect(CONTEXT_WORDS.filter((w) => topicOf(`When does the tour start? ${w}`) !== null)).toEqual([]);
    expect(CONTEXT_WORDS.filter((w) => topicOf(`How much does it cost? ${w}`) !== "price")).toEqual([]);
  });
  it("every hotel word keeps a pure pick-up question and declines any other topic", () => {
    expect(STAY_WORDS.filter((w) => topicOf(`Do you pick us up from the ${w}?`) !== "meeting point")).toEqual([]);
    expect(STAY_WORDS.filter((w) => topicOf(`Is lunch provided at the ${w}?`) !== null)).toEqual([]);
  });
});
