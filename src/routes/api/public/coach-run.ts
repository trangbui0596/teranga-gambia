import { createFileRoute } from "@tanstack/react-router";

// Runs (or returns cached) review coaching. Protected by x-digest-secret. Sends no messages.
export const Route = createFileRoute("/api/public/coach-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        if (!lib.isDigestAuthorized(request.headers.get("x-digest-secret"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { getCoaching } = await import("@/lib/coach.server");
          const r = await getCoaching(lib.aiText, 45000, undefined, undefined, false, "wo");
          const en = r.run ? (await import("@/lib/coach")).formatCoach(r.run, "en") : null;
          return Response.json({ cached: r.cached, run: r.run, message: r.messages[0], more: r.messages[1], message_en: en?.[0] ?? null, more_en: en?.[1] ?? null });
        } catch (e) {
          console.error("[coach] error step=coach-run", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
