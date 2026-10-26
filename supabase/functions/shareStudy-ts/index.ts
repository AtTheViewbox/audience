import { createClient } from "npm:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NOTE_COLS = "kind, boxes, question, answer, label, question_type, options";

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

function appOrigin(req: Request) {
  const origin = req.headers.get("Origin") || "";
  if (
    isAllowedOrigin(origin) &&
    !origin.includes("localhost") &&
    !origin.includes("127.0.0.1")
  ) {
    return origin.replace(/\/$/, "");
  }
  return "https://attheviewbox.dev";
}

function viewerHref(origin: string, urlParams: string, studyId: string, playlistId?: string | null) {
  const params = String(urlParams || "").replace(/^\?/, "");
  const href = `${origin}/?${params}`;
  const extra = [`caseId=${studyId}`];
  if (playlistId) extra.push(`p=${playlistId}`);
  return params ? `${href}&${extra.join("&")}` : `${origin}/?${extra.join("&")}`;
}

/** Same query shape the builder uses for a single series on a 1×1 grid. */
function seriesViewerParams(series: Record<string, unknown>) {
  const meta = (series.metadata && typeof series.metadata === "object"
    ? series.metadata
    : {}) as Record<string, unknown>;
  const prefix = String(series.prefix || meta.prefix || "");
  if (!prefix) return "";
  const suffix = String(series.suffix ?? meta.suffix ?? "");
  const start = Number(series.start_slice ?? meta.start_slice ?? 0);
  const end = Number(series.end_slice ?? meta.end_slice ?? 0);
  const step = Number(meta.step ?? 1) || 1;
  const minSlice = Number(meta.min_slice ?? 0);
  const pad = Number(meta.pad ?? 0);
  const fmt = (value: number) => {
    const text = String(value);
    return pad > 0 ? text.padStart(pad, "0") : text;
  };
  const params = new URLSearchParams();
  params.append("m", "true");
  params.append("ld.r", "1");
  params.append("ld.c", "1");
  params.append("vd.0.s.pf", encodeURI(`wadouri:${prefix}`));
  params.append("vd.0.s.sf", suffix);
  params.append("vd.0.s.s", fmt(start * step + minSlice));
  params.append("vd.0.s.e", fmt(end * step + minSlice));
  params.append("vd.0.s.D", String(step));
  params.append("vd.0.ww", String(meta.ww ?? series.window_width ?? 0));
  params.append("vd.0.wc", String(meta.wc ?? series.window_center ?? 0));
  params.append("vd.0.ci", String(meta.ci ?? 0));
  params.append("vd.0.z", String(meta.z ?? 0));
  params.append("vd.0.px", String(meta.px ?? 0));
  params.append("vd.0.py", String(meta.py ?? 0));
  params.append("vd.0.r", String(meta.r ?? 0));
  return params.toString();
}

