import * as dcmjs from "dcmjs";
import { anonymizeDicomFile, createAnonymizerSession } from "./dicomAnonymizer.js";
import { concurrentExecutor } from "./utils";

export { anonymizeDicomFile, createAnonymizerSession };

export async function extractDicomWindowSettings(file) {
  let windowWidth = 1400;
  let windowCenter = 40;
  let rescaleSlope = 1;
  let rescaleIntercept = 0;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);

    if (dataset.RescaleSlope !== undefined) rescaleSlope = dataset.RescaleSlope;
    if (dataset.RescaleIntercept !== undefined) rescaleIntercept = dataset.RescaleIntercept;

    let rawWindowWidth = null;
    let rawWindowCenter = null;

    if (dataset.WindowWidth) {
      rawWindowWidth = Array.isArray(dataset.WindowWidth)
        ? dataset.WindowWidth[0]
        : dataset.WindowWidth;
    }
    if (dataset.WindowCenter) {
      rawWindowCenter = Array.isArray(dataset.WindowCenter)
        ? dataset.WindowCenter[0]
        : dataset.WindowCenter;
    }

    if (rawWindowWidth !== null) windowWidth = rawWindowWidth / rescaleSlope;
    if (rawWindowCenter !== null) {
      windowCenter = (rawWindowCenter - rescaleIntercept) / rescaleSlope;
    }
  } catch (error) {
    console.warn("Could not extract window settings from DICOM, using defaults:", error);
  }

  return { windowWidth, windowCenter, rescaleSlope, rescaleIntercept };
}

function dicomText(value) {
  if (value == null) return "";
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "")
    .replace(/\0/g, "")
    .replace(/\^/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractDicomNameFields(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    const seriesDescription = dicomText(dataset.SeriesDescription);
    const studyDescription = dicomText(dataset.StudyDescription);
    const protocolName = dicomText(dataset.ProtocolName);
    const modality = dicomText(dataset.Modality);
    const seriesName = seriesDescription || protocolName || studyDescription || modality || "";
    const studyName = studyDescription || seriesName;
    return { seriesName, studyName, seriesDescription, studyDescription, protocolName };
  } catch (error) {
    console.warn("Could not extract DICOM name fields:", error);
    return { seriesName: "", studyName: "", seriesDescription: "", studyDescription: "" };
  }
}

function longestCommonPrefix(strs) {
  if (strs.length === 0) return "";
  if (strs.length === 1) {
    return strs[0].split("/").slice(0, strs[0].split("/").length - 1).join("/") + "/";
  }
  const sorted = [...strs].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let prefix = "";
  for (let i = 0; i < first.length; i++) {
    if (first[i] === last[i]) prefix += first[i];
    else break;
  }
  return prefix;
}

function longestCommonSuffix(strs) {
  if (strs.length === 1) {
    return "." + strs[0].split("/").pop().split(".").slice(1).join(".");
  }
  const reversedStrs = strs.map((str) => str.split("").reverse().join(""));
  const suffix = longestCommonPrefix(reversedStrs);
  return suffix.split("").reverse().join("");
}

function maxSlice(strs) {
  let m = 0;
  for (const x of strs) {
    m = Math.max(m, Number(x?.split("/")?.pop()?.split(".")[0]));
  }
  return m;
}

function minSlice(strs) {
  let m = Number.POSITIVE_INFINITY;
  for (const x of strs) {
    m = Math.min(m, Number(x?.split("/")?.pop()?.split(".")[0]));
  }
  return m;
}

function getStep(strs) {
  const slices = strs.map((str) => Number(str?.split("/")?.pop()?.split(".")[0]));
  slices.sort((a, b) => a - b);
  const steps = [];
  for (let i = 1; i < slices.length; i++) steps.push(slices[i] - slices[i - 1]);
  const set = new Set(steps);
  return set.size === 1 ? steps[0] : 1;
}

export function generateMetaDataFromUrls(
  images,
  windowWidth = 1400,
  windowCenter = 40,
  rescaleSlope = 1,
  rescaleIntercept = 0
) {
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
    pad: images[0]?.split("/")?.pop()?.split(".")[0]?.length || 0,
    intLoad: true,
    rescaleIntercept,
    rescaleSlope,
    step: getStep(images),
  };
}

