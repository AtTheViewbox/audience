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

function rememberSession(session) {
  const jwt = session?.access_token;
  if (!jwt) return null;
  accessToken = jwt;
  accessExp = jwtExp(jwt) || Number(session.expires_at) || nowSec() + 3600;
  return accessToken;
}

/** Guest sign-in is async; image loads must wait instead of fetching unauthenticated. */
async function waitForAuthSession(timeoutMs = 8000) {
  const { data: existing } = await cl.auth.getSession();
  if (existing.session?.access_token) return existing.session;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session || null);
    };

    const { data: { subscription } } = cl.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish(session);
    });

    const timer = setTimeout(() => finish(null), timeoutMs);
    cl.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) finish(data.session);
    });
  });
}

export async function ensureR2AccessToken() {
  const current = getR2AccessToken();
  if (current) return current;
  if (!inflight) {
    inflight = (async () => {
      let session = (await cl.auth.getSession()).data.session;
      if (!session?.access_token) {
        session = await waitForAuthSession();
      }
      if (!session?.access_token) {
        const { data, error } = await cl.auth.signInAnonymously();
        if (!error) {
          session = data?.session ?? (await cl.auth.getSession()).data.session;
        }
      }
      return rememberSession(session);
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
