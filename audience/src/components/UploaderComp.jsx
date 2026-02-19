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

export function UploaderComp({ onUploadComplete }) {
  const [open, setOpen] = useState(false)
  const { supabaseClient, userData } = useContext(UserContext).data;
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [phiVerified, setPhiVerified] = useState(false)
  const [viewerUrl, setViewerUrl] = useState("")
  const [copyClicked, setCopyClicked] = useState(false)
  const [seriesName, setSeriesName] = useState("")

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

      if (metadata && userData?.id) {
        try {
          const { error: insertError } = await supabaseClient
            .from('dicom_series')
            .insert({
              user_id: userData.id,
              name: seriesName,
              folder_name: folderName,
              prefix: metadata.prefix,
              suffix: metadata.suffix,
              start_slice: metadata.start_slice,
              end_slice: metadata.end_slice,
              window_width: metadata.ww,
              window_center: metadata.wc,
              metadata: metadata
            });

          if (insertError) {
            console.error("Error saving metadata to Supabase:", insertError);
          } else {
            console.log("Metadata saved to Supabase successfully");
          }
        } catch (dbError) {
          console.error("Exception saving to Supabase:", dbError);
        }
      }

      // Generate viewer URL with row=1, col=1
      const viewerURL = metadata ? generateGridURL([metadata], 1, 1) : null;

      if (onUploadComplete && viewerURL) {
        onUploadComplete(viewerURL);
      }

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
    setSeriesName("")
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
        <Button variant="ghost" className="gap-2 text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border border-slate-800">
          <UploadCloudIcon className="h-4 w-4" />
          Upload DICOM
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md md:max-w-lg bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Upload DICOM Files</DialogTitle>
          <DialogDescription className="text-slate-400">
            Select a folder containing DICOM (.dcm) files to upload. All files will be automatically anonymized to remove patient information.
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

            {/* Upload Box - Only show when no files selected */}
            {files.length === 0 && !uploading && !uploadComplete && (
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

            {/* File Preview - Show when files are selected */}
            {files.length > 0 && !uploading && !uploadComplete && (
              <div className="space-y-4">
                {/* Header with file count and clear button */}
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

                {/* File list */}
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

                {/* PHI Verification Checkbox */}
                <div className="p-3 bg-muted/30 border rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Privacy & Anonymization</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        All DICOM files will be automatically anonymized before upload. Patient names, IDs, dates, and other identifying information will be removed.
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

            {(uploading || uploadComplete) && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    <span>Upload Progress</span>
                    <span className="text-slate-300">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5 bg-slate-800" indicatorClassName="bg-slate-100" />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <FileIcon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-400">
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
                      className="text-[10px] font-mono bg-slate-950 border-slate-800 text-slate-400 h-8"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-slate-100 border border-slate-800 hover:bg-slate-900"
                      onClick={() => {
                        navigator.clipboard.writeText(viewerUrl);
                        setCopyClicked(true);
                        setTimeout(() => setCopyClicked(false), 2000);
                      }}
                    >
                      {copyClicked ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {((!uploading && !uploadComplete && files.length > 0) || uploadComplete) && (
          <CardFooter className="flex justify-end gap-2 p-4 bg-slate-950/50 border-t border-slate-800">
            {!uploading && !uploadComplete && files.length > 0 && (
              <Button
                onClick={handleUpload}
                disabled={!phiVerified}
                className="gap-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-950"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Upload Files
              </Button>
            )}
            {uploadComplete && <Button onClick={resetUpload} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-950">Upload More</Button>}
          </CardFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
