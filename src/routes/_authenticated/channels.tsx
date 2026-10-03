import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Radio, Smartphone } from "lucide-react";
import { ChampionShell } from "@/components/ChampionNav";

export const Route = createFileRoute("/_authenticated/channels")({
  head: () => ({ meta: [{ title: "Channels — TourCoach" }, { name: "description", content: "WhatsApp and SMS connection status." }] }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const rows = [
    { icon: MessageSquare, label: "WhatsApp: not connected" },
    { icon: Smartphone, label: "SMS: not connected" },
  ];
  return (
    <ChampionShell title="Channels" icon={<Radio className="h-8 w-8" />}>
      <ul className="space-y-3">
        {rows.map(({ icon: I, label }) => (
          <li key={label} className="flex items-center gap-4 rounded-2xl border-4 border-border bg-card p-4">
            <I className="h-10 w-10 text-muted-foreground" />
            <span className="flex-1 text-lg font-bold">{label}</span>
            <span className="h-5 w-5 rounded-full bg-muted-foreground" aria-hidden />
          </li>
        ))}
      </ul>
    </ChampionShell>
  );
}
