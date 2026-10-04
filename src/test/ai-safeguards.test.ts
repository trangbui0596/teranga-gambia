// Safeguards around the Lovable AI stream and Twilio media: a cut-off answer must never be stored as complete, transient
// failures get one retry, refusals do not, and oversized media is refused before it can be sent to a paid service.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiText, downloadMedia, MAX_MEDIA_BYTES } from "@/lib/tourcoach.server";

vi.mock("@/integrations/supabase/client.server", async () => {
  const { fakeDb: db } = await import("./helpers/fake-supabase");
  return { supabaseAdmin: db.client };
});
vi.mock("@/lib/background.server", () => ({ runInBackground: vi.fn(), requestCtx: { getStore: () => undefined } }));

const sse = (events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const delta = (t: string) => ({ type: "response.output_text.delta", delta: t });
const done = { type: "response.completed" };

beforeEach(() => {
  process.env["LOVABLE_API_KEY"] = "k";
  process.env["TWILIO_API_KEY"] = "t";
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("aiText", () => {
  it("returns the text of a completed stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([delta("Hello "), delta("world"), done])));
    expect(await aiText("i", "x")).toBe("Hello world");
  });

  it("rejects a stream that ends without a completed event, after one retry", async () => {
    const f = vi.fn(async () => sse([delta("The price is fif")]));
    vi.stubGlobal("fetch", f);
    await expect(aiText("i", "x")).rejects.toThrow("before it completed");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry completes", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? sse([delta("cut")]) : sse([delta("whole answer"), done]))));
    expect(await aiText("i", "x")).toBe("whole answer");
  });

  it("retries a 429 once, but not a 400", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response("slow down", { status: 429 }) : sse([delta("ok"), done]))));
    expect(await aiText("i", "x")).toBe("ok");
    const bad = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", bad);
    await expect(aiText("i", "x")).rejects.toThrow("[400]");
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("does not retry a refusal or a failed event", async () => {
    const refuse = vi.fn(async () => sse([{ type: "response.refusal.delta", delta: "no" }]));
    vi.stubGlobal("fetch", refuse);
    await expect(aiText("i", "x")).rejects.toThrow("refused");
    expect(refuse).toHaveBeenCalledTimes(1);
    const failed = vi.fn(async () => sse([{ type: "response.failed", response: { error: { message: "boom" } } }]));
    vi.stubGlobal("fetch", failed);
    await expect(aiText("i", "x")).rejects.toThrow("boom");
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("does not retry once the caller's time budget has run out", async () => {
    const ctl = new AbortController();
    const f = vi.fn(async () => { ctl.abort(); throw new TypeError("network"); });
    vi.stubGlobal("fetch", f);
    await expect(aiText("i", "x", ctl.signal)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("downloadMedia", () => {
  const URL_OK = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1";
  it("refuses oversized media by header, without reading it", async () => {
    const res = new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/ogg", "content-length": String(MAX_MEDIA_BYTES + 1) } });
    const spy = vi.spyOn(res, "arrayBuffer");
    vi.stubGlobal("fetch", vi.fn(async () => res));
    expect(await downloadMedia(URL_OK)).toMatchObject({ ok: false, status: 413, expired: false });
    expect(spy).not.toHaveBeenCalled();
  });
  it("refuses oversized media with no length header, and accepts a normal voice note", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(MAX_MEDIA_BYTES + 1), { status: 200, headers: { "content-type": "audio/ogg" } })));
    expect(await downloadMedia(URL_OK)).toMatchObject({ ok: false, status: 413 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(5000), { status: 200, headers: { "content-type": "audio/ogg; codecs=opus" } })));
    expect(await downloadMedia(URL_OK)).toMatchObject({ ok: true, bytes: 5000, type: "audio/ogg" });
  });
  it("still only fetches api.twilio.com", async () => {
    await expect(downloadMedia("https://evil.example/2010-04-01/Accounts/AC1/x")).rejects.toThrow("Unexpected media URL");
  });
});
