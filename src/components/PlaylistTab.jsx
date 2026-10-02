import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext";
import { isPresenter } from "../lib/demoCase.js";
import {
  buildCaseViewerHref,
  getCaseIdFromSearch,
  sessionViewerUrlParams,
} from "../lib/answerKeyCase.js";
import { fetchPlaylist, playlistItemLabel, sortedPlaylistItems } from "../lib/playlist.js";
import { sameViewerStudy } from "../lib/shareSession.js";
import { transferSessionToUrlParams } from "../lib/transferSharedSession.js";
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

  useEffect(() => {
    if (!supabaseClient || !playlistId) {
      setPlaylist(null);
      return;
    }
    fetchPlaylist(supabaseClient, playlistId)
      .then(setPlaylist)
      .catch((error) => {
        console.error(error);
        setPlaylist(null);
      });
  }, [supabaseClient, playlistId]);

  if (!playlistId) return null;

  const items = sortedPlaylistItems(playlist);
  const currentCaseId = getCaseIdFromSearch();

  function isCurrent(item) {
    if (currentCaseId && item.study_id === currentCaseId) return true;
    return sameViewerStudy(item.studies?.url_params, window.location.search);
  }

  async function openItem(item) {
    const study = item.studies;
    if (!study?.url_params) {
      toast.error("That study has no images.");
      return;
    }
    const href = buildCaseViewerHref({
      url_params: study.url_params,
      studyId: study.id,
      playlistId,
    });
    const urlParams = sessionViewerUrlParams(href);

    if (isHost && sessionId && userData?.id) {
      setBusyId(item.id);
      try {
        await transferSessionToUrlParams({
          supabaseClient,
          userId: userData.id,
          urlParams,
          chatHistory: chatHistory || [],
          dispatch,
        });
      } catch (error) {
        console.error(error);
        toast.error(error?.message || "Could not switch the session.");
        setBusyId(null);
      }
      return;
    }

    window.location.href = href;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{playlist?.name || "Case playlist"}</CardTitle>
        <CardDescription>
          {isHost && sessionId
            ? "Switch the live session to another series in this case."
            : "Open another series in this case."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length ? (
          items.map((item) => {
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
                <span className="text-left min-w-0">
                  <span className="block truncate">{playlistItemLabel(item)}</span>
                  {item.label && item.studies?.name ? (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {item.studies.name}
                    </span>
                  ) : null}
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
