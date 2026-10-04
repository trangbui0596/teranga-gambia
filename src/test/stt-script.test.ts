// A Wolof clip that the recognizer returns in Cyrillic or Arabic letters is retried without a language hint,
// and counts as "not understood" (empty text) if it still comes back non-Latin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sttBlob } from "@/lib/tourcoach.server";

vi.mock("@/integrations/supabase/client.server", async () => {
  const { fakeDb: db } = await import("./helpers/fake-supabase");
  return { supabaseAdmin: db.client };
});
vi.mock("@/lib/background.server", () => ({ runInBackground: vi.fn(), requestCtx: { getStore: () => undefined } }));

const calls: Array<string | null> = [];
function stubStt(replies: string[]) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => {
    const form = init?.body as FormData;
    calls.push((form.get("language_code") as string | null) ?? null);
    const text = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    return new Response(JSON.stringify({ text, language_code: "wol", words: [] }), { status: 200 });
  });
}
beforeEach(() => vi.stubEnv("ELEVENLABS_API_KEY", "ek"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const blob = new Blob(["x"], { type: "audio/ogg" });

describe("sttBlob script guard", () => {
  it("keeps a Latin Wolof transcript from the first call", async () => {
    stubStt(["Dinanu daje ci Tanji Bridge"]);
    const r = await sttBlob(blob, "audio/ogg", "wol");
    expect(r?.text).toBe("Dinanu daje ci Tanji Bridge");
    expect(calls).toEqual(["wol"]);
  });
  it("retries without a language hint when the first transcript is Cyrillic", async () => {
    stubStt(["Ньек би мой юниак юром тхемер Даласи.", "Niech by moj juniak jurom temer dalasi"]);
    const r = await sttBlob(blob, "audio/ogg", "wol");
    expect(r?.text).toBe("Niech by moj juniak jurom temer dalasi");
    expect(calls).toEqual(["wol", null]);
  });
  it("returns empty text when both calls are non-Latin", async () => {
    stubStt(["توربٍ دفاعي يگنت واختو"]);
    const r = await sttBlob(blob, "audio/ogg", "wol");
    expect(r?.text).toBe("");
  });
  it("does not retry for other languages", async () => {
    stubStt(["Привет всем друзья"]);
    const r = await sttBlob(blob, "audio/ogg", null);
    expect(r?.text).toContain("Привет");
    expect(calls).toEqual([null]);
  });
});
