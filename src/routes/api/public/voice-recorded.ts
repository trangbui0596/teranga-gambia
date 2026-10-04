import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Query = z.object({
  n: z.coerce.number().int().min(1).max(10),
  r: z.coerce.number().int().min(0).max(1).default(0),
  empty: z.string().optional(),
});

// <Record> action for question n. Stores the answer, starts the pipeline, moves to n+1 (hard cap 10).
export const Route = createFileRoute("/api/public/voice-recorded")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        const form = await request.formData().catch(() => null);
        // No/invalid form body cannot carry a valid Twilio signature: reject like a bad signature.
        if (!form) return new Response("Invalid signature", { status: 403 });
        const params: Record<string, string> = {};
        form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });
        if (!lib.validTwilioSignature(lib.signedUrlFor(request), params, request.headers.get("x-twilio-signature"))) {
          return new Response("Invalid signature", { status: 403 });
        }
        if (!lib.isOperatorCaller(params["From"])) return lib.twimlPrivate();
        const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!q.success) return lib.twimlGoodbye();
        const positions = lib.callPositions();
        const { n, r } = q.data; // n = call step (1..M), not the card position
        if (n > positions.length) return lib.twimlGoodbye();
        const callSid = (params["CallSid"] ?? "").slice(0, 64);
        const url = params["RecordingUrl"];
        const duration = Number(params["RecordingDuration"] ?? "0");
        const empty = !!q.data.empty || !url || !/^https:\/\/api\.twilio\.com\//.test(url) || duration < 1;

        if (empty && r === 0) return lib.twimlQuestion(n, { retry: true }); // ask once more, then move on
        if (!empty) {
          try { await lib.storeCallRecording(callSid, positions[n - 1]!, url!); } catch (e) { console.error("voice-recorded store failed", e); }
        }
        if (n >= positions.length) {
          try { await lib.sendCallSummary(callSid); } catch (e) { console.error("call summary failed", e); }
          return lib.twimlGoodbye();
        }
        return lib.twimlQuestion(n + 1);
      },
    },
  },
});
