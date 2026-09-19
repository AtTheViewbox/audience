const STATIC_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "https://attheviewbox.dev",
  "https://www.attheviewbox.dev",
  "https://attheviewbox.com",
  "https://www.attheviewbox.com",
  "https://attheviewbox.pages.dev",
  "https://attheviewbox.github.io",
]);

export function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (STATIC_ORIGINS.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".attheviewbox.dev") ||
      hostname.endsWith(".attheviewbox.com") ||
      hostname.endsWith(".attheviewbox.pages.dev")
    );
  } catch {
    return false;
  }
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = isAllowedOrigin(origin) ? origin : "https://attheviewbox.dev";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

export function encodeBase64Url(bytes: Uint8Array | string) {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

export async function hmacSign(secret: string, message: string) {
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

export async function createViewerToken(secret: string, ttlSec = 2 * 60 * 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = encodeBase64Url(JSON.stringify({ v: 1, exp }));
  const sig = await hmacSign(secret, payload);
  return { token: `${payload}.${sig}`, exp };
}

export async function verifyViewerToken(secret: string, token: string) {
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
