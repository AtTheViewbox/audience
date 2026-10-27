import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext";
import { isPresenter } from "../lib/demoCase.js";
import { getCaseIdFromSearch, getPlaylistTokenFromSearch } from "../lib/answerKeyCase.js";
import { fetchPlaylist, fetchSharedPlaylist, playlistItemLabel, seriesChoicesFromStudy, seriesPrefixKey, sortedPlaylistItems, viewerUrlForSeries, visibleSeriesPrefixKeys } from "../lib/playlist.js";
import { isPlaceholderSeriesName, loadSeriesDescriptions } from "../lib/seriesLabels.js";
import { sameViewerStudy } from "../lib/shareSession.js";
import { openPlaylistStudy } from "../lib/openPlaylistStudy.js";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function PlaylistTab() {
  const { playlistId, sessionId, sessionMeta, chatHistory } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;
  const [playlist, setPlaylist] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [seriesNames, setSeriesNames] = useState({});

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

  const canChooseSeries = Boolean(sessionId) && isHost;

  useEffect(() => {
    if (!supabaseClient || !playlist || !canChooseSeries) return;
    const keys = new Set();
    for (const item of sortedPlaylistItems(playlist)) {
      for (const choice of seriesChoicesFromStudy(item.studies?.url_params)) {
        if (choice.prefixKey) keys.add(choice.prefixKey);
      }
    }
    if (!keys.size) return;
    const prefixes = [...keys].flatMap((key) => [key, `${key}/`]);
    let cancelled = false;
    supabaseClient
      .from("dicom_series")
      .select("name, prefix, metadata")
      .in("prefix", prefixes)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const next = {};
        for (const row of data) {
          const key = seriesPrefixKey(row.prefix);
          const name = [row.metadata?.label, row.name].find((value) => !isPlaceholderSeriesName(value));
          if (key && name) next[key] = String(name).trim();
        }
        if (Object.keys(next).length) setSeriesNames((prev) => ({ ...next, ...prev }));
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseClient, playlist, canChooseSeries]);

  useEffect(() => {
    if (!playlist || !canChooseSeries) return;
    const urlParamsList = sortedPlaylistItems(playlist)
      .map((item) => item.studies?.url_params)
      .filter((urlParams) => seriesChoicesFromStudy(urlParams).length > 1);
    if (!urlParamsList.length) return;
    let cancelled = false;
    loadSeriesDescriptions(urlParamsList).then((names) => {
      if (cancelled || !Object.keys(names).length) return;
      setSeriesNames((prev) => ({ ...prev, ...names }));
    });
    return () => {
      cancelled = true;
    };
  }, [playlist, canChooseSeries]);

  if (!playlistId) return null;

  const items = sortedPlaylistItems(playlist);
  const currentCaseId = getCaseIdFromSearch();

  function isCurrent(item) {
    if (currentCaseId) return item.study_id === currentCaseId;
    return sameViewerStudy(item.studies?.url_params, window.location.search);
  }

  async function openItem(item, urlParams, { keepDialog = false } = {}) {
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
        urlParams,
        keepDialog,
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
            const fullStudy = sameViewerStudy(item.studies?.url_params, window.location.search);
            const choices = seriesChoicesFromStudy(item.studies?.url_params).map((choice, order) => ({
              ...choice,
              label: seriesNames[choice.prefixKey] || choice.label || `Series ${order + 1}`,
            }));
            const visible = new Set(current ? visibleSeriesPrefixKeys() : []);
            const checked = choices.filter((choice) => fullStudy || visible.has(choice.prefixKey));
            const showingSeries = current && !fullStudy && checked.length > 0;
            const showSeriesMenu = canChooseSeries && choices.length > 1;
            const rowClass = cn(
              "w-full justify-between h-auto py-2.5 px-3",
              current && "border-blue-500/40"
            );
            const rowLabel = (
              <span className="text-left min-w-0 flex items-start gap-2">
                <span className="mt-0.5 w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="block truncate">{playlistItemLabel(item)}</span>
              </span>
            );
            const status = busyId === item.id
              ? "Switching…"
              : fullStudy || showingSeries
                ? "Now"
                : isHost && sessionId
                  ? "Switch"
                  : "Open";

            if (!showSeriesMenu) {
              return (
                <Button
                  key={item.id}
                  variant={fullStudy ? "secondary" : "outline"}
                  className={rowClass}
                  disabled={fullStudy || busyId === item.id || !item.studies?.url_params}
                  onClick={() => openItem(item)}
                >
                  {rowLabel}
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 ml-2">
                    {status}
                  </span>
                </Button>
              );
            }

            return (
              <DropdownMenu
                key={item.id}
                onOpenChange={(open) => {
                  if (open && !current && item.studies?.url_params) {
                    openItem(item, undefined, { keepDialog: true });
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={fullStudy ? "secondary" : "outline"}
                    className={rowClass}
                    disabled={busyId === item.id || !item.studies?.url_params}
                  >
                    {rowLabel}
                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 ml-2">
                      {status}
                      <ChevronDown className="h-3 w-3" />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="z-[80] min-w-[var(--radix-dropdown-menu-trigger-width)] w-max max-w-[min(22rem,calc(100vw-2rem))] border bg-white p-1 text-slate-900 shadow-md"
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  {choices.map((choice) => {
                    const on = fullStudy || visible.has(choice.prefixKey) || !current;
                    return (
                      <DropdownMenuItem
                        key={choice.index}
                        onSelect={(event) => {
                          event.preventDefault();
                          const selected = choices
                            .filter((row) => (row.index === choice.index ? !on : (fullStudy || visible.has(row.prefixKey) || !current)))
                            .map((row) => row.index);
                          if (!selected.length) {
                            toast.error("Keep at least one series on.");
                            return;
                          }
                          const urlParams = selected.length === choices.length
                            ? undefined
                            : viewerUrlForSeries(item.studies.url_params, selected);
                          openItem(item, urlParams, { keepDialog: true });
                        }}
                        className="items-start gap-2 whitespace-normal py-2 text-slate-900 focus:bg-slate-100 focus:text-slate-900"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-slate-900 bg-white",
                            on && "bg-slate-900 text-white"
                          )}
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-left leading-snug text-slate-900">{choice.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
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
