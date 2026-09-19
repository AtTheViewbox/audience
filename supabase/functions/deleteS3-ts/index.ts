import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "npm:@aws-sdk/client-s3";
import { createClient } from "npm:@supabase/supabase-js@2";

const FOLDER_RE = /^upload_[A-Za-z0-9_]+$/;

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://aaec8d317a99296373b156ed53b1c389.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY"),
  },
});

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  try {
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

    const { folderPath } = await req.json();
    if (!FOLDER_RE.test(String(folderPath || ""))) {
      return json(req, { success: false, error: "Invalid folder path" }, 400);
    }

    const { data: series, error: seriesError } = await supabase
      .from("dicom_series")
      .select("id, folder_name")
      .eq("folder_name", folderPath)
      .eq("user_id", user.id)
      .maybeSingle();

    if (seriesError) throw seriesError;
    if (!series) {
      return json(req, { success: false, error: "Series not found or not owned by you" }, 403);
    }

    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const listed = await s3.send(new ListObjectsV2Command({
        Bucket: "studies",
        Prefix: `${folderPath}/`,
        ContinuationToken: continuationToken,
      }));
      const objects = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key }));

      if (objects.length) {
        await s3.send(new DeleteObjectsCommand({
          Bucket: "studies",
          Delete: { Objects: objects, Quiet: true },
        }));
        deleted += objects.length;
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    return json(req, { success: true, folder: folderPath, deleted });
  } catch (error) {
    console.error("Delete error");
    return json(req, { success: false, error: error?.message || "Delete failed" }, 500);
  }
});
