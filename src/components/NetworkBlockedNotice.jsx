import { WifiOff, Building2, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatConnectivityError } from "../lib/supabaseConnectivity.js";

function NetworkBlockedNotice({ error, onRetry, retrying }) {
  const detail = formatConnectivityError(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div
        role="alertdialog"
        aria-labelledby="network-blocked-title"
        aria-describedby="network-blocked-body"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
          <WifiOff className="h-6 w-6" />
        </div>
        <h1
          id="network-blocked-title"
          className="text-center text-xl font-bold tracking-tight"
        >
          Couldn’t connect
        </h1>
        <div
          id="network-blocked-body"
          className="mt-3 space-y-3 text-sm leading-relaxed text-white/70"
        >
          <p>
            AtTheViewBox couldn’t reach its server from this network. Some
            hospital and workplace Wi‑Fi networks block it.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/80">
            <p className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <span>
                If you are on a hospital network, please try the{" "}
                <span className="font-semibold text-white">guest or visitor Wi‑Fi</span>.
              </span>
            </p>
            <p className="mt-2 flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <span>
                Otherwise, switch to another network or a phone hotspot, then try again.
              </span>
            </p>
          </div>
          <p className="text-center text-xs text-white/45">
            {detail}
          </p>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 w-full bg-white font-semibold text-slate-950 hover:bg-white/90"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </div>
  );
}

export default NetworkBlockedNotice;
