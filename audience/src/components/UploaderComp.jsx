import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { useContext } from "react"
import { UserContext } from "../context/UserContext"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { FileIcon, FolderIcon, UploadCloudIcon, XIcon } from "lucide-react"

export function UploaderComp() {
  const [open, setOpen] = useState(false)
  const { supabaseClient } = useContext(UserContext).data;
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  
  const handleFileChange = (e) => {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files).filter(
        (file) => file.name.endsWith(".dcm") || file.type === "application/dicom",
      )
      setFiles(fileArray)
    }
  }

  const handleUpload = () => {
    if (files.length === 0) return

    setUploading(true)
    setProgress(0)
    console.log(files)
    if (files[0]) uploadImageToR2(files[0]);
    // Simulate upload progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setUploading(false)
          setUploadComplete(true)
          return 100
        }
        return prev + 5
      })
    }, 200)
  }

  const resetUpload = () => {
    setFiles([])
    setProgress(0)
    setUploading(false)
    setUploadComplete(false)
  }

  const closeDialog = () => {
    setOpen(false)
    if (uploadComplete) {
      setTimeout(resetUpload, 300)
    }
  }

  const uploadImageToR2 = async (file) => {

    const {
        data: { session },
        error,
      } = await supabaseClient.auth.getSession();
      
    const token = session?.access_token;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1]; // Strip the base64 prefix
  
      const response = await fetch(
        'https://gcoomnnwmbehpkmbgroi.supabase.co/functions/v1/uploadS3-ts',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Include Supabase auth if needed:
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            base64Image: base64,
          }),
        }
      );
  
      const data = await response.json();
      console.log('Upload response:', data);
    };
  
    reader.readAsDataURL(file); // Reads the file and triggers onloadend
  };

  

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <UploadCloudIcon className="h-5 w-5" />
          Upload DICOM Files
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload DICOM Files</DialogTitle>
          <DialogDescription>Select a folder containing DICOM (.dcm) files to upload</DialogDescription>
        </DialogHeader>

        <Card className="border-dashed border-2">
          <CardContent className="pt-6">
            {!uploading && !uploadComplete && (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="p-4 rounded-full bg-blue-50">
                  <FolderIcon className="h-8 w-8 text-blue-500" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-gray-500">Drag and drop a folder or click to browse</p>
                  <p className="text-xs text-gray-400">Supports folders containing DICOM (.dcm) files</p>
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
                  <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                    <span>Select Folder</span>
                  </Button>
                </label>
              </div>
            )}

            {files.length > 0 && !uploading && !uploadComplete && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Selected Files</p>
                  <Button variant="ghost" size="sm" onClick={resetUpload} className="h-8 w-8 p-0">
                    <XIcon className="h-4 w-4" />
                    <span className="sr-only">Clear selection</span>
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                  {files.slice(0, 5).map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                      <FileIcon className="h-4 w-4 text-blue-500" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-gray-400 text-xs">{(file.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                  {files.length > 5 && (
                    <p className="text-xs text-gray-500 text-center">+{files.length - 5} more files</p>
                  )}
                </div>
              </div>
            )}

            {(uploading || uploadComplete) && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Upload Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <FileIcon className="h-4 w-4 text-blue-500" />
                  <span className="text-gray-600">
                    {uploadComplete
                      ? `Successfully uploaded ${files.length} files`
                      : `Uploading ${files.length} files...`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeDialog}>
            {uploadComplete ? "Close" : "Cancel"}
          </Button>
          {!uploading && !uploadComplete && files.length > 0 && <Button onClick={handleUpload}>Upload Files</Button>}
          {uploadComplete && <Button onClick={resetUpload}>Upload More</Button>}
        </CardFooter>
      </DialogContent>
    </Dialog>
  )
}
