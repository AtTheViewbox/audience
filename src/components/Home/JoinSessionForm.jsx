import { useContext, useState } from "react";
import { Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserContext } from "../../context/UserContext";
import { joinSessionByCode, normalizeJoinCode } from "../../lib/shareSession.js";
import { cn } from "@/lib/utils";

export default function JoinSessionForm({ variant = "header", className }) {
  const { supabaseClient } = useContext(UserContext).data;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const isCard = variant === "card";

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const next = normalizeJoinCode(code);
    if (next.length < 4) {
      toast.error("Enter a 4–5 letter session code.");
      return;
    }

    setBusy(true);
    try {
      await joinSessionByCode(supabaseClient, next);
    } catch (error) {
      toast.error(error?.message || "Could not join that session.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        isCard
          ? "flex w-full flex-col gap-3 sm:flex-row sm:items-center"
          : "flex items-center gap-1.5",
        className
      )}
    >
      {isCard ? (
        <div className="relative flex-1">
          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={code}
            onChange={(event) => setCode(normalizeJoinCode(event.target.value).slice(0, 6))}
            placeholder="Enter code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={6}
            aria-label="Session join code"
            className="h-9 pl-9 font-mono text-sm uppercase tracking-[0.28em] text-slate-100 placeholder:tracking-normal placeholder:text-slate-500 bg-slate-900/50 border-slate-800 focus-visible:ring-blue-500/30 focus-visible:ring-offset-0"
          />
        </div>
      ) : (
        <Input
          value={code}
          onChange={(event) => setCode(normalizeJoinCode(event.target.value).slice(0, 6))}
          placeholder="CODE"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          aria-label="Session join code"
          className="h-8 w-[6.5rem] px-2 font-mono text-xs uppercase tracking-[0.28em] text-slate-100 placeholder:tracking-widest placeholder:text-slate-500 bg-slate-900/50 border-slate-800"
        />
      )}
      <Button
        type="submit"
        disabled={busy}
        className={cn(
          isCard
            ? "h-9 shrink-0 bg-slate-800 px-4 text-sm text-slate-100 hover:bg-slate-700"
            : "h-8 bg-slate-800 px-2.5 text-xs text-slate-100 hover:bg-slate-700"
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
      </Button>
    </form>
  );
}
