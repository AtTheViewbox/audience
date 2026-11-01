import { useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataContext } from "../context/DataContext.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { getCaseIdFromSearch, getPlaylistTokenFromSearch } from "../lib/answerKeyCase.js";
import { fetchPlaylist, fetchSharedPlaylist, sortedPlaylistItems } from "../lib/playlist.js";

const PANEL =
  "dark fixed top-14 right-3 z-[120] w-[min(340px,calc(100vw-1.5rem))] max-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl backdrop-blur-sm";

function StudyDescriptionButton() {
  const { studyId, playlistId } = useContext(DataContext).data;
  const { supabaseClient } = useContext(UserContext).data;
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const caseId = studyId || getCaseIdFromSearch(location.search);

  useEffect(() => {
    setOpen(false);
  }, [caseId, playlistId]);

  useEffect(() => {
    if (!supabaseClient) return;
    let cancelled = false;
    const token = getPlaylistTokenFromSearch(location.search);

    (async () => {
      let description = "";

      if (caseId) {
        const { data, error } = await supabaseClient
          .from("studies")
          .select("description")
          .eq("id", caseId)
          .maybeSingle();
        if (!error && data) {
          description = data.description?.trim() || "";
        }
      }

      if (!description && playlistId) {
        let playlist = null;
        try {
          playlist = await fetchPlaylist(supabaseClient, playlistId);
        } catch (error) {
          console.error(error);
        }
        if (!playlist && token) {
          playlist = await fetchSharedPlaylist(supabaseClient, playlistId, token);
        }
        const current = sortedPlaylistItems(playlist || {}).find(
          (item) => item.study_id === caseId || item.studies?.id === caseId
        );
        description =
          current?.studies?.description?.trim() ||
          playlist?.description?.trim() ||
          "";
      }

      if (!cancelled) setText(description);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabaseClient, caseId, playlistId, location.search]);

  if (!text) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Description"
        aria-label="Description"
        className={cn(
          "shrink-0 flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors",
          open
            ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
            : "bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-900"
        )}
      >
        <FileText className="h-4 w-4" />
      </button>

      {open && (
        <div className={PANEL}>
          <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-700">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <FileText className="h-4 w-4 text-blue-300 shrink-0" />
              Description
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Close"
              aria-label="Close description"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-3.5 py-3">
            <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{text}</p>
          </div>
        </div>
      )}
    </>
  );
}

export default StudyDescriptionButton;
