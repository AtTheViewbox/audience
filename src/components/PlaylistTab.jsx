import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext";
import { isPresenter } from "../lib/demoCase.js";
import { getCaseIdFromSearch, getPlaylistTokenFromSearch } from "../lib/answerKeyCase.js";
import { fetchPlaylist, fetchSharedPlaylist, playlistItemLabel, sortedPlaylistItems } from "../lib/playlist.js";
import { sameViewerStudy } from "../lib/shareSession.js";
import { openPlaylistStudy } from "../lib/openPlaylistStudy.js";
import { cn } from "@/lib/utils";

function PlaylistTab() {
  const { playlistId, sessionId, sessionMeta, chatHistory } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;
  const [playlist, setPlaylist] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const isHost = isPresenter({
    sessionId,
    userId: userData?.id,
    ownerId: sessionMeta?.owner,
  });

  const shareToken = getPlaylistTokenFromSearch();

  useEffect(() => {
    if (!supabaseClient || !playlistId) {
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
  }, [supabaseClient, playlistId, shareToken]);

  if (!playlistId) return null;

  const items = sortedPlaylistItems(playlist);
  const currentCaseId = getCaseIdFromSearch();

  function isCurrent(item) {
    if (currentCaseId) return item.study_id === currentCaseId;
    return sameViewerStudy(item.studies?.url_params, window.location.search);
  }

  async function openItem(item) {
    const study = item.studies;
    if (!study?.url_params) {
      toast.error("That study has no images.");
      return;
    }
    setBusyId(item.id);
    try {
      await openPlaylistStudy({
        item,
        playlistId,
        shareToken,
        isHost,
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
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{playlist?.name || "Case playlist"}</CardTitle>
        <CardDescription>
          {isHost && sessionId
            ? "Switch the live session to another study in this case."
            : "Open another study in this case."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length ? (
          items.map((item, index) => {
            const current = isCurrent(item);
            return (
              <Button
                key={item.id}
                variant={current ? "secondary" : "outline"}
                className={cn(
                  "w-full justify-between h-auto py-2.5 px-3",
                  current && "border-blue-500/40"
                )}
                disabled={current || busyId === item.id || !item.studies?.url_params}
                onClick={() => openItem(item)}
              >
                <span className="text-left min-w-0 flex items-start gap-2">
                  <span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0">
                  <span className="block truncate">{playlistItemLabel(item)}</span>
                  </span>
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 ml-2">
                  {busyId === item.id ? "Switching…" : current ? "Now" : isHost && sessionId ? "Switch" : "Open"}
                </span>
              </Button>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">This case has no studies yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default PlaylistTab;
