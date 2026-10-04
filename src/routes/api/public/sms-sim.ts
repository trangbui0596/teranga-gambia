import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  as: z.enum(["noor", "visitor"]),
  text: z.string().max(160),
  lang: z.enum(["en", "de", "nl", "wo"]).default("en"),
});

// Public simulator for the home page: returns the SMS text Teranga would send. It reads approved answers and notices only (never pending ones), writes nothing and
// sends nothing (no Twilio call), so it is safe to leave open.
// Best-effort per-visitor limit (each Worker instance keeps its own count): the simulator is public and reads the database.
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    if (hits.size > 500) hits.clear();
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > 20;
}

export const Route = createFileRoute("/api/public/sms-sim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (limited(ip)) return Response.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
        const lib = await import("@/lib/tourcoach.server");
        try {
          return Response.json(
            await lib.simulateSms(parsed.data.as, parsed.data.text, parsed.data.lang),
          );
        } catch (e) {
          console.error("sms-sim error", e);
          return Response.json({ error: "Simulation failed" }, { status: 500 });
        }
      },
    },
  },
});
