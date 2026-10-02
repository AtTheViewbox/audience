import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function JoinQrCard({
  joinLink,
  joinCode,
  size = 168,
  tone = "light",
}) {
  const [copied, setCopied] = useState(null);
  const dark = tone === "dark";

  if (!joinLink) return null;

  async function copy(kind, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className={cn("rounded-xl bg-white p-3", dark && "shadow-lg")}>
        <QRCodeSVG value={joinLink} size={size} />
      </div>
      {joinCode ? (
        <p
          className={cn(
            "font-mono text-3xl font-bold tracking-[0.28em] sm:text-4xl",
            dark ? "text-white" : "text-foreground"
          )}
        >
          {joinCode}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        {joinCode ? (
          <Button
            variant="ghost"
            size="sm"
            className={
              dark
                ? "text-white/80 hover:text-white hover:bg-white/10"
                : "text-muted-foreground hover:text-foreground"
            }
            onClick={() => copy("code", joinCode)}
          >
            {copied === "code" ? (
              <Check className="h-4 w-4 mr-1.5" />
            ) : (
              <Copy className="h-4 w-4 mr-1.5" />
            )}
            {copied === "code" ? "Copied code" : "Copy code"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className={
            dark
              ? "text-white/80 hover:text-white hover:bg-white/10"
              : "text-muted-foreground hover:text-foreground"
          }
          onClick={() => copy("link", joinLink)}
        >
          {copied === "link" ? (
            <Check className="h-4 w-4 mr-1.5" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" />
          )}
          {copied === "link" ? "Copied link" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
