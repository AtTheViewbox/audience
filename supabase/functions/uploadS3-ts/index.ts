import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { createClient } from "npm:@supabase/supabase-js@2";

const FOLDER_RE = /^upload_[A-Za-z0-9_]+$/;
const FILE_RE = /^[A-Za-z0-9._-]+\.(dcm|dcm\.gz)$/i;

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

    const { fileName, contentType, base64Image, folderPath } = await req.json();
    if (!FOLDER_RE.test(String(folderPath || ""))) {
      return json(req, { success: false, error: "Invalid folder path" }, 400);
    }
    if (!FILE_RE.test(String(fileName || ""))) {
      return json(req, { success: false, error: "Invalid file name" }, 400);
    }
    if (!base64Image) {
      return json(req, { success: false, error: "Missing file" }, 400);
    }

    const buffer = Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
    const isCompressed = String(fileName).toLowerCase().endsWith(".gz") ||
      contentType === "application/gzip";
    const fullPath = `${folderPath}/${fileName}`;

    await s3.send(new PutObjectCommand({
      Bucket: "studies",
      Key: fullPath,
      Body: buffer,
      ContentType: isCompressed ? "application/gzip" : (contentType || "application/dicom"),
      CacheControl: "private, no-store",
      Metadata: {
        "x-owner-id": user.id,
        "x-compressed": isCompressed ? "true" : "false",
      },
    }));

    return json(req, {
      success: true,
      url: `${Deno.env.get("R2_PUBLIC_URL")}/${fullPath}`,
      folder: folderPath,
      fileName,
      compressed: isCompressed,
      finalSize: buffer.length,
    });
  } catch (error) {
    console.error("Upload error");
    return json(req, { success: false, error: error?.message || "Upload failed" }, 500);
  }
});
