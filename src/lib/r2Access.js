import { SUPABASE_URL, cl } from "../context/SupabaseClient.jsx";

export const DICOM_CDN = "https://dicom.attheviewbox.dev";
const SIGN_URL = `${SUPABASE_URL}/functions/v1/signR2-ts`;
const REFRESH_SKEW_SEC = 120;

let accessToken = null;
let accessExp = 0;
let inflight = null;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function getR2AccessToken() {
  if (!accessToken || nowSec() >= accessExp - REFRESH_SKEW_SEC) return null;
  return accessToken;
}

export function clearR2AccessToken() {
  accessToken = null;
  accessExp = 0;
}

function useSessionJwt(session) {
  const jwt = session?.access_token;
  if (!jwt) return null;
  accessToken = jwt;
  accessExp = Number(session.expires_at) || nowSec() + 3600;
  return accessToken;
}

async function fetchR2AccessToken() {
  const {
    data: { session },
  } = await cl.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) return null;

  try {
    const response = await fetch(SIGN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({}),
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data?.token && data?.exp) {
        accessToken = data.token;
        accessExp = Number(data.exp);
        return accessToken;
      }
    }
  } catch (_) {
    /* fall through to the guest session JWT */
  }

  return useSessionJwt(session);
}

export async function ensureR2AccessToken() {
  const current = getR2AccessToken();
  if (current) return current;
  if (!inflight) {
    inflight = fetchR2AccessToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function isDicomCdnUrl(url) {
  const raw = String(url || "").replace(/^(dicomweb:|wadouri:)/, "");
  return raw.startsWith(DICOM_CDN);
}

export function attachR2AccessToken(url) {
  const token = getR2AccessToken();
  if (!token || !url) return url;

  const schemeMatch = String(url).match(/^(dicomweb:|wadouri:)/);
  const scheme = schemeMatch ? schemeMatch[0] : "";
  const rawUrl = scheme ? url.slice(scheme.length) : url;
  if (!rawUrl.startsWith(DICOM_CDN) && !/^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i.test(rawUrl)) {
    return url;
  }

  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("t", token);
    return scheme + parsed.toString();
  } catch {
    const join = rawUrl.includes("?") ? "&" : "?";
    return `${scheme}${rawUrl}${join}t=${encodeURIComponent(token)}`;
  }
}
