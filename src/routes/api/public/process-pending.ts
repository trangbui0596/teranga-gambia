import { createFileRoute } from "@tanstack/react-router";

// Finishes all unfinished voice answers (resumable stages). Protected by x-digest-secret (DIGEST_TRIGGER_SECRET).
export const Route = createFileRoute("/api/public/process-pending")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          return Response.json(await lib.finishAnswers(25000));
        } catch (e) {
          console.error("[pipeline] error step=process-pending", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
