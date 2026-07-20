import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { FileIcon, FolderIcon, UploadCloudIcon, XIcon, ShieldCheck } from "lucide-react"
import { prepareLocalDraftSeries } from "../../lib/dicomUploadUtils"
import { toast } from "sonner"

export function UploaderComp({ onLocalSeriesReady }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phiVerified, setPhiVerified] = useState(false)
  const [seriesName, setSeriesName] = useState("")

  const handleFileChange = (e) => {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files)
        .filter((file) => file.name.endsWith(".dcm") || file.type === "application/dicom")
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      setFiles(fileArray)
      setPhiVerified(false)
    }
  }

  const handleAddToBuilder = async () => {
    if (files.length === 0 || !phiVerified || processing) return

    setProcessing(true)
    setProgress(0)

    try {
      const draftSeries = await prepareLocalDraftSeries(files, seriesName, setProgress)
      onLocalSeriesReady?.(draftSeries)
      toast.success("DICOM loaded into Builder. Edit in the grid, then save when ready.")
      setOpen(false)
      resetUpload()
    } catch (error) {
      console.error("Failed to prepare local DICOM series:", error)
      toast.error("Failed to load DICOM files")
    } finally {
      setProcessing(false)
    }
  }

  const resetUpload = () => {
    setFiles([])
    setProgress(0)
    setProcessing(false)
    setPhiVerified(false)
    setSeriesName("")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) setTimeout(resetUpload, 300)
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border border-slate-800">
          <UploadCloudIcon className="h-4 w-4" />
          Upload DICOM
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-lg bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Upload DICOM Files</DialogTitle>
          <DialogDescription className="text-slate-400">
            Select a folder of DICOM files to load locally in the Builder. Files are anonymized on your device. Cloud upload happens when you save the case.
          </DialogDescription>
        </DialogHeader>

        <Card className="bg-slate-900/50 border-dashed border-2 border-slate-800">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="series-name" className="text-slate-300">Series Name (Optional)</Label>
              <Input
                id="series-name"
                placeholder="Enter a name for this series..."
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                className="bg-slate-950/50 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-slate-700/30"
              />
            </div>

            {files.length === 0 && !processing && (
              <div className="flex flex-col items-center justify-center space-y-6 py-8">
                <div className="p-5 rounded-full bg-slate-800 border border-slate-700">
                  <FolderIcon className="h-8 w-8 text-slate-400" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-slate-200">Drag and drop a folder or click to browse</p>
                  <p className="text-xs text-slate-500 italic">Supports folders containing DICOM (.dcm) files</p>
                </div>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  webkitdirectory="true"
                  directory=""
                  multiple
                  onChange={handleFileChange}
                />
                <label htmlFor="file-upload">
                  <Button variant="ghost" size="sm" className="cursor-pointer text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800" asChild>
                    <span>Select Folder</span>
                  </Button>
                </label>
              </div>
            )}

            {files.length > 0 && !processing && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-100">{files.length} file(s) selected</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetUpload}
                    className="h-7 gap-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 no-scrollbar">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs p-2 bg-slate-950/50 border border-slate-800/50 rounded hover:bg-slate-900 transition-colors">
                      <FileIcon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate flex-1 text-slate-300">{file.name}</span>
                      <span className="text-slate-600 font-mono flex-shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-muted/30 border rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Privacy & Anonymization</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Files are anonymized locally before preview. Nothing is uploaded until you save the case in the Builder.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pt-3 border-t border-slate-800">
                    <Checkbox
                      id="phi-verification"
                      checked={phiVerified}
                      onCheckedChange={setPhiVerified}
                      className="mt-0.5 h-4 w-4 border-slate-700 data-[state=checked]:bg-slate-100 data-[state=checked]:border-slate-100 data-[state=checked]:text-slate-900"
                    />
                    <Label
                      htmlFor="phi-verification"
                      className="text-xs font-medium text-slate-300 cursor-pointer leading-tight flex-1"
                    >
                      I have reviewed these files and confirm they do not contain any additional Protected Health Information (PHI)
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {processing && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    <span>Preparing Files</span>
                    <span className="text-slate-300">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5 bg-slate-800" indicatorClassName="bg-slate-100" />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <FileIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-400">Anonymizing {files.length} files locally...</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {files.length > 0 && !processing && (
          <CardFooter className="flex justify-end gap-2 p-4 bg-slate-950/50 border-t border-slate-800">
            <Button
              onClick={handleAddToBuilder}
              disabled={!phiVerified}
              className="gap-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-950"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Add to Builder
            </Button>
          </CardFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
