import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../context/SupabaseClient.jsx";

const NETWORK_HINTS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "err_connection",
  "err_name_not_resolved",
  "err_blocked",
  "err_failed",
  "err_timed_out",
  "timed out",
  "timeout",
  "abort",
  "offline",
];

export function isLikelyBlockedNetworkError(error) {
  if (!error) return false;
  const name = String(error.name || "");
  if (
    name === "TypeError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "AuthRetryableFetchError"
  ) {
    return true;
  }
  const msg = String(error.message || error.error_description || error).toLowerCase();
  return NETWORK_HINTS.some((hint) => msg.includes(hint));
}

export function formatConnectivityError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "This device looks offline.";
  }
  const msg = String(error?.message || error?.error_description || "").trim();
  return msg || "The connection to our server was blocked or timed out.";
}

/** Add `?supabase_error=1` to the URL to preview the blocked-network notice. */
export function shouldSimulateSupabaseError(
  search = typeof window !== "undefined" ? window.location.search : ""
) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("supabase_error");
  return value === "1" || value === "true";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/** True when supabase.co answers at all (any HTTP status). False when the network blocks it. */
export async function probeSupabase(timeoutMs = 8000) {
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/health`,
      {
        method: "GET",
        headers: { apikey: SUPABASE_ANON_KEY },
        mode: "cors",
      },
      timeoutMs
    );
    if (!res.ok) {
      return {
        ok: false,
        error: new Error(`Server returned ${res.status}`),
      };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Connection timed out");
      timeout.name = "TimeoutError";
      return { ok: false, error: timeout };
    }
    return { ok: false, error };
  }
}
