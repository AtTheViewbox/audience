import * as dcmjs from "dcmjs";

export async function anonymizeDicomFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
        const dataset = dicomData.dict;

        delete dataset["00100010"];
        delete dataset["00100020"];
        delete dataset["00100030"];
        delete dataset["00100040"];
        delete dataset["00101010"];
        delete dataset["00101020"];
        delete dataset["00101030"];
        delete dataset["00102160"];
        delete dataset["001021B0"];
        delete dataset["00104000"];

        const outputBuffer = dicomData.write();
        const blob = new Blob([outputBuffer], { type: "application/dicom" });
        resolve(new File([blob], file.name, { type: file.type || "application/dicom" }));
      } catch (error) {
        console.error("Error anonymizing DICOM:", error);
        resolve(file);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

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
  const anonymizedFiles = [];
  for (let i = 0; i < files.length; i++) {
    anonymizedFiles.push(await anonymizeDicomFile(files[i]));
    onProgress?.(Math.round(((i + 1) / files.length) * 100));
  }

  const localBlobUrls = anonymizedFiles.map((file) => URL.createObjectURL(file));
  const { windowWidth, windowCenter, rescaleSlope, rescaleIntercept } =
    await extractDicomWindowSettings(anonymizedFiles[0]);

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
    label: seriesName || `Local upload ${new Date().toLocaleDateString()}`,
    localFiles: anonymizedFiles,
    localBlobUrls,
    prefix: "",
    suffix: "",
    cord: [-1, -1],
  };
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

  const folderName = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const uploadedUrlsWithIndex = [];

  for (let i = 0; i < draft.localFiles.length; i++) {
    const result = await uploadImageToR2(
      supabaseClient,
      draft.localFiles[i],
      folderName,
      `${i}.dcm`
    );
    uploadedUrlsWithIndex.push({ url: result.url, index: i });
    onProgress?.(Math.round(((i + 1) / draft.localFiles.length) * 100));
  }

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
    start_slice: draft.start_slice,
    end_slice: draft.end_slice,
    ci: draft.ci,
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
    localFiles: undefined,
    localBlobUrls: undefined,
  };
}
