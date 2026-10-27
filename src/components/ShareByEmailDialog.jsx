import { useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserContext } from "../context/UserContext";

export default function ShareByEmailDialog({
  open,
  onOpenChange,
  title,
  description,
  busy = false,
  onSubmit,
}) {
  const { userData, supabaseClient } = useContext(UserContext).data || {};
  const [email, setEmail] = useState("");
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    if (!supabaseClient || !userData?.id || userData.is_anonymous) {
      setPeople([]);
      return;
    }

    let cancelled = false;
    setLoadingPeople(true);
    supabaseClient.rpc("share_suggest_users").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error(error);
        setPeople([]);
      } else {
        setPeople(Array.isArray(data) ? data.filter((person) => person?.email) : []);
      }
      setLoadingPeople(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, supabaseClient, userData?.id, userData?.is_anonymous]);

  const query = email.trim().toLowerCase();
  const shown = query
    ? people.filter((person) =>
      person.email.toLowerCase().includes(query)
      || (person.name || "").toLowerCase().includes(query)
    )
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-slate-400">{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const next = email.trim();
            if (!next || busy) return;
            onSubmit(next);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="share-by-email">Their email</Label>
            <Input
              id="share-by-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@hospital.org"
              className="bg-slate-900/50 border-slate-800"
            />
            {!query ? null : loadingPeople ? (
              <p className="text-xs text-slate-500">Loading accounts…</p>
            ) : shown.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-800 bg-slate-900/40">
                {shown.map((person) => {
                  const selected = person.email.toLowerCase() === query;
                  const label = person.name && person.name.toLowerCase() !== person.email.toLowerCase()
                    ? person.name
                    : person.email;
                  return (
                    <button
                      key={person.email}
                      type="button"
                      className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-800/80 ${selected ? "bg-slate-800" : ""}`}
                      onClick={() => setEmail(person.email)}
                    >
                      <span className="block w-full truncate text-sm text-slate-100">{label}</span>
                      {label !== person.email ? (
                        <span className="block w-full truncate text-xs text-slate-400">{person.email}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No account matches that.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sharing…" : "Share"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
