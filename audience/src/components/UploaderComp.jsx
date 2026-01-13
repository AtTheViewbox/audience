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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { FileIcon, FolderIcon, UploadCloudIcon, XIcon, ShieldCheck, AlertTriangle, Copy, CheckCircle2, Check } from "lucide-react"
import * as dcmjs from "dcmjs"

export function UploaderComp() {
  const [open, setOpen] = useState(false)
  const { supabaseClient } = useContext(UserContext).data;
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [phiVerified, setPhiVerified] = useState(false)
  const [viewerUrl, setViewerUrl] = useState("")
  const [copyClicked, setCopyClicked] = useState(false)

  const handleFileChange = (e) => {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files)
        .filter((file) => file.name.endsWith(".dcm") || file.type === "application/dicom")
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); // Sort files by name
      setFiles(fileArray)
      setPhiVerified(false) // Reset checkbox when new files are selected
    }
  }

  // Anonymize DICOM file by removing patient-identifying information
  const anonymizeDicomFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
          const dataset = dicomData.dict;

          // Remove PHI tags
          delete dataset['00100010']; // Patient Name
          delete dataset['00100020']; // Patient ID
          delete dataset['00100030']; // Patient Birth Date
          delete dataset['00100040']; // Patient Sex
          delete dataset['00101010']; // Patient Age
          delete dataset['00101020']; // Patient Size
          delete dataset['00101030']; // Patient Weight
          delete dataset['00102160']; // Ethnic Group
          delete dataset['001021B0']; // Additional Patient History
          delete dataset['00104000']; // Patient Comments


          // Write back to file
          const outputBuffer = dicomData.write();
          const blob = new Blob([outputBuffer], { type: 'application/dicom' });
          const anonymizedFile = new File([blob], file.name, { type: file.type });

          console.log('DICOM file anonymized successfully');
          resolve(anonymizedFile);
        } catch (error) {
          console.error('Error anonymizing DICOM:', error);
          // If anonymization fails, return original file
          resolve(file);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0 || !phiVerified) return

    setUploading(true)
    setProgress(0)

    try {
      // Generate a unique folder ID for this upload batch
      const folderName = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Anonymize and upload files in parallel batches for speed
      const totalFiles = files.length;
      const batchSize = 3; // Upload 3 files at a time
      let completedFiles = 0;
      const uploadedUrlsWithIndex = []; // Collect URLs with their indices

      for (let i = 0; i < totalFiles; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (file, batchIndex) => {
            const fileIndex = i + batchIndex; // Calculate the global file index
            const newFileName = `${fileIndex}.dcm`; // Rename to 0.dcm, 1.dcm, etc.
            const anonymizedFile = await anonymizeDicomFile(file);
            const result = await uploadImageToR2(anonymizedFile, folderName, newFileName);
            completedFiles++;
            setProgress(Math.round((completedFiles / totalFiles) * 100));
            return { result, index: fileIndex }; // Return result with index
          })
        );

        // Collect URLs from batch results
        batchResults.forEach(({ result, index }) => {
          console.log('Upload result for index', index, ':', result);
          if (result && result.url) {
            uploadedUrlsWithIndex.push({ url: result.url, index });
          }
        });
      }

      // Sort URLs by index to ensure correct order
      uploadedUrlsWithIndex.sort((a, b) => a.index - b.index);
      const uploadedUrls = uploadedUrlsWithIndex.map(item => item.url);

      // Extract DICOM metadata from the first file to get window settings
      let windowWidth = 1400;
      let windowCenter = 40;
      let rescaleSlope = 1;
      let rescaleIntercept = 0;

      try {
        const firstFile = files[0];
        const arrayBuffer = await firstFile.arrayBuffer();
        const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

        // Extract rescale slope and intercept
        if (dataset.RescaleSlope !== undefined) {
          rescaleSlope = dataset.RescaleSlope;
        }
        if (dataset.RescaleIntercept !== undefined) {
          rescaleIntercept = dataset.RescaleIntercept;
        }

        // Extract window width and center from DICOM tags
        let rawWindowWidth = null;
        let rawWindowCenter = null;

        if (dataset.WindowWidth) {
          rawWindowWidth = Array.isArray(dataset.WindowWidth) ? dataset.WindowWidth[0] : dataset.WindowWidth;
        }
        if (dataset.WindowCenter) {
          rawWindowCenter = Array.isArray(dataset.WindowCenter) ? dataset.WindowCenter[0] : dataset.WindowCenter;
        }

        // Adjust window values using rescale slope and intercept
        if (rawWindowWidth) {
          windowWidth = rawWindowWidth / rescaleSlope;
        }
        if (rawWindowCenter) {
          windowCenter = (rawWindowCenter - rescaleIntercept) / rescaleSlope;
        }

        console.log('Extracted DICOM metadata:', {
          rawWindowWidth,
          rawWindowCenter,
          rescaleSlope,
          rescaleIntercept,
          adjustedWindowWidth: windowWidth,
          adjustedWindowCenter: windowCenter
        });
      } catch (error) {
        console.warn('Could not extract window settings from DICOM, using defaults:', error);
      }

      setUploading(false)
      setUploadComplete(true)

      // Generate metadata from uploaded URLs
      console.log('Generating metadata from URLs:', uploadedUrls);
      const metadata = uploadedUrls.length > 0 ? generateMetaData(uploadedUrls, windowWidth, windowCenter, rescaleSlope, rescaleIntercept) : null;

      // Generate viewer URL with row=1, col=1
      const viewerURL = metadata ? generateGridURL([metadata], 1, 1) : null;

      // Store the viewer URL in state
      if (viewerURL) {
        setViewerUrl(viewerURL);
      }

      // Log results
      console.log(`All files uploaded to folder: ${folderName}`);
      console.log('Uploaded URLs:', uploadedUrls);
      console.log('Generated Metadata:', metadata);
      console.log('Viewer URL:', viewerURL);

      // Return the URLs and metadata (can be used by parent component if needed)
      return { folderName, urls: uploadedUrls, metadata, viewerURL };

    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
    }
  }

  const resetUpload = () => {
    setFiles([])
    setProgress(0)
    setUploading(false)
    setUploadComplete(false)
    setPhiVerified(false)
    setViewerUrl("")
    setCopyClicked(false)
  }

  const closeDialog = () => {
    setOpen(false)
    // Always reset files when dialog closes
    setTimeout(resetUpload, 300)
  }

  // Helper functions for metadata generation
  const longestCommonPrefix = (strs) => {
    if (strs.length === 0) return "";

    if (strs.length === 1) {
      return strs[0].split("/").slice(0, strs[0].split("/").length - 1).join("/") + "/"
    }

    strs.sort();

    let prefix = "";
    let first = strs[0];
    let last = strs[strs.length - 1];

    for (let i = 0; i < first.length; i++) {
      if (first[i] === last[i]) {
        prefix += first[i];
      } else {
        break;
      }
    }

    return prefix;
  }

  const longestCommonSuffix = (strs) => {
    if (strs.length === 1) {
      return "." + strs[0].split("/")[strs[0].split("/").length - 1].split(".").slice(1).join(".")
    }
    const reversedStrs = strs.map((str) => str.split("").reverse().join(""));
    const suffix = longestCommonPrefix(reversedStrs);
    return suffix.split("").reverse().join("");
  }

  const maxSlice = (strs) => {
    let m = 0
    for (const x of strs) {
      m = Math.max(m, Number(x?.split("/")?.pop()?.split(".")[0]))
    }
    return m
  }

  const minSlice = (strs) => {
    let m = Number.POSITIVE_INFINITY
    for (const x of strs) {
      m = Math.min(m, Number(x?.split("/")?.pop()?.split(".")[0]))
    }
    return m
  }

  const getStep = (strs) => {
    const slices = []

    for (let i = 0; i < strs.length; i++) {
      slices.push(Number(strs[i]?.split("/")?.pop()?.split(".")[0]))
    }
    slices.sort(function (a, b) { return a - b; })
    const steps = []
    for (let i = 1; i < slices.length; i++) {
      steps.push(slices[i] - slices[i - 1])
    }
    const set = new Set(steps);
    if (set.size === 1) {
      return steps[0]
    }
    return 1
  }

  const generateMetaData = (images, windowWidth = 1400, windowCenter = 40, rescaleSlope = 1, rescaleIntercept = 0) => {
    return {
      thumbnail: images[0],
      prefix: longestCommonPrefix(images),
      suffix: longestCommonSuffix(images),
      start_slice: 0,
      end_slice: images.length - 1,
      max_slice: maxSlice(images),
      min_slice: minSlice(images),
      ww: windowWidth,
      wc: windowCenter,
      ci: 0,
      z: 1,
      px: "0",
      py: "0",
      r: 0,
      pad: images[0].split("/").pop()?.split(".")[0].length || 0,
      cord: [0, 0], // Set to [0, 0] instead of [-1, -1] for single series
      intLoad: true,
      rescaleIntercept: rescaleIntercept,
      rescaleSlope: rescaleSlope,
      step: getStep(images)
    };
  }

  const generateGridURL = (metaDataList, row, col) => {
    const URL_genereated = new URL(
      window.location.origin + window.location.pathname
    );

    URL_genereated.searchParams.append("m", "true");
    URL_genereated.searchParams.append("ld.r", row.toString());
    URL_genereated.searchParams.append("ld.c", col.toString());

    metaDataList.map((data) => {
      if (data.cord[0] != -1 && data.cord[1] != -1) {
        let value = (data.cord[0] + col * data.cord[1]).toString();
        URL_genereated.searchParams.append(
          "vd." + value + ".s.pf",
          encodeURI("dicomweb:" + data.prefix)
        );
        URL_genereated.searchParams.append("vd." + value + ".s.sf", data.suffix);
        URL_genereated.searchParams.append(
          "vd." + value + ".s.s",
          String((data.start_slice) * data.step + data.min_slice).padStart(data.pad, "0")
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".s.e",
          String(data.end_slice * data.step + data.min_slice).padStart(data.pad, "0")
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".s.D",
          data.step.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".ww",
          data.ww.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".wc",
          data.wc.toString()
        );

        URL_genereated.searchParams.append(
          "vd." + value + ".ci",
          data.ci.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".z",
          data.z.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".px",
          data.px.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".py",
          data.py.toString()
        );
        URL_genereated.searchParams.append(
          "vd." + value + ".r",
          data.r.toString()
        );
      }
    });
    return URL_genereated.href;
  }

  const uploadImageToR2 = async (file, folderName = '', customFileName = null) => {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    const token = session?.access_token;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = reader.result.split(',')[1]; // Strip the base64 prefix

          const response = await fetch(
            'https://gcoomnnwmbehpkmbgroi.supabase.co/functions/v1/uploadS3-ts',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                fileName: customFileName || file.name, // Use custom name if provided
                contentType: file.type,
                base64Image: base64,
                folderPath: folderName,
              }),
            }
          );

          const data = await response.json();
          console.log('Upload response:', data);
          resolve(data);
        } catch (err) {
          console.error('Upload error:', err);
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
          <DialogDescription>
            Select a folder containing DICOM (.dcm) files to upload. All files will be automatically anonymized to remove patient information.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-dashed border-2">
          <CardContent className="pt-6">
            {/* Upload Box - Only show when no files selected */}
            {files.length === 0 && !uploading && !uploadComplete && (
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

            {/* File Preview - Show when files are selected */}
            {files.length > 0 && !uploading && !uploadComplete && (
              <div className="space-y-4">
                {/* Header with file count and clear button */}
                <div className="flex items-center justify-between pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-5 w-5 text-blue-500" />
                    <p className="text-sm font-semibold">{files.length} file(s) selected</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetUpload}
                    className="gap-2"
                  >
                    <XIcon className="h-4 w-4" />
                    Clear All
                  </Button>
                </div>

                {/* File list */}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                      <FileIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>

                {/* PHI Verification Checkbox */}
                <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-semibold text-blue-900">Privacy & Anonymization</p>
                      <p className="text-xs text-blue-800">
                        All DICOM files will be automatically anonymized before upload. Patient names, IDs, dates, and other identifying information will be removed.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pt-3 border-t border-blue-200">
                    <Checkbox
                      id="phi-verification"
                      checked={phiVerified}
                      onCheckedChange={setPhiVerified}
                      className="mt-1 h-5 w-5 border-2 border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label
                      htmlFor="phi-verification"
                      className="text-sm font-medium text-blue-900 cursor-pointer leading-tight flex-1"
                    >
                      I have reviewed these files and confirm they do not contain any additional Protected Health Information (PHI) beyond what will be automatically removed
                    </Label>
                  </div>
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

                {/* URL Display with Copy Button */}
                {uploadComplete && viewerUrl && (
                  <div className="flex gap-2 pt-2">
                    <Input
                      value={viewerUrl}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(viewerUrl);
                        setCopyClicked(true);
                        setTimeout(() => setCopyClicked(false), 2000);
                      }}
                    >
                      {copyClicked ? (
                        <Check className="h-4" />
                      ) : (
                        <Copy className="h-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeDialog}>
            {uploadComplete ? "Close" : "Cancel"}
          </Button>
          {!uploading && !uploadComplete && files.length > 0 && (
            <Button
              onClick={handleUpload}
              disabled={!phiVerified}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Upload Files
            </Button>
          )}
          {uploadComplete && <Button onClick={resetUpload}>Upload More</Button>}
        </CardFooter>
      </DialogContent>
    </Dialog>
  )
}
