import { Link } from "@tanstack/react-router";
import { BookOpen, Ear, RefreshCw, Upload, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

const items = [
  { to: "/import", icon: Upload, label: "1" },
  { to: "/sync", icon: RefreshCw, label: "2" },
  { to: "/review", icon: Ear, label: "3" },
  { to: "/library", icon: BookOpen, label: "4" },
] as const;

export function ChampionShell({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-xl pb-32">
      <div className="pattern-kente h-2" />
      <header className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{icon}</div>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <button
          aria-label="Sign out"
          onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/"))}
          className="tap flex items-center justify-center rounded-2xl border-2 border-border bg-card"
        >
          <LogOut className="h-6 w-6" />
        </button>
      </header>
      <main className="px-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t-4 border-primary bg-card">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {items.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-3 text-muted-foreground"
              activeProps={{ className: "flex flex-col items-center gap-1 py-3 bg-accent text-accent-foreground" }}
            >
              <Icon className="h-9 w-9" strokeWidth={2.5} />
              <span className="text-sm font-bold">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
