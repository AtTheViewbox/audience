import { currentViewerUrlParams } from "./shareSession.js";

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
    .from('viewbox')
    .upsert({
      user: userId,
      url_params: currentViewerUrlParams(),
      chat_history: chatHistory || [],
    })
    .select();

  if (error) throw error;
  if (!data?.[0]) throw new Error('transferSessionToCurrentUrl: no row returned');

  if (dispatch) {
    dispatch({
      type: 'connect_to_sharing_session',
      payload: { sessionId: data[0].session_id },
    });
  }

  window.location.reload();
}
