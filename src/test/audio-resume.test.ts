import { describe, it, expect } from "vitest";
import { ensureAudio, finishAudio, type AudioDeps, type Lang } from "@/lib/pipeline";

function fake(approved = true) {
  const rows = new Map<Lang, string>();
  let lease = false;
  const calls: Lang[] = [];
  let failLang: Lang | null = null;
  const d: AudioDeps = {
    now: () => 0, log: () => {},
    texts: async () => ({ approved, en: "Hello", de: "Hallo", nl: "Hallo" }),
    existing: async () => [...rows.keys()],
    claimLease: async () => (lease ? false : (lease = true)),
    releaseLease: async () => { lease = false; },
    speak: async (_t, l) => { calls.push(l); if (l === failLang) throw new Error("cut off"); return `a1/${l}.mp3`; },
    save: async (_id, l, p) => { rows.set(l, p); },
    listMissing: async () => (rows.size < 3 && approved ? ["a1"] : []),
  };
  return { d, rows, calls, failOn: (l: Lang | null) => { failLang = l; } };
}

describe("voice files for approved answers", () => {
  it("a cut-off run resumes with only the missing language, no duplicates", async () => {
    const f = fake();
    f.failOn("nl"); // the request is cut off before Dutch finished
    await ensureAudio(f.d, "a1", ["en", "de", "nl"], 60000);
    expect([...f.rows.keys()].sort()).toEqual(["de", "en"]);
    f.failOn(null);
    const r = await finishAudio(f.d, 60000);
    expect([...f.rows.keys()].sort()).toEqual(["de", "en", "nl"]);
    expect(f.calls.filter((l) => l === "en").length).toBe(1);
    expect(f.calls.filter((l) => l === "de").length).toBe(1);
    expect(f.calls.filter((l) => l === "nl").length).toBe(2); // failed once, then made once
    expect(r.audio_remaining).toBe(0);
    await finishAudio(f.d, 60000);
    expect(f.calls.length).toBe(4); // nothing regenerated
  });

  it("never makes audio for an answer that is not approved", async () => {
    const f = fake(false);
    await ensureAudio(f.d, "a1", ["en"], 60000);
    expect(f.calls.length).toBe(0);
  });

  it("skips (text only) when the budget is too small or another request is working on it", async () => {
    const f = fake();
    expect(await ensureAudio(f.d, "a1", ["en"], 1000)).toEqual([]);
    await f.d.claimLease("a1", 1000);
    expect(await ensureAudio(f.d, "a1", ["en"], 60000)).toEqual([]);
    expect(f.calls.length).toBe(0);
  });
});
