import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Inbound = z.object({
  From: z.string().min(5).max(64),
  Body: z.string().max(1600).default(""),
});

// Built per request: Cloudflare Workers forbid creating a Response at module (global) scope.
const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });

// Twilio number > Messaging > "A message comes in": https://<published-url>/api/public/sms-webhook (HTTP POST).
// Noor's number can text COACH, LISTING, WEEK or HELP and gets the answer by SMS: no internet needed on her side.
const failedTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, something went wrong on our side. Please send your message again in a minute.</Message></Response>', {
    headers: { "Content-Type": "text/xml" },
  });

export const Route = createFileRoute("/api/public/sms-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        const form = await request.formData().catch(() => null);
        if (!form) return new Response("Invalid signature", { status: 403 });
        const params: Record<string, string> = {};
        form.forEach((v, k) => {
          if (typeof v === "string") params[k] = v;
        });

        // One TWILIO_WEBHOOK_URL secret serves every route: its origin plus this route's path.
        if (
          !lib.validTwilioSignature(
            lib.signedUrlFor(request),
            params,
            request.headers.get("x-twilio-signature"),
          )
        ) {
          return new Response("Invalid signature", { status: 403 });
        }

        const parsed = Inbound.safeParse(params);
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        try {
          await lib.handleSms({ from: parsed.data.From, body: parsed.data.Body });
        } catch (e) {
          console.error("sms-webhook error", e);
          // Do not leave the sender in silence. This TwiML reply costs nothing and does not touch the daily outbound cap.
          return failedTwiml();
        }
        // Replies go through the Twilio API, so the TwiML response is empty.
        return emptyTwiml();
      },
    },
  },
});
