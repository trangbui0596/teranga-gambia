import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Inbound = z.object({
  From: z.string().min(5).max(64),
  Body: z.string().max(2000).default(""),
  NumMedia: z.string().optional(),
  MediaUrl0: z.string().url().optional(),
});

// Built per request: Cloudflare Workers forbid creating a Response at module (global) scope,
// which crashed every route on the published site.
const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lib = await import("@/lib/tourcoach.server");
        const form = await request.formData().catch(() => null);
        // No/invalid form body cannot carry a valid Twilio signature: reject like a bad signature.
        if (!form) return new Response("Invalid signature", { status: 403 });
        const params: Record<string, string> = {};
        form.forEach((v, k) => { if (typeof v === "string") params[k] = v; });

        // Twilio signs the exact public URL configured in the console.
        const url = process.env["TWILIO_WEBHOOK_URL"] || request.url.replace(/^http:/, "https:");
        if (!lib.validTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
          return new Response("Invalid signature", { status: 403 });
        }

        const parsed = Inbound.safeParse(params);
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const p = parsed.data;
        try {
          await lib.handleWhatsApp({
            from: p.From,
            body: p.Body,
            mediaUrl: Number(p.NumMedia ?? 0) > 0 ? p.MediaUrl0 ?? null : null,
          });
        } catch (e) {
          console.error("whatsapp-webhook error", e);
        }
        // We reply via the Twilio API, so the TwiML response is empty.
        return emptyTwiml();
      },
    },
  },
});
