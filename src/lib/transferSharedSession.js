import { currentViewerUrlParams } from "./shareSession.js";

function viewerHref(urlParams, joinToken) {
  const params = new URLSearchParams(urlParams || "");
  if (joinToken) params.set("s", joinToken);
  const base = import.meta.env.BASE_URL || "/";
  const path = base.endsWith("/") ? base : `${base}/`;
  return `${window.location.origin}${path}?${params.toString()}`;
}

export const IGNORE_SESSION_UPDATE_KEY = "atvb-ignore-session-update";

/**
 * Point the host's live session at a specific study URL, then take the host there.
 * Other clients pick up the new url_params over realtime and reload.
 */
export async function transferSessionToUrlParams({
  supabaseClient,
  userId,
  urlParams,
  chatHistory,
  dispatch,
}) {
  try {
    sessionStorage.setItem(IGNORE_SESSION_UPDATE_KEY, "1");
  } catch {
    // ignore
  }

  const { data, error } = await supabaseClient
    .from("viewbox")
    .update({
      url_params: urlParams,
      chat_history: chatHistory || [],
    })
    .eq("user", userId)
    .select();

  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("transferSessionToUrlParams: no session to update");

  if (dispatch) {
    dispatch({
      type: "connect_to_sharing_session",
      payload: { sessionId: row.session_id, joinCode: row.join_code },
    });
  }

  window.location.href = viewerHref(urlParams, row.join_code || row.session_id);
}

/**
 * Updates the signed-in user's viewbox row to the current URL (study) and reloads.
 * Same behavior as "Transfer Session" in ShareTab.
 */
export async function transferSessionToCurrentUrl({
  supabaseClient,
  userId,
  chatHistory,
  dispatch,
}) {
  const { data, error } = await supabaseClient
    .from("viewbox")
    .upsert({
      user: userId,
      url_params: currentViewerUrlParams(),
      chat_history: chatHistory || [],
    })
    .select();

  if (error) throw error;
  if (!data?.[0]) throw new Error("transferSessionToCurrentUrl: no row returned");

  if (dispatch) {
    dispatch({
      type: "connect_to_sharing_session",
      payload: { sessionId: data[0].session_id, joinCode: data[0].join_code },
    });
  }

  window.location.reload();
}
