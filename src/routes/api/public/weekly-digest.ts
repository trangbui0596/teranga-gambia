import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/weekly-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          return Response.json(await lib.sendWeeklyDigest());
        } catch (e) {
          console.error("weekly-digest error", e);
          return Response.json({ sent: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