export function revokeDraftBlobUrls(draft) {
  draft?.localBlobUrls?.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      /* ignore */
    }
  });
}

export async function prepareLocalDraftSeries(files, seriesName, onProgress) {
  const nameFields = files[0]
    ? await extractDicomNameFields(files[0])
    : { seriesName: "", studyName: "", seriesDescription: "", studyDescription: "", protocolName: "" };

  const session = createAnonymizerSession();
  const anonymizedFiles = [];
  for (let i = 0; i < files.length; i++) {
    anonymizedFiles.push(await anonymizeDicomFile(files[i], session, `${i}.dcm`));
    onProgress?.(Math.round(((i + 1) / files.length) * 100));
  }

  const localBlobUrls = anonymizedFiles.map((file) => URL.createObjectURL(file));
  const { windowWidth, windowCenter, rescaleSlope, rescaleIntercept } =
    await extractDicomWindowSettings(anonymizedFiles[0]);
  const resolvedName = (seriesName || "").trim() || nameFields.seriesName;

  const pseudoUrls = anonymizedFiles.map((_, index) => `local/${index}.dcm`);
  const metadata = generateMetaDataFromUrls(
    pseudoUrls,
    windowWidth,
    windowCenter,
    rescaleSlope,
    rescaleIntercept
  );

  return {
    ...metadata,
    id: `draft-${Date.now()}`,
    isDraft: true,
    label: resolvedName || `Local upload ${new Date().toLocaleDateString()}`,
    studyName: nameFields.studyDescription || "",
    localFiles: anonymizedFiles,
    localBlobUrls,
    prefix: "",
    suffix: "",
    cord: [-1, -1],
  };
}

async function gzipDicomFile(file, fileName) {
  const baseName = fileName.endsWith(".dcm") ? fileName : `${fileName}.dcm`;
  const gzName = `${baseName}.gz`;
  if (typeof CompressionStream === "undefined") {
    return { file, fileName: baseName };
  }
  try {
    const compressed = file.stream().pipeThrough(new CompressionStream("gzip"));
    const blob = await new Response(compressed).blob();
    return {
      file: new File([blob], gzName, { type: "application/gzip" }),
      fileName: gzName,
    };
  } catch {
    return { file, fileName: baseName };
  }
}

