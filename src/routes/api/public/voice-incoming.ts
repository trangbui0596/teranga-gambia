import { createFileRoute } from "@tanstack/react-router";

// Twilio Voice "A call comes in". Only the demo operator's phone is accepted.
export const Route = createFileRoute("/api/public/voice-incoming")({
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
        return lib.twimlQuestion(1, { greet: true });
      },
    },
  },
});
