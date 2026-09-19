import { cl } from "../context/SupabaseClient.jsx";

export const DICOM_CDN = "https://dicom.attheviewbox.dev";
const REFRESH_SKEW_SEC = 120;

let accessToken = null;
let accessExp = 0;
let inflight = null;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function jwtExp(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const data = JSON.parse(atob(padded + pad));
    return Number(data?.exp) || 0;
  } catch {
    return 0;
  }
}

export function getR2AccessToken() {
  if (!accessToken || nowSec() >= accessExp - REFRESH_SKEW_SEC) return null;
  return accessToken;
}

export function clearR2AccessToken() {
  accessToken = null;
  accessExp = 0;
}

export async function ensureR2AccessToken() {
  const current = getR2AccessToken();
  if (current) return current;
  if (!inflight) {
    inflight = (async () => {
      const { data: { session } } = await cl.auth.getSession();
      const jwt = session?.access_token;
      if (!jwt) return null;
      accessToken = jwt;
      accessExp = jwtExp(jwt) || Number(session.expires_at) || nowSec() + 3600;
      return accessToken;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function isDicomCdnUrl(url) {
  const raw = String(url || "").replace(/^(dicomweb:|wadouri:)/, "");
  return raw.startsWith(DICOM_CDN);
}
