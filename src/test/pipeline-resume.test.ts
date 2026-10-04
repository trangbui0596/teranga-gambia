import { describe, it, expect } from "vitest";
import { finishAnswers, runAnswer, type PipelineDeps, type PipelineRow, MEDIA_EXPIRED } from "@/lib/pipeline";

function fakeDb(row: Partial<PipelineRow> = {}) {
  const r: PipelineRow & Record<string, unknown> = {
    id: "a1", stage: "received", attempts: 0, audio_url: "https://api.twilio.com/x", position: 1,
    transcript_src: null, english: null, flags: ["processing"], notify_hash: "h:champ", notified_at: null, ...row,
  };
  let lease = false;
  let clock = 0;
  const calls = { download: 0, stt: 0, translate: 0, roundtrip: 0, notify: 0 };
  let cutAfter = Infinity; // simulate the Worker being killed after N steps
  let steps = 0;
  const step = () => { if (++steps > cutAfter) throw new Error("cut off"); };
  const d: PipelineDeps = {
    now: () => clock, log: () => {},
    load: async () => ({ ...r }),
    listUnfinished: async () => (["received", "transcribed", "translated"].includes(r.stage) || (!r.notified_at && r.transcript_src) ? [r.id] : []),
    countUnfinished: async () => (["received", "transcribed", "translated"].includes(r.stage) ? 1 : 0),
    claimLease: async () => (lease ? false : (lease = true)),
    releaseLease: async () => { lease = false; },
    advance: async (_id, from, patch) => { if (r.stage !== from) return false; Object.assign(r, patch); step(); return true; },
    claimNotify: async () => { if (r.notified_at) return false; r.notified_at = "now"; return true; },
    download: async () => { calls.download++; return { ok: true, status: 200, bytes: 10, type: "audio/mpeg", blob: new Blob(["x"]) }; },
    stt: async () => { calls.stt++; clock += 100; return { status: 200, text: "Tour bi 1500 dalasi", confidence: 0.9 }; },
    translate: async (_t, to) => { calls.translate++; return `T-${to}`; },
    roundtrip: async () => { calls.roundtrip++; return { score: 0.95, differences: [] }; },
    hash: (p) => `h:${p}`,
    notify: async () => { calls.notify++; return true; },
    notifyText: () => "transcript",
  };
  return { r, d, calls, cut: (n: number) => { cutAfter = n; steps = 0; }, uncut: () => { cutAfter = Infinity; }, release: () => { lease = false; } };
}

describe("resumable pipeline", () => {
  it("completes the remaining steps after a cut-off, without duplicate work or messages", async () => {
    const f = fakeDb();
    f.cut(1); // throws right after the 2nd saved step; // steps 1-2 (transcript saved, translations saved) succeed, then the Worker dies
    await expect(runAnswer(f.d, "a1", 60000, "champ")).rejects.toThrow("cut off");
    f.release(); // lease would expire on its own
    expect(f.r.stage).toBe("translated");
    expect(f.calls.stt).toBe(1);

    f.uncut();
    const res = await finishAnswers(f.d, 60000, { phone: "champ" });
    expect(f.r.stage).toBe("checked");
    expect(res.remaining).toBe(0);
    expect(f.calls.download).toBe(1); // not downloaded/transcribed again
    expect(f.calls.stt).toBe(1);
    expect(f.calls.translate).toBe(3);
    expect(f.calls.roundtrip).toBe(1);
    expect(f.calls.notify).toBe(1);
    expect(f.r.flags).toContain("machine-translated");
    expect(f.r.flags).not.toContain("processing");

    await finishAnswers(f.d, 60000, { phone: "champ" }); // a later call does nothing
    expect(f.calls.notify).toBe(1);
    expect(f.calls.translate).toBe(3);
  });

  it("never sends the transcript to anyone but the champion who sent it, and REVIEW/cron calls send nothing", async () => {
    const f = fakeDb();
    await finishAnswers(f.d, 60000, {}); // no phone (REVIEW / process-pending)
    expect(f.r.stage).toBe("checked");
    expect(f.calls.notify).toBe(0);
    await finishAnswers(f.d, 60000, { phone: "someone-else" });
    expect(f.calls.notify).toBe(0);
  });

  it("stops without error when the budget is too small and leaves the stage unchanged", async () => {
    const f = fakeDb();
    const res = await finishAnswers(f.d, 2000, { phone: "champ" });
    expect(res.processed).toBe(0);
    expect(f.r.stage).toBe("received");
  });

  it("concurrent calls do not duplicate work (lease)", async () => {
    const f = fakeDb();
    await Promise.all([runAnswer(f.d, "a1", 60000, "champ"), runAnswer(f.d, "a1", 60000, "champ")]);
    expect(f.calls.stt).toBe(1);
    expect(f.calls.notify).toBe(1);
  });

  it("marks an expired media link for re-send", async () => {
    const f = fakeDb();
    f.d.download = async () => ({ ok: false, status: 404, expired: true });
    await finishAnswers(f.d, 60000, {});
    expect(f.r.stage).toBe("failed");
    expect(f.r.flags).toEqual([MEDIA_EXPIRED]);
  });
});

describe("a price must survive translation", () => {
  it("passes the stated number to the translator and keeps a correct English answer unflagged", async () => {
    const f = fakeDb();
    const hints: number[][] = [];
    f.d.stt = async () => ({ status: 200, text: "Niech by mój juniak Jurón témér dalasi.", confidence: 0.9 });
    f.d.translate = async (_t, to, _s, hint) => { if (to === "en") hints.push(hint ?? []); return to === "en" ? "The tour costs 1500 dalasi." : `T-${to}`; };
    await finishAnswers(f.d, 60000, {});
    expect(hints[0]).toEqual([1500]);
    expect(f.r.flags.join(" ")).not.toContain("number mismatch");
  });
  it("retries once, then flags the answer when the English still lacks the number", async () => {
    const f = fakeDb();
    let enCalls = 0;
    f.d.stt = async () => ({ status: 200, text: "Niech by mój juniak Jurón témér dalasi.", confidence: 0.9 });
    f.d.translate = async (_t, to) => { if (to === "en") { enCalls++; return "Let my young man be. Five hundred dalasi."; } return `T-${to}`; };
    await finishAnswers(f.d, 60000, {});
    expect(enCalls).toBe(2);
    expect(f.r.flags).toContain("number mismatch: please confirm");
  });
  it("accepts the number written in words", async () => {
    const f = fakeDb();
    f.d.stt = async () => ({ status: 200, text: "Niech by mój juniak Jurón témér dalasi.", confidence: 0.9 });
    f.d.translate = async (_t, to) => (to === "en" ? "It costs fifteen hundred dalasi." : `T-${to}`);
    await finishAnswers(f.d, 60000, {});
    expect(f.r.flags.join(" ")).not.toContain("number mismatch");
  });
});
