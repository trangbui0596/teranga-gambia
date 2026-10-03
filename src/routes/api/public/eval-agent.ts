import { createFileRoute } from "@tanstack/react-router";

// POST with header x-digest-secret. Runs 15 scripted champion messages in dry-run mode (no data changed, nothing sent).
export const Route = createFileRoute("/api/public/eval-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { evaluateAgent } = await import("@/lib/agent.server");
        return Response.json(await evaluateAgent());
      },
    },
  },
});
