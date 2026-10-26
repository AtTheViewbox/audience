import { useEffect, useState } from "react";
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

export default function ShareByEmailDialog({
  open,
  onOpenChange,
  title,
  description,
  busy = false,
  onSubmit,
}) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) setEmail("");
  }, [open]);

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
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@hospital.org"
              className="bg-slate-900/50 border-slate-800"
            />
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
