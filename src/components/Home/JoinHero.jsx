import JoinSessionForm from "./JoinSessionForm"

export default function JoinHero() {
  return (
    <div className="mb-8 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-300">Join with a code</p>
      <JoinSessionForm variant="card" />
    </div>
  )
}
