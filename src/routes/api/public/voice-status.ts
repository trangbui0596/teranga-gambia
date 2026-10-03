import { createFileRoute } from "@tanstack/react-router";

// Twilio Voice "Call status changes". Sends the one summary SMS when a call ends early.
export const Route = createFileRoute("/api/public/voice-status")({
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
        if (params["CallStatus"] === "completed" && lib.isOperatorCaller(params["From"]) && params["CallSid"]) {
          try { await lib.sendCallSummary(params["CallSid"].slice(0, 64)); } catch (e) { console.error("call summary failed", e); }
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
