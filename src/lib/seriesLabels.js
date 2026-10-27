import dicomParser from "dicom-parser";
import { extractSearchString } from "./answerKeyCase.js";
import { seriesChoicesFromStudy } from "./playlist.js";
import { rewriteImageUrl } from "./inputParser.ts";
import { DICOM_CDN, clearR2AccessToken, ensureR2AccessToken, getR2AccessToken } from "./r2Access.js";

function fullyDecode(value) {
  let text = String(value || "");
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return text;
}

function firstSliceUrl(urlParams, index) {
  const params = new URLSearchParams(extractSearchString(urlParams));
  let prefix = fullyDecode(params.get(`vd.${index}.s.pf`) || "");
  prefix = prefix.replace(/^(dicomweb:|wadouri:|wadors:)/, "");
  const suffix = params.get(`vd.${index}.s.sf`) || ".dcm";
  const start = params.get(`vd.${index}.s.s`) || "0";
  if (!prefix) return "";
  return rewriteImageUrl(`${prefix}${start}${suffix}`);
}

async function maybeGunzip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  if (typeof DecompressionStream === "undefined") return bytes;
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchDicomHeader(url) {
  const cdnUrl = String(url || "").replace(/^(dicomweb:|wadouri:|wadors:)/, "");
  const fetchUrl =
    import.meta.env.DEV && cdnUrl.startsWith(DICOM_CDN)
      ? `/dicom-cdn${cdnUrl.slice(DICOM_CDN.length)}`
      : cdnUrl;

  const fetchWithToken = async () => {
    const token = (await ensureR2AccessToken()) || getR2AccessToken();
    if (!token) throw new Error("DICOM request failed (waiting for sign-in)");
    return fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
  };

  let response = await fetchWithToken();
  if (response.status === 401 || response.status === 403) {
    clearR2AccessToken();
    response = await fetchWithToken();
  }
  if (!response.ok) return null;
  return maybeGunzip(await response.arrayBuffer());
}

function dicomText(dataSet, tag) {
  const raw = dataSet.string(tag);
  if (!raw) return "";
  return raw.replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

/** Series description, then protocol name, then study description. */
function descriptionFromBytes(bytes) {
  if (!bytes?.length) return "";
  const dataSet = dicomParser.parseDicom(bytes);
  return (
    dicomText(dataSet, "x0008103e") ||
    dicomText(dataSet, "x00181030") ||
    dicomText(dataSet, "x00081030")
  );
}

/** Map of series prefix key to the name stored in the DICOM header. */
export async function loadSeriesDescriptions(urlParamsList) {
  const jobs = [];
  const seen = new Set();
  for (const urlParams of urlParamsList || []) {
    for (const choice of seriesChoicesFromStudy(urlParams)) {
      if (!choice.prefixKey || seen.has(choice.prefixKey)) continue;
      seen.add(choice.prefixKey);
      const url = firstSliceUrl(urlParams, choice.index);
      if (!url) continue;
      jobs.push({ key: choice.prefixKey, url });
    }
  }

  const names = {};
  await Promise.all(jobs.map(async (job) => {
    try {
      const bytes = await fetchDicomHeader(job.url);
      const name = descriptionFromBytes(bytes);
      if (name) names[job.key] = name;
    } catch (error) {
      console.warn("Could not read series name", job.url, error);
    }
  }));
  return names;
}

export function isPlaceholderSeriesName(name) {
  return !String(name || "").trim() || /^series\s+\d+$/i.test(String(name).trim());
}
