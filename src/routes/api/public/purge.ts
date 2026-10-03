import { createFileRoute } from "@tanstack/react-router";

// Deletes unshared visitor reviews older than 24h. Protected by x-digest-secret (DIGEST_TRIGGER_SECRET).
export const Route = createFileRoute("/api/public/purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          return Response.json(await lib.purgeFeedback());
        } catch (e) {
          console.error("purge error", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
