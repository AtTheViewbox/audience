import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { UploadCloudIcon } from "lucide-react"
import { prepareLocalDraftSeries } from "../../lib/dicomUploadUtils"
import { toast } from "sonner"

export function UploaderComp({ onLocalSeriesReady }) {
  const inputRef = useRef(null)
  const processingRef = useRef(false)

  const handleFileChange = async (event) => {
    const selected = Array.from(event.target.files || [])
      .filter((file) => file.name.endsWith(".dcm") || file.type === "application/dicom")
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
    event.target.value = ""

    if (!selected.length) {
      toast.error("No DICOM files in that folder")
      return
    }
    if (processingRef.current) return

    processingRef.current = true
    try {
      const draftSeries = await prepareLocalDraftSeries(selected, "", (pct) => {
        if (pct > 0) {
          toast.loading(`Preparing DICOM… ${pct}%`, {
            id: "dicom-prep",
            duration: Infinity,
          })
        }
      })
      onLocalSeriesReady?.(draftSeries)
      toast.success("DICOM loaded into Builder", { id: "dicom-prep", duration: 1500 })
    } catch (error) {
      console.error("Failed to prepare local DICOM series:", error)
      toast.error("Failed to load DICOM files", { id: "dicom-prep" })
    } finally {
      processingRef.current = false
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        webkitdirectory="true"
        directory=""
        multiple
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border border-slate-800"
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloudIcon className="h-4 w-4" />
        Upload DICOM
      </Button>
    </>
  )
}
