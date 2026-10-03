import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TourCoach backend" },
      { name: "description", content: "TourCoach Gambia WhatsApp and SMS backend status page." },
      { property: "og:title", content: "TourCoach backend" },
      { property: "og:description", content: "TourCoach Gambia WhatsApp and SMS backend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-2xl font-bold">TourCoach backend is running</p>
    </main>
  ),
});
