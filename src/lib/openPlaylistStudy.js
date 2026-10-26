import { toast } from "sonner";
import { buildCaseViewerHref, sessionViewerUrlParams } from "./answerKeyCase.js";
import { transferSessionToUrlParams } from "./transferSharedSession.js";
import { applyViewerUrl } from "./viewerLocation.js";

/** Open one study in the current case. The host moves the live session with them. */
export async function openPlaylistStudy({
  item,
  playlistId,
  shareToken,
  isHost,
  sessionId,
  userId,
  supabaseClient,
  chatHistory,
  dispatch,
}) {
  const study = item?.studies;
  if (!study?.url_params) {
    toast.error("That study has no images.");
    return false;
  }

  const href = buildCaseViewerHref({
    url_params: study.url_params,
    studyId: study.id,
    playlistId,
    shareToken,
  });

  if (isHost && sessionId && userId) {
    await transferSessionToUrlParams({
      supabaseClient,
      userId,
      urlParams: sessionViewerUrlParams(href),
      chatHistory: chatHistory || [],
      dispatch,
    });
    return true;
  }

  applyViewerUrl(href, dispatch);
  return true;
}
