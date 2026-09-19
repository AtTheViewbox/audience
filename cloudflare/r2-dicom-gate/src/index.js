/**
 * Gate for dicom.attheviewbox.dev.
 * Bind R2 bucket `studies` as STUDIES and set secret R2_ACCESS_SIGNING_SECRET
 * to the same value as the Supabase signR2-ts function.
 *
 * After this worker is live, disable the bucket's r2.dev public URL.
 */

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith("attheviewbox.dev") ||
      hostname.endsWith("attheviewbox.com") ||
      hostname.endsWith("attheviewbox.pages.dev")
    );
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = isAllowedOrigin(origin) ? origin : "https://attheviewbox.dev";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function encodeBase64Url(value) {
  const raw = typeof value === "string" ? value : String.fromCharCode(...value);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return encodeBase64Url(new Uint8Array(sig));
}

async function verifyViewerToken(secret, token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = await hmacSign(secret, payload);
  if (expected.length !== sig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (mismatch) return null;
  try {
    const data = JSON.parse(decodeBase64Url(payload));
    if (Number(data?.exp) <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

const jwtCache = new Map();

async function verifySupabaseJwt(token, env) {
  if (!token || String(token).split(".").length < 3) return false;
  const cached = jwtCache.get(token);
  if (cached && cached > Date.now()) return true;
  const supabaseUrl = env.SUPABASE_URL || "https://gcoomnnwmbehpkmbgroi.supabase.co";
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!anonKey) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });
  if (!response.ok) return false;
  jwtCache.set(token, Date.now() + 5 * 60 * 1000);
  return true;
}

async function authorizeToken(env, request, url) {
  const header = request.headers.get("Authorization") || "";
  const token = url.searchParams.get("t") || header.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (env.R2_ACCESS_SIGNING_SECRET) {
    const claims = await verifyViewerToken(env.R2_ACCESS_SIGNING_SECRET, token);
    if (claims) return true;
  }
  return verifySupabaseJwt(token, env);
}

function objectKey(pathname) {
  return decodeURIComponent(pathname.replace(/^\/+/, ""));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const key = objectKey(url.pathname);
    if (!key || key.includes("..")) {
      return new Response("Not found", { status: 404, headers: corsHeaders(request) });
    }

    const allowed = await authorizeToken(env, request, url);
    if (!allowed) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders(request) });
    }

    const object = await env.STUDIES.get(key);
    if (!object) {
      return new Response("Not found", { status: 404, headers: corsHeaders(request) });
    }

    const headers = new Headers(corsHeaders(request));
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "same-origin");
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    if (object.size != null) headers.set("Content-Length", String(object.size));

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    return new Response(object.body, { status: 200, headers });
  },
};
