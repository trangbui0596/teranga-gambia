import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  as: z.enum(["noor", "visitor"]),
  text: z.string().max(160),
  lang: z.enum(["en", "de", "nl", "wo"]).default("en"),
});

// Public simulator for the home page: returns the SMS text Teranga would send. It reads demo data, writes nothing and
// sends nothing (no Twilio call), so it is safe to leave open.
export const Route = createFileRoute("/api/public/sms-sim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
