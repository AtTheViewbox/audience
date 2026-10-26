import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { UploadCloudIcon } from "lucide-react"
import { prepareLocalDraftSeries, describeSkippedFiles } from "../../lib/dicomUploadUtils"
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
      const skipped = draftSeries.skippedFiles || []
      if (skipped.length) {
        toast.warning(`DICOM loaded into Builder. Skipped ${skipped.length} unreadable file${skipped.length === 1 ? "" : "s"}`, {
          id: "dicom-prep",
          description: describeSkippedFiles(skipped),
          duration: 6000,
        })
      } else {
        toast.success("DICOM loaded into Builder", { id: "dicom-prep", duration: 1500 })
      }
    } catch (error) {
      console.error("Failed to prepare local DICOM series:", error)
      toast.error("None of the selected files could be read as DICOM", {
        id: "dicom-prep",
        description: describeSkippedFiles(error.skippedFiles),
        duration: 6000,
      })
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
