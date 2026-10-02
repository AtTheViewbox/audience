import { Visibility } from "./constants.js";
import { buildCaseViewerHref } from "./answerKeyCase.js";

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
    .select(`id, name, description, visibility, created_at, playlist_items ( ${PLAYLIST_ITEM_SELECT} )`)
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

export function playlistLaunchHref(playlist, study) {
  const item = study || sortedPlaylistItems(playlist)[0]?.studies;
  if (!item?.url_params) return "";
  return buildCaseViewerHref({
    url_params: item.url_params,
    studyId: item.id,
    playlistId: playlist.id,
  });
}
