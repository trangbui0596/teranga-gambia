import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  questions: z.array(z.object({ text: z.string().min(1).max(500), expected_topic: z.string().min(1).max(64) })).max(500).optional(),
}).optional();

// POST with header x-digest-secret. Empty body = run the seeded evaluation test data (20 questions).
export const Route = createFileRoute("/api/public/eval-match")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const raw = await request.text();
        const parsed = Body.safeParse(raw ? JSON.parse(raw) : undefined);
        if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        return Response.json(await lib.evaluateMatching(parsed.data?.questions));
      },
    },
  },
});
