import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/landing/Landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teranga" },
      {
        name: "description",
        content:
          "Tourism earned The Gambia US$157 million in 2019, yet half the country is offline. Teranga lets a Gambian tour operator answer visitors in English, German and Dutch with her own pre-approved words.",
      },
      { property: "og:title", content: "Teranga" },
      {
        property: "og:description",
        content:
          "A Gambian tour operator answers visitors in English, German and Dutch with her own pre-approved words.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});
