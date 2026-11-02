import { Visibility } from "./constants.js";
import {
  buildCaseViewerHref,
  CASE_CODE_ALPHABET,
  CASE_CODE_LENGTH,
  extractSearchString,
} from "./answerKeyCase.js";

const PLAYLIST_ITEM_SELECT =
  "id, sort_order, label, study_id, studies ( id, name, description, url_params, visibility )";

export function playlistItemLabel(item) {
  return item?.label?.trim() || item?.studies?.name || "Untitled";
}

export function sortedPlaylistItems(playlist) {
  return [...(playlist?.playlist_items || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
}

export async function fetchPlaylists(supabaseClient, ownerId) {
  if (!supabaseClient || !ownerId) return [];
  const { data, error } = await supabaseClient
    .from("playlists")
    .select(`id, name, description, indication, visibility, created_at, share_token, share_code, playlist_items ( ${PLAYLIST_ITEM_SELECT} )`)
    .eq("owner", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPlaylist(supabaseClient, playlistId) {
  if (!supabaseClient || !playlistId) return null;
  const { data, error } = await supabaseClient
    .from("playlists")
    .select(`id, name, description, indication, visibility, owner, playlist_items ( ${PLAYLIST_ITEM_SELECT} )`)
    .eq("id", playlistId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** The case description / learning point. Study descriptions are not shown in the viewer. */
export async function loadViewerDescription(supabaseClient, { playlist, playlistId, token } = {}) {
  if (!supabaseClient) return { playlist: playlist || null, description: "" };
  let loaded = playlist || null;
  if (!loaded && playlistId) {
    loaded = await loadViewerPlaylist(supabaseClient, playlistId, token);
  }
  return { playlist: loaded, description: loaded?.description?.trim() || "" };
}

/** Owner read, then the share link when the case or its studies are not visible. */
export async function loadViewerPlaylist(supabaseClient, playlistId, token) {
  if (!supabaseClient || !playlistId) return null;
  let next = null;
  try {
    next = await fetchPlaylist(supabaseClient, playlistId);
  } catch (error) {
    console.error(error);
  }
  const incomplete =
    !next?.playlist_items?.length ||
    next.playlist_items.some((item) => !item.studies?.url_params);
  if ((incomplete || !next?.description) && token) {
    const shared = await fetchSharedPlaylist(supabaseClient, playlistId, token);
    if (shared) next = shared;
  }
  return next;
}

/** Load a case through its secret share link (works for private cases). */
export async function fetchSharedPlaylist(supabaseClient, playlistId, token) {
  if (!supabaseClient || !playlistId || !token) return null;
  const { data, error } = await supabaseClient.functions.invoke("getSharedPlaylist-ts", {
    body: { playlistId, token },
  });
  if (error) return null;
  return data?.playlist ?? null;
}

function generateCaseCode() {
  const bytes = new Uint8Array(CASE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CASE_CODE_ALPHABET[byte % CASE_CODE_ALPHABET.length]).join("");
}

/** Returns the case's share token, creating one if the case has none yet. */
export async function ensurePlaylistShareToken(supabaseClient, playlist, { rotate = false } = {}) {
  if (!rotate && playlist?.share_token) return playlist.share_token;
  const token = crypto.randomUUID();
  const { error } = await supabaseClient
    .from("playlists")
    .update({ share_token: token })
    .eq("id", playlist.id);
  if (error) throw error;
  return token;
}

/** The short case:XXXXXX id. Created with the share link and reused until it is rotated. */
export async function ensurePlaylistShareCode(supabaseClient, playlist, { rotate = false } = {}) {
  const token = await ensurePlaylistShareToken(supabaseClient, playlist, { rotate });
  if (!rotate && playlist?.share_code) return { token, code: playlist.share_code };

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCaseCode();
    const { error } = await supabaseClient
      .from("playlists")
      .update({ share_code: code })
      .eq("id", playlist.id);
    if (!error) return { token, code };
    lastError = error;
    if (error.code !== "23505") throw error;
  }
  throw lastError || new Error("Could not create a case id");
}

export async function resolveCaseCode(supabaseClient, code) {
  if (!supabaseClient || !code) return null;
  const { data, error } = await supabaseClient.rpc("resolve_case_code", { code });
  if (error) throw error;
  return data ?? null;
}

export async function disablePlaylistShareToken(supabaseClient, playlistId) {
  const { error } = await supabaseClient
    .from("playlists")
    .update({ share_token: null, share_code: null })
    .eq("id", playlistId);
  if (error) throw error;
}

export async function createPlaylist(supabaseClient, {
  ownerId,
  name,
  description = "",
  indication = "",
  visibility = Visibility.PRIVATE,
  items = [],
}) {
  const { data, error } = await supabaseClient
    .from("playlists")
    .insert({
      owner: ownerId,
      name: name.trim(),
      description: description.trim() || null,
      indication: indication.trim() || null,
      visibility,
    })
    .select("id")
    .single();
  if (error) throw error;
  await replacePlaylistItems(supabaseClient, data.id, items);
  return data.id;
}

export async function updatePlaylist(supabaseClient, playlistId, {
  name,
  description,
  indication,
  visibility,
  items,
}) {
  const patch = {};
  if (name != null) patch.name = name.trim();
  if (description !== undefined) patch.description = description?.trim() || null;
  if (indication !== undefined) patch.indication = indication?.trim() || null;
  if (visibility) patch.visibility = visibility;
  if (Object.keys(patch).length) {
    const { error } = await supabaseClient.from("playlists").update(patch).eq("id", playlistId);
    if (error) throw error;
  }
  if (items) await replacePlaylistItems(supabaseClient, playlistId, items);
}

export async function deletePlaylist(supabaseClient, playlistId) {
  const { error } = await supabaseClient.from("playlists").delete().eq("id", playlistId);
  if (error) throw error;
}

export async function replacePlaylistItems(supabaseClient, playlistId, items) {
  const { error: deleteError } = await supabaseClient
    .from("playlist_items")
    .delete()
    .eq("playlist_id", playlistId);
  if (deleteError) throw deleteError;

  const rows = (items || [])
    .filter((item) => item.study_id)
    .map((item, index) => ({
      playlist_id: playlistId,
      study_id: item.study_id,
      sort_order: index,
      label: item.label?.trim() || null,
    }));
  if (!rows.length) return;

  const { error } = await supabaseClient.from("playlist_items").insert(rows);
  if (error) throw error;
}

function stripImageScheme(value) {
  let text = String(value || "");
  try {
    text = decodeURIComponent(text);
  } catch {
    // Value was already decoded.
  }
  return text.replace(/^(dicomweb:|wadouri:|wadors:)/, "");
}

/** Stable key for matching a viewer prefix to dicom_series.prefix. */
export function seriesPrefixKey(value) {
  return stripImageScheme(value).replace(/\/+$/, "");
}

/** upload folder stored on dicom_series.folder_name. */
export function seriesFolderKey(value) {
  const match = seriesPrefixKey(value).match(/upload_[A-Za-z0-9_]+/);
  return match ? match[0] : "";
}

function seriesIndexes(params) {
  const indexes = new Set();
  for (const key of params.keys()) {
    const match = /^vd\.(\d+)\./.exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

/** A filled grid. Avoids an empty cell, which the viewer cannot render. */
function gridForCount(count) {
  const n = Math.max(1, count);
  let best = { r: 1, c: n };
  for (let c = 1; c <= Math.min(3, n); c++) {
    if (n % c !== 0) continue;
    const r = n / c;
    if (r <= 3) best = { r, c };
  }
  return best;
}

function copyViewport(params, fromIndex, toIndex, next) {
  const prefix = `vd.${fromIndex}.`;
  for (const [key, value] of params.entries()) {
    if (!key.startsWith(prefix)) continue;
    next.set(`vd.${toIndex}.${key.slice(prefix.length)}`, value);
  }
}

/**
 * One saved study can hold several series (vd.0, vd.1, …).
 * Each choice is a 1×1 viewer URL for that series alone.
 */
export function seriesChoicesFromStudy(urlParams) {
  const params = new URLSearchParams(extractSearchString(urlParams));
  return seriesIndexes(params)
    .map((index, order) => ({
      index,
      label: `Series ${order + 1}`,
      prefixKey: seriesPrefixKey(params.get(`vd.${index}.s.pf`) || ""),
      urlParams: viewerUrlForSeries(urlParams, [index]),
    }))
    .filter((choice) => choice.prefixKey);
}

/** Layout URL for the checked series, in their saved order. */
export function viewerUrlForSeries(urlParams, selectedIndexes) {
  const params = new URLSearchParams(extractSearchString(urlParams));
  const indexes = [...selectedIndexes].sort((a, b) => a - b);
  const { r, c } = gridForCount(indexes.length);
  const next = new URLSearchParams();
  next.set("m", "true");
  next.set("ld.r", String(r));
  next.set("ld.c", String(c));
  indexes.forEach((index, slot) => copyViewport(params, index, slot, next));
  return next.toString();
}

/** Prefixes of the series currently on screen, in viewport order. */
export function visibleSeriesPrefixKeys(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(extractSearchString(search));
  return seriesIndexes(params).map((index) => seriesPrefixKey(params.get(`vd.${index}.s.pf`) || ""));
}

export function playlistLaunchHref(playlist, study, shareToken = null) {
  const item = study || sortedPlaylistItems(playlist)[0]?.studies;
  if (!item?.url_params) return "";
  return buildCaseViewerHref({
    url_params: item.url_params,
    studyId: item.id,
    playlistId: playlist.id,
    shareToken,
  });
}
