import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircleQuestion, UserRound } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TourCoach Gambia — Ask Fatou" },
      { name: "description", content: "Ask Fatou's tour questions in English, German or Dutch and get her approved answers." },
      { property: "og:title", content: "TourCoach Gambia — Ask Fatou" },
      { property: "og:description", content: "Approved tour answers from Fatou in English, German and Dutch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="pattern-kente h-3" />
      <div className="flex flex-1 flex-col justify-center gap-8 px-5 py-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary">The Gambia</p>
          <h1 className="mt-2 text-5xl font-black leading-tight">TourCoach</h1>
          <p className="mt-3 text-lg text-muted-foreground">Fatou's own answers, in your language.</p>
        </div>
        <Link to="/ask" className="tap flex items-center gap-4 rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg">
          <MessageCircleQuestion className="h-12 w-12" />
          <div>
            <div className="text-2xl font-bold">Ask a question</div>
            <div className="opacity-90">🇬🇧 English · 🇩🇪 Deutsch · 🇳🇱 Nederlands</div>
          </div>
        </Link>
        <Link to="/review" className="tap flex items-center gap-4 rounded-2xl border-4 border-foreground bg-card p-6">
          <UserRound className="h-12 w-12" />
          <div className="text-2xl font-bold">Champion</div>
        </Link>
      </div>
    </div>
  );
}
