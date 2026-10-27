import { Visibility } from "./constants.js";
import { buildCaseViewerHref, extractSearchString } from "./answerKeyCase.js";

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
    .select(`id, name, description, visibility, created_at, share_token, playlist_items ( ${PLAYLIST_ITEM_SELECT} )`)
    .eq("owner", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPlaylist(supabaseClient, playlistId) {
  if (!supabaseClient || !playlistId) return null;
  const { data, error } = await supabaseClient
    .from("playlists")
    .select(`id, name, description, visibility, owner, playlist_items ( ${PLAYLIST_ITEM_SELECT} )`)
    .eq("id", playlistId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
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

export async function disablePlaylistShareToken(supabaseClient, playlistId) {
  const { error } = await supabaseClient
    .from("playlists")
    .update({ share_token: null })
    .eq("id", playlistId);
  if (error) throw error;
}

export async function createPlaylist(supabaseClient, {
  ownerId,
  name,
  description = "",
  visibility = Visibility.PRIVATE,
  items = [],
}) {
  const { data, error } = await supabaseClient
    .from("playlists")
    .insert({
      owner: ownerId,
      name: name.trim(),
      description: description.trim() || null,
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
  visibility,
  items,
}) {
  const patch = {};
  if (name != null) patch.name = name.trim();
  if (description !== undefined) patch.description = description?.trim() || null;
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
