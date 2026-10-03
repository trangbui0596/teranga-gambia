import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Mail, ArrowRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Champion sign in — TourCoach Gambia" },
      { name: "description", content: "Sign in for the TourCoach champion who reviews Fatou's answers." },
      { property: "og:title", content: "Champion sign in — TourCoach Gambia" },
      { property: "og:description", content: "Champion sign in for reviewing tour answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(mode: "in" | "up") {
    setBusy(true);
    const res = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: `${window.location.origin}/review` } });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    if (mode === "up" && !res.data.session) { toast.success("📧 Check email to confirm"); return; }
    nav({ to: "/review" });
  }

  const field = "tap w-full rounded-2xl border-4 border-input bg-card pl-16 pr-4 text-xl outline-none focus:border-primary";
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-10">
      <div className="pattern-kente h-3 rounded" />
      <h1 className="text-3xl font-black">Champion</h1>
      <p className="text-sm text-muted-foreground">The first account created becomes the champion.</p>
      <label className="relative block">
        <Mail className="absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 text-primary" aria-hidden />
        <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      <label className="relative block">
        <KeyRound className="absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 text-primary" aria-hidden />
        <input aria-label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
      </label>
      <button disabled={busy} onClick={() => go("in")} aria-label="Sign in"
        className="tap flex items-center justify-center rounded-2xl bg-primary py-5 text-primary-foreground disabled:opacity-50">
        <ArrowRight className="h-10 w-10" strokeWidth={3} />
      </button>
      <button disabled={busy} onClick={() => go("up")} aria-label="Create account"
        className="tap flex items-center justify-center gap-2 rounded-2xl border-4 border-foreground py-4 font-bold disabled:opacity-50">
        <UserPlus className="h-8 w-8" /> New
      </button>
    </div>
  );
}
