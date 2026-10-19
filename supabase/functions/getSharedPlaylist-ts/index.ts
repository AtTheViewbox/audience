import { createClient } from "npm:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const { playlistId, token } = await req.json().catch(() => ({}));
    if (!UUID_RE.test(String(playlistId || "")) || !UUID_RE.test(String(token || ""))) {
      return json(req, { error: "Not found" }, 404);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data, error } = await admin
      .from("playlists")
      .select(
        "id, name, description, playlist_items ( id, sort_order, label, study_id, studies ( id, name, description, url_params ) )",
      )
      .eq("id", playlistId)
      .eq("share_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return json(req, { error: "Not found" }, 404);

    return json(req, { playlist: data });
  } catch (error) {
    console.error("getSharedPlaylist failed", error?.message);
    return json(req, { error: "Could not load case" }, 500);
  }
});
