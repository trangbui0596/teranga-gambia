import { createFileRoute } from "@tanstack/react-router";

// POST with header x-digest-secret. The weekly sync: fresh scan of public Google reviews, what visitors asked and said
// this week, refined coaching. The helper gets the full report on WhatsApp (her smartphone session) and Noor a short SMS.
export const Route = createFileRoute("/api/public/weekly-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          return Response.json(await lib.runWeeklySync());
        } catch (e) {
          console.error("weekly-sync error", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
