import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function isAllowedOrigin(origin: string) {
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

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://attheviewbox.dev",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function encodeBase64Url(value: string | Uint8Array) {
  const raw = typeof value === "string" ? value : String.fromCharCode(...value);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSign(secret: string, message: string) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  try {
    const secret = Deno.env.get("R2_ACCESS_SIGNING_SECRET");
    if (!secret) {
      return json(req, { success: false, error: "Signing is not configured" }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json(req, { success: false, error: "Unauthorized" }, 401);
    }

    const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
    const payload = encodeBase64Url(JSON.stringify({ v: 1, exp, sub: user.id }));
    const sig = await hmacSign(secret, payload);

    return json(req, { success: true, token: `${payload}.${sig}`, exp });
  } catch (error) {
    console.error("Sign error");
    return json(req, { success: false, error: error?.message || "Sign failed" }, 500);
  }
});
