import { PlayCircle, QrCode, Mouse, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getDemoCaseHref } from "../../lib/demoCase"

export default function DemoHero() {
  const href = getDemoCaseHref()

  return (
    <a
      href={href}
      className="group relative mb-8 block overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-950/80 via-slate-950 to-slate-950 p-6 shadow-[0_0_40px_-12px_rgba(59,130,246,0.55)] transition-all hover:border-blue-400/70 hover:shadow-[0_0_48px_-8px_rgba(59,130,246,0.7)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl transition-opacity group-hover:opacity-80" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
            Live Demo
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Host a reading session in one click
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-slate-300">
            Open a sample case as the host, scan the QR with your phone, then
            walk through scrolling, questions, and live viewport sharing.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5 text-blue-300" />
              You host · join on your phone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mouse className="h-3.5 w-3.5 text-blue-300" />
              Scroll & window
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-blue-300" />
              Live share
            </span>
          </div>
        </div>
        <Button
          size="lg"
          className="h-12 shrink-0 bg-white px-6 text-slate-950 font-semibold shadow-lg shadow-blue-500/20 hover:bg-blue-50 group-hover:scale-[1.02] transition-transform"
          asChild
        >
          <span className="inline-flex items-center">
            <PlayCircle className="mr-2 h-5 w-5" />
            Launch Demo
          </span>
        </Button>
      </div>
    </a>
  )
}
