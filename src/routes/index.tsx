import { createFileRoute, redirect } from "@tanstack/react-router";

// Visitors use WhatsApp/SMS; the web app is champion-only.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TourCoach Gambia — Champion" },
      { name: "description", content: "Champion workspace for reviewing Fatou's tour answers." },
      { property: "og:title", content: "TourCoach Gambia — Champion" },
      { property: "og:description", content: "Review and approve Fatou's tour answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/review" });
  },
});
