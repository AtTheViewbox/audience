import { Loader2 } from "lucide-react"

function LoadingPage(props) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-center space-y-4">
        <Loader2 className="w-16 h-16 animate-spin text-white mx-auto" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">Loading...</h2>
        <p className="text-gray-400">Please wait while we fetch your data.</p>
      </div>
    </div>
  )
}

export default LoadingPage;