export async function uploadImageToR2(supabaseClient, file, folderName = "", customFileName = null) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        const response = await fetch(
          "https://gcoomnnwmbehpkmbgroi.supabase.co/functions/v1/uploadS3-ts",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              fileName: customFileName || file.name,
              contentType: file.type,
              base64Image: base64,
              folderPath: folderName,
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Upload failed");
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadDraftSeries(
  draft,
  supabaseClient,
  userId,
  seriesName,
  onProgress
) {
  if (!draft?.localFiles?.length) return draft;

  const excluded = new Set(
    (Array.isArray(draft.excluded_slices) ? draft.excluded_slices : []).map(Number)
  );
  const start = Number.isFinite(Number(draft.start_slice)) ? Math.round(Number(draft.start_slice)) : 0;
  const end = Number.isFinite(Number(draft.end_slice))
    ? Math.round(Number(draft.end_slice))
    : draft.localFiles.length - 1;
  const included = [];
  for (let i = Math.max(0, start); i <= Math.min(draft.localFiles.length - 1, end); i++) {
    if (!excluded.has(i)) included.push(i);
  }
  const keep = included.length ? included : [Math.max(0, start)];

  const folderName = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const uploadedUrlsWithIndex = new Array(keep.length);
  let completed = 0;

  await concurrentExecutor(
    keep.map((sourceIndex, k) => ({ sourceIndex, k })),
    4,
    async ({ sourceIndex, k }) => {
      const gz = await gzipDicomFile(draft.localFiles[sourceIndex], `${k}.dcm`);
      const result = await uploadImageToR2(
        supabaseClient,
        gz.file,
        folderName,
        gz.fileName
      );
      uploadedUrlsWithIndex[k] = { url: result.url, index: k };
      completed += 1;
      onProgress?.(Math.round((completed / keep.length) * 100));
    }
  );

  uploadedUrlsWithIndex.sort((a, b) => a.index - b.index);
  const uploadedUrls = uploadedUrlsWithIndex.map((item) => item.url);
  const cloudMeta = generateMetaDataFromUrls(
    uploadedUrls,
    draft.ww,
    draft.wc,
    draft.rescaleSlope,
    draft.rescaleIntercept
  );

  const merged = {
    ...cloudMeta,
    id: draft.id,
    label: draft.label,
    start_slice: 0,
    end_slice: Math.max(0, keep.length - 1),
    ci: Math.max(0, keep.indexOf(Number(draft.ci)) === -1 ? 0 : keep.indexOf(Number(draft.ci))),
    z: draft.z,
    px: draft.px,
    py: draft.py,
    r: draft.r,
    ww: draft.ww,
    wc: draft.wc,
    cord: draft.cord,
    step: draft.step,
    rescaleIntercept: draft.rescaleIntercept,
    rescaleSlope: draft.rescaleSlope,
  };

  if (userId) {
    const { error } = await supabaseClient.from("dicom_series").insert({
      user_id: userId,
      name: seriesName || draft.label,
      folder_name: folderName,
      prefix: merged.prefix,
      suffix: merged.suffix,
      start_slice: merged.start_slice,
      end_slice: merged.end_slice,
      window_width: merged.ww,
      window_center: merged.wc,
      metadata: merged,
    });
    if (error) throw error;
  }

  revokeDraftBlobUrls(draft);

  return {
    ...merged,
    isDraft: false,
    folder_name: folderName,
    localFiles: undefined,
    localBlobUrls: undefined,
  };
}

const UPLOAD_FOLDER_RE = /upload_[A-Za-z0-9_]+/g;
const DELETE_S3_URL = "https://gcoomnnwmbehpkmbgroi.supabase.co/functions/v1/deleteS3-ts";

export function extractUploadFolderName(value) {
  const match = String(value || "").match(UPLOAD_FOLDER_RE);
  return match?.[0] || null;
}

export function extractUploadFolderNames(value) {
  return [...new Set(String(value || "").match(UPLOAD_FOLDER_RE) || [])];
}

export async function countStudiesUsingFolder(supabaseClient, folderName) {
  if (!folderName) return 0;
  const { count, error } = await supabaseClient
    .from("studies")
    .select("id", { count: "exact", head: true })
    .ilike("url_params", `%${folderName}%`);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteR2Folder(supabaseClient, folderName) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Missing user session");

  const response = await fetch(DELETE_S3_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ folderPath: folderName }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Failed to delete Cloudflare files");
  return data;
}

export async function deleteCloudSeries(supabaseClient, series) {
  const folderName = series?.folder_name || extractUploadFolderName(series?.prefix);
  if (folderName) {
    await deleteR2Folder(supabaseClient, folderName);
  }
  if (!series?.id) return;
  const { error } = await supabaseClient.from("dicom_series").delete().eq("id", series.id);
  if (error) throw error;
}

export async function deleteUnusedCloudSeries(supabaseClient, folderNames, excludeStudyId = null) {
  const unique = [...new Set((folderNames || []).filter(Boolean))];
  const removed = [];

  for (const folderName of unique) {
    let query = supabaseClient
      .from("studies")
      .select("id")
      .ilike("url_params", `%${folderName}%`);
    const { data: matches, error: matchError } = await query;
    if (matchError) throw matchError;

    const stillUsed = (matches || []).some((study) => study.id !== excludeStudyId);
    if (stillUsed) continue;

    const { data: series, error: seriesError } = await supabaseClient
      .from("dicom_series")
      .select("id, folder_name, prefix")
      .eq("folder_name", folderName)
      .maybeSingle();
    if (seriesError) throw seriesError;
    if (!series) continue;

    await deleteCloudSeries(supabaseClient, series);
    removed.push(folderName);
  }

  return removed;
}
