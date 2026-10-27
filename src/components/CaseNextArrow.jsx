import { useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext";
import { isPresenter } from "../lib/demoCase.js";
import { getCaseIdFromSearch, getPlaylistTokenFromSearch } from "../lib/answerKeyCase.js";
import { fetchPlaylist, fetchSharedPlaylist, sortedPlaylistItems } from "../lib/playlist.js";
import { sameViewerStudy } from "../lib/shareSession.js";
import { openPlaylistStudy } from "../lib/openPlaylistStudy.js";

function CaseNextArrow() {
  const { playlistId, sessionId, sessionMeta, chatHistory } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;
  const location = useLocation();
  const [playlist, setPlaylist] = useState(null);
  const [busy, setBusy] = useState(false);

  const isLeader = isPresenter({
    sessionId,
    userId: userData?.id,
    ownerId: sessionMeta?.owner,
    search: location.search,
  });
  const shareToken = getPlaylistTokenFromSearch(location.search);

  useEffect(() => {
    if (!supabaseClient || !playlistId || !isLeader) {
      setPlaylist(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let next = null;
      try {
        next = await fetchPlaylist(supabaseClient, playlistId);
      } catch (error) {
        console.error(error);
      }
      const incomplete =
        !next?.playlist_items?.length ||
        next.playlist_items.some((item) => !item.studies?.url_params);
      if (incomplete && shareToken) {
        next = (await fetchSharedPlaylist(supabaseClient, playlistId, shareToken)) || next;
      }
      if (!cancelled) setPlaylist(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseClient, playlistId, isLeader, shareToken]);

  if (!playlistId || !isLeader) return null;

  const items = sortedPlaylistItems(playlist);
  const currentCaseId = getCaseIdFromSearch(location.search);
  const currentIndex = items.findIndex((item) =>
    currentCaseId
      ? item.study_id === currentCaseId
      : sameViewerStudy(item.studies?.url_params, location.search)
  );
  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 ? items[currentIndex + 1] : null;
  const canGoBack = Boolean(previousItem?.studies?.url_params);
  const canGoForward = Boolean(nextItem?.studies?.url_params);
  if (!canGoBack && !canGoForward) return null;

  async function goTo(item) {
    if (busy || !item) return;
    setBusy(true);
    try {
      await openPlaylistStudy({
        item,
        playlistId,
        shareToken,
        isHost: true,
        sessionId,
        userId: userData?.id,
        supabaseClient,
        chatHistory,
        dispatch,
      });
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not switch the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canGoBack && (
        <button
          type="button"
          aria-label="Previous study"
          title="Previous study"
          disabled={busy}
          onClick={() => goTo(previousItem)}
          className="fixed left-0 top-1/2 z-[80] flex h-28 w-12 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0"
        >
          <span className="ml-1 flex h-14 w-8 items-center justify-center rounded-md bg-white/90 text-black shadow">
            <ChevronLeft className="h-6 w-6" strokeWidth={1.75} />
          </span>
        </button>
      )}
      {canGoForward && (
        <button
          type="button"
          aria-label="Next study"
          title="Next study"
          disabled={busy}
          onClick={() => goTo(nextItem)}
          className="fixed right-0 top-1/2 z-[80] flex h-28 w-12 -translate-y-1/2 items-center justify-end border-0 bg-transparent p-0"
        >
          <span className="mr-1 flex h-14 w-8 items-center justify-center rounded-md bg-white/90 text-black shadow">
            <ChevronRight className="h-6 w-6" strokeWidth={1.75} />
          </span>
        </button>
      )}
    </>
  );
}

export default CaseNextArrow;