async function sendShareEmail({
  to,
  sharerEmail,
  title,
  href,
  kind,
}: {
  to: string;
  sharerEmail: string;
  title: string;
  href: string;
  kind: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return false;

  const from = Deno.env.get("RESEND_FROM") || "AtTheViewBox <noreply@attheviewbox.dev>";
  const subject = `${sharerEmail} shared a ${kind} with you`;
  const text = [
    `${sharerEmail} shared “${title}” with you on AtTheViewBox.`,
    "It is in your viewbox.",
    href,
  ].join("\n\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    console.error("share email failed", response.status);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || user.is_anonymous) {
      return json(req, { error: "Sign in to share" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const studyId = body?.studyId ? String(body.studyId) : "";
    const seriesId = body?.seriesId ? String(body.seriesId) : "";
    const playlistId = body?.playlistId ? String(body.playlistId) : "";
    const targets = [studyId, seriesId, playlistId].filter(Boolean);

    if (!EMAIL_RE.test(email) || email.length > 320) {
      return json(req, { error: "Enter a valid email address" }, 400);
    }
    if (targets.length !== 1) {
      return json(req, { error: "Share one study, series, or case at a time" }, 400);
    }
    if (targets.some((id) => !UUID_RE.test(id))) {
      return json(req, { error: "That item could not be found" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: recipientId, error: lookupError } = await admin.rpc("share_lookup_user", {
      target_email: email,
    });
    if (lookupError) throw lookupError;
    if (!recipientId) {
      return json(req, { error: "No account with that email. They need to sign up first." }, 404);
    }
    if (recipientId === user.id) {
      return json(req, { error: "That email is your own account." }, 400);
    }

    const origin = appOrigin(req);
    let kind = "study";
    let name = "Shared study";
    let count = 1;
    let href = origin;

    if (studyId) {
      const copied = await copyOwnedStudy(userClient, admin, user.id, recipientId, studyId);
      kind = "study";
      name = copied.name;
      href = viewerHref(origin, copied.url_params, copied.id);
    } else if (seriesId) {
      const copied = await copyOwnedSeries(userClient, admin, user.id, recipientId, seriesId);
      kind = "series";
      name = copied.name;
      href = viewerHref(origin, copied.url_params, copied.id);
    } else {
      const copied = await copyOwnedCase(userClient, admin, user.id, recipientId, playlistId);
      kind = "case";
      name = copied.name;
      count = copied.count;
      href = viewerHref(origin, copied.url_params, copied.studyId, copied.playlistId);
    }

    let emailed = false;
    try {
      emailed = await sendShareEmail({
        to: email,
        sharerEmail: user.email || "Someone",
        title: name,
        href,
        kind,
      });
    } catch (emailError) {
      console.error("share email failed", emailError?.message);
    }

    return json(req, { ok: true, emailed, kind, count, name, href });
  } catch (error) {
    console.error("shareStudy failed", error?.message);
    const message = friendlyError(error);
    const status = message === "Could not share"
      ? 500
      : message.startsWith("You can only")
        ? 403
        : 400;
    return json(req, { error: message }, status);
  }
});

function friendlyError(error: { message?: string; code?: string }) {
  const message = error?.message || "";
  if (message.startsWith("You can only") || message.startsWith("This ") || message.startsWith("Add ")) {
    return message;
  }
  return "Could not share";
}

function noteCopies(notes, recipientId: string, studyId: string) {
  return (notes || []).map((row) => ({
    user_id: recipientId,
    study_id: studyId,
    dicom_series_id: null,
    case_url_params: null,
    kind: row.kind,
    boxes: row.boxes,
    question: row.question,
    answer: row.answer,
    label: row.label,
    question_type: row.question_type,
    options: row.options,
  }));
}

async function notesBy(userClient, userId: string, column: "study_id" | "dicom_series_id", ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const grouped = new Map<string, unknown[]>();
  if (!unique.length) return grouped;

  let query = userClient
    .from("series_annotations")
    .select(`${NOTE_COLS}, ${column}`)
    .eq("user_id", userId);
  query = unique.length === 1 ? query.eq(column, unique[0]) : query.in(column, unique);
  const { data, error } = await query;
  if (error) throw error;

  for (const row of data || []) {
    const key = row[column];
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

async function insertStudyCopy(admin, recipientId: string, source, notes) {
  const { data: created, error } = await admin
    .from("studies")
    .insert({
      owner: recipientId,
      name: source.name || "Shared study",
      description: source.description ?? null,
      url_params: source.url_params,
      visibility: "PRIVATE",
    })
    .select("id, name, url_params")
    .single();
  if (error) throw error;

  const rows = noteCopies(notes, recipientId, created.id);
  if (rows.length) {
    const { error: copyError } = await admin.from("series_annotations").insert(rows);
    if (copyError) {
      await admin.from("studies").delete().eq("id", created.id);
      throw copyError;
    }
  }
  return created;
}

async function copyOwnedStudy(userClient, admin, userId: string, recipientId: string, studyId: string) {
  const { data: source, error } = await userClient
    .from("studies")
    .select("id, name, description, url_params")
    .eq("id", studyId)
    .eq("owner", userId)
    .maybeSingle();
  if (error) throw error;
  if (!source?.url_params) throw new Error("You can only share something you own.");
  const notes = await notesBy(userClient, userId, "study_id", [source.id]);
  return insertStudyCopy(admin, recipientId, source, notes.get(source.id));
}

async function copyOwnedSeries(userClient, admin, userId: string, recipientId: string, seriesId: string) {
  const { data: series, error } = await userClient
    .from("dicom_series")
    .select("id, name, folder_name, prefix, suffix, start_slice, end_slice, window_width, window_center, metadata")
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!series) throw new Error("You can only share something you own.");

  const urlParams = seriesViewerParams(series);
  if (!urlParams) throw new Error("This series has no images to share.");
  const notes = await notesBy(userClient, userId, "dicom_series_id", [series.id]);

  let createdSeriesId: string | null = null;
  if (series.folder_name) {
    const { data: existing, error: existingError } = await admin
      .from("dicom_series")
      .select("id")
      .eq("user_id", recipientId)
      .eq("folder_name", series.folder_name)
      .limit(1);
    if (existingError) throw existingError;
    if (!existing?.length) {
      const metadata = {
        ...(series.metadata && typeof series.metadata === "object" ? series.metadata : {}),
        cord: [-1, -1],
      };
      delete metadata.id;
      const { data: inserted, error: insertError } = await admin
        .from("dicom_series")
        .insert({
          user_id: recipientId,
          name: series.name,
          folder_name: series.folder_name,
          prefix: series.prefix,
          suffix: series.suffix,
          start_slice: series.start_slice,
          end_slice: series.end_slice,
          window_width: series.window_width,
          window_center: series.window_center,
          metadata,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      createdSeriesId = inserted.id;
    }
  }

  try {
    return await insertStudyCopy(admin, recipientId, {
      name: series.name || "Shared series",
      description: null,
      url_params: urlParams,
    }, notes.get(series.id));
  } catch (error) {
    if (createdSeriesId) await admin.from("dicom_series").delete().eq("id", createdSeriesId);
    throw error;
  }
}

async function copyOwnedCase(userClient, admin, userId: string, recipientId: string, playlistId: string) {
  const { data: playlist, error } = await userClient
    .from("playlists")
    .select("name, description, playlist_items ( study_id, sort_order, label )")
    .eq("id", playlistId)
    .eq("owner", userId)
    .maybeSingle();
  if (error) throw error;
  if (!playlist) throw new Error("You can only share something you own.");

  const items = [...(playlist.playlist_items || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const studyIds = [...new Set(items.map((item) => item.study_id).filter(Boolean))];
  if (!studyIds.length) throw new Error("Add a study to this case before sharing.");

  const { data: studies, error: studiesError } = await userClient
    .from("studies")
    .select("id, name, description, url_params")
    .in("id", studyIds);
  if (studiesError) throw studiesError;

  const readable = new Map((studies || []).filter((study) => study.url_params).map((study) => [study.id, study]));
  const shareableItems = items.filter((item) => readable.has(item.study_id));
  if (!shareableItems.length) throw new Error("This case has no studies you can share.");
  const notes = await notesBy(userClient, userId, "study_id", [...readable.keys()]);

  const createdIds: string[] = [];
  const copiedBySource = new Map();
  try {
    for (const item of shareableItems) {
      if (copiedBySource.has(item.study_id)) continue;
      const created = await insertStudyCopy(
        admin,
        recipientId,
        readable.get(item.study_id),
        notes.get(item.study_id),
      );
      createdIds.push(created.id);
      copiedBySource.set(item.study_id, created);
    }

    const { data: createdPlaylist, error: playlistError } = await admin
      .from("playlists")
      .insert({
        owner: recipientId,
        name: playlist.name,
        description: playlist.description ?? null,
        visibility: "PRIVATE",
      })
      .select("id")
      .single();
    if (playlistError) throw playlistError;

    const { error: itemsError } = await admin.from("playlist_items").insert(
      shareableItems.map((item, index) => ({
        playlist_id: createdPlaylist.id,
        study_id: copiedBySource.get(item.study_id).id,
        sort_order: index,
        label: item.label ?? null,
      })),
    );
    if (itemsError) {
      await admin.from("playlists").delete().eq("id", createdPlaylist.id);
      throw itemsError;
    }

    const first = copiedBySource.get(shareableItems[0].study_id);
    return {
      name: playlist.name,
      count: copiedBySource.size,
      url_params: first.url_params,
      studyId: first.id,
      playlistId: createdPlaylist.id,
    };
  } catch (error) {
    if (createdIds.length) await admin.from("studies").delete().in("id", createdIds);
    throw error;
  }
}
