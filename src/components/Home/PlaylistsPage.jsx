import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, GripVertical, LayoutGrid, Layers, Link2Off, List, Pencil, Plus, RefreshCw, Search, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserContext } from "../../context/UserContext";
import { Visibility } from "../../lib/constants";
import ShareByEmailDialog from "../ShareByEmailDialog.jsx";
import { deliverShare } from "../../lib/shareByEmail.js";
import {
  createPlaylist,
  deletePlaylist,
  disablePlaylistShareToken,
  ensurePlaylistShareToken,
  fetchPlaylists,
  playlistItemLabel,
  playlistLaunchHref,
  sortedPlaylistItems,
  updatePlaylist,
} from "../../lib/playlist";

function StudyPicker({ studies, addedIds, query, onQuery, onAdd }) {
  const q = query.trim().toLowerCase();
  const rows = studies.filter((study) => {
    if (addedIds.has(String(study.id))) return false;
    if (!q) return true;
    return `${study.name || ""} ${study.description || ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search studies to add"
          className="pl-8 h-8 bg-slate-900/50 border-slate-800 text-sm"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800">
        {studies.length ? (
          rows.length ? (
            rows.map((study) => (
              <div key={study.id} className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800/80 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100 truncate">{study.name || "Untitled study"}</p>
                  {study.description ? (
                    <p className="text-[11px] text-slate-500 truncate">{study.description}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 gap-1"
                  onClick={() => onAdd(study.id)}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 p-3">
              {q ? "No studies match that search." : "Every study is already in this case."}
            </p>
          )
        ) : (
          <p className="text-xs text-slate-500 p-3">Save some studies in Your Viewbox first.</p>
        )}
      </div>
    </div>
  );
}

function emptyDraft() {
  return {
    id: null,
    name: "",
    description: "",
    visibility: Visibility.PRIVATE,
    studyIds: [],
    labels: {},
  };
}

function draftFromPlaylist(playlist) {
  const items = sortedPlaylistItems(playlist);
  const labels = {};
  items.forEach((item) => {
    if (item.label) labels[item.study_id] = item.label;
  });
  return {
    id: playlist.id,
    name: playlist.name || "",
    description: playlist.description || "",
    visibility: playlist.visibility || Visibility.PRIVATE,
    studyIds: items.map((item) => item.study_id),
    labels,
  };
}

export default function PlaylistsPage({ search = "" }) {
  const { supabaseClient, userData } = useContext(UserContext).data;
  const [playlists, setPlaylists] = useState([]);
  const playlistsRef = useRef([]);
  playlistsRef.current = playlists;
  const [studies, setStudies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [listView, setListView] = useState(() => {
    try {
      return localStorage.getItem("atvb-cases-list") !== "0";
    } catch {
      return true;
    }
  });
  const [openIds, setOpenIds] = useState(() => new Set());
  const [studyQuery, setStudyQuery] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [sharePlaylist, setSharePlaylist] = useState(null);
  const [emailSharing, setEmailSharing] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIndexRef = useRef(null);

  const selected = playlists.find((p) => p.id === selectedId) || playlists[0] || null;

  async function load() {
    if (!supabaseClient || !userData?.id || userData.is_anonymous) {
      setPlaylists([]);
      setStudies([]);
      return;
    }
    const [list, studyRows] = await Promise.all([
      fetchPlaylists(supabaseClient, userData.id),
      supabaseClient.from("studies").select("id, name, description, url_params, visibility"),
    ]);
    if (studyRows.error) throw studyRows.error;
    setPlaylists(list);
    setStudies(studyRows.data || []);
  }

  useEffect(() => {
    load().catch((error) => {
      console.error(error);
      toast.error(error?.message || "Could not load cases");
    });
  }, [supabaseClient, userData?.id]);

  useEffect(() => {
    if (!playlists.length) {
      setSelectedId(null);
      return;
    }
    if (!playlists.some((p) => p.id === selectedId)) {
      setSelectedId(playlists[0].id);
    }
  }, [playlists, selectedId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((playlist) => {
      const hay = [
        playlist.name,
        playlist.description,
        ...sortedPlaylistItems(playlist).map(playlistItemLabel),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [playlists, search]);

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setStudyQuery("");
    setDraft(emptyDraft());
    setEditorOpen(true);
  }

  function openEdit(playlist) {
    setStudyQuery("");
    setDraft(draftFromPlaylist(playlist));
    setEditorOpen(true);
  }

  function toggleStudy(studyId, checked) {
    setDraft((prev) => {
      const has = prev.studyIds.some((id) => String(id) === String(studyId));
      const studyIds = checked
        ? (has ? prev.studyIds : [...prev.studyIds, studyId])
        : prev.studyIds.filter((id) => String(id) !== String(studyId));
      return { ...prev, studyIds };
    });
  }

  function moveStudy(studyId, delta) {
    setDraft((prev) => {
      const index = prev.studyIds.indexOf(studyId);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= prev.studyIds.length) return prev;
      const studyIds = [...prev.studyIds];
      [studyIds[index], studyIds[next]] = [studyIds[next], studyIds[index]];
      return { ...prev, studyIds };
    });
  }

  function dropStudy(toIndex) {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (fromIndex == null || fromIndex === toIndex) return;
    setDraft((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.studyIds.length) return prev;
      const studyIds = [...prev.studyIds];
      const [moved] = studyIds.splice(fromIndex, 1);
      studyIds.splice(toIndex, 0, moved);
      return { ...prev, studyIds };
    });
  }

  async function persistOrder(playlistId, index, delta) {
    const playlist = playlistsRef.current.find((row) => row.id === playlistId);
    if (!playlist) return;
    const items = sortedPlaylistItems(playlist);
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    const withOrder = reordered.map((item, order) => ({ ...item, sort_order: order }));
    const nextPlaylists = playlistsRef.current.map((row) =>
      row.id === playlistId ? { ...row, playlist_items: withOrder } : row
    );
    playlistsRef.current = nextPlaylists;
    setPlaylists(nextPlaylists);
    try {
      await updatePlaylist(supabaseClient, playlistId, {
        items: withOrder.map((item) => ({
          study_id: item.study_id,
          label: item.label || "",
        })),
      });
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not update order");
      await load();
    }
  }

  const studyById = useMemo(() => new Map(studies.map((study) => [String(study.id), study])), [studies]);

  function setShareToken(playlistId, token) {
    const next = playlistsRef.current.map((row) =>
      row.id === playlistId ? { ...row, share_token: token } : row
    );
    playlistsRef.current = next;
    setPlaylists(next);
  }

  async function copyShareLink(playlist, { rotate = false } = {}) {
    if (!playlist || shareBusy) return;
    if (!sortedPlaylistItems(playlist)[0]?.studies?.url_params) {
      toast.error("Add a study to this case first.");
      return;
    }
    setShareBusy(true);
    try {
      const token = await ensurePlaylistShareToken(supabaseClient, playlist, { rotate });
      setShareToken(playlist.id, token);
      await navigator.clipboard.writeText(playlistLaunchHref(playlist, null, token));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
      toast.success(rotate ? "New link copied. The old link no longer works." : "Share link copied");
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not create share link");
    } finally {
      setShareBusy(false);
    }
  }

  async function handleShareCase(email) {
    if (!sharePlaylist?.id || emailSharing) return;
    setEmailSharing(true);
    try {
      toast.success(await deliverShare(supabaseClient, {
        email,
        name: sharePlaylist.name,
        playlistId: sharePlaylist.id,
      }));
      setSharePlaylist(null);
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not share");
    } finally {
      setEmailSharing(false);
    }
  }

  async function turnOffShareLink(playlist) {
    if (!playlist?.share_token || shareBusy) return;
    if (!window.confirm("Turn off the share link? Anyone using it will lose access to this case.")) return;
    setShareBusy(true);
    try {
      await disablePlaylistShareToken(supabaseClient, playlist.id);
      setShareToken(playlist.id, null);
      toast.success("Share link turned off");
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not turn off share link");
    } finally {
      setShareBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      toast.error("Give this case a name.");
      return;
    }
    if (!draft.studyIds.length) {
      toast.error("Add at least one study.");
      return;
    }
    setSaving(true);
    try {
      const items = draft.studyIds.map((study_id) => ({
        study_id,
        label: draft.labels[study_id] || "",
      }));
      if (draft.id) {
        await updatePlaylist(supabaseClient, draft.id, {
          name: draft.name,
          description: draft.description,
          visibility: draft.visibility,
          items,
        });
        setSelectedId(draft.id);
      } else {
        const id = await createPlaylist(supabaseClient, {
          ownerId: userData.id,
          name: draft.name,
          description: draft.description,
          visibility: draft.visibility,
          items,
        });
        setSelectedId(id);
      }
      setEditorOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not save case");
    } finally {
      setSaving(false);
    }
  }

  async function removePlaylist(playlist) {
    if (!window.confirm(`Delete “${playlist.name}”? Studies are not deleted.`)) return;
    try {
      await deletePlaylist(supabaseClient, playlist.id);
      toast.success("Case deleted");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Could not delete case");
    }
  }

  if (!userData || userData.is_anonymous) {
    return (
      <div className="flex-1 overflow-auto p-6 w-full bg-slate-950/20">
        <h2 className="text-2xl font-bold tracking-tight text-slate-100 mb-2">Cases</h2>
        <p className="text-sm text-slate-400">Sign in to group studies into a case playlist.</p>
      </div>
    );
  }

  const selectedItems = selected ? sortedPlaylistItems(selected) : [];

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <div className="flex-1 overflow-auto p-6 w-full bg-slate-950/20">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Cases</h2>
            <p className="text-sm text-slate-400 mt-1">
              Group XR, CT, and other studies into one case, then switch them from the viewer menu.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-lg border border-slate-800 p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${listView ? "text-slate-500" : "bg-slate-800 text-slate-100"}`}
                onClick={() => {
                  setListView(false);
                  try { localStorage.setItem("atvb-cases-list", "0"); } catch {}
                }}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${listView ? "bg-slate-800 text-slate-100" : "text-slate-500"}`}
                onClick={() => {
                  setListView(true);
                  try { localStorage.setItem("atvb-cases-list", "1"); } catch {}
                }}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New case
            </Button>
          </div>
        </div>

        {visible.length ? (
          listView ? (
            <div>
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_6.75rem] gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500">
                <span>#</span>
                <span>Case</span>
                <span>Access</span>
                <span />
              </div>
              <div>
                {visible.map((playlist, index) => {
                  const items = sortedPlaylistItems(playlist);
                  const open = openIds.has(playlist.id);
                  const active = selected?.id === playlist.id;
                  return (
                    <div key={playlist.id} className={active ? "bg-blue-500/10 rounded-md" : ""}>
                      <div
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_6.75rem] gap-2 items-center px-3 py-2.5 cursor-pointer rounded-md hover:bg-slate-900/50"
                        onClick={() => {
                          setSelectedId(playlist.id);
                          toggleOpen(playlist.id);
                        }}
                      >
                        <span className="flex items-center gap-1 text-slate-500 tabular-nums">
                          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90" />}
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{playlist.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {items.length} series{playlist.description ? ` · ${playlist.description}` : ""}
                          </p>
                        </div>
                        <span className={`justify-self-start text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                          playlist.visibility === "PUBLIC"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}>
                          {playlist.visibility === "PUBLIC" ? "Public" : "Private"}
                        </span>
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-slate-100"
                            onClick={() => openEdit(playlist)}
                            aria-label="Edit case"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSharePlaylist(playlist)}
                            aria-label="Share case"
                          >
                            <Share2 className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removePlaylist(playlist)}
                            aria-label="Delete case"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {open ? (
                        <>
                        <ol>
                          {items.length ? items.map((item, itemIndex) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className="w-full flex items-center gap-3 px-3 py-2 pl-12 text-left hover:bg-slate-900/70"
                                onClick={() => {
                                  setSelectedId(playlist.id);
                                  const href = playlistLaunchHref(playlist, item.studies);
                                  if (href) window.open(href, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <span className="w-6 text-xs text-slate-500 tabular-nums">{itemIndex + 1}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm text-slate-200 truncate">{playlistItemLabel(item)}</span>
                                </span>
                              </button>
                            </li>
                          )) : (
                            <li className="px-3 py-2 pl-12 text-xs text-slate-500">No studies in this case</li>
                          )}
                        </ol>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((playlist) => {
                const items = sortedPlaylistItems(playlist);
                return (
                  <Card
                    key={playlist.id}
                    className={`relative group cursor-pointer min-w-0 overflow-hidden bg-slate-900/40 border-slate-800 hover:bg-slate-900/60 hover:border-slate-700 transition-all duration-200 ${
                      selected?.id === playlist.id ? "ring-1 ring-blue-500/50 border-blue-500/50" : ""
                    }`}
                    onClick={() => setSelectedId(playlist.id)}
                  >
                    <div className="absolute top-2 right-2 z-10 flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSharePlaylist(playlist);
                        }}
                        aria-label="Share case"
                      >
                        <Share2 className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlaylist(playlist);
                        }}
                        aria-label="Delete case"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-slate-100 font-semibold mb-1 truncate pr-16" title={playlist.name}>
                        {playlist.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-400 line-clamp-2">
                        {playlist.description || `${items.length} stud${items.length === 1 ? "y" : "ies"}`}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-2 text-xs text-muted-foreground">
                      {items.map(playlistItemLabel).join(" · ") || "Empty"}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center">
            <Layers className="h-8 w-8 mx-auto text-slate-500 mb-3" />
            <p className="text-sm text-slate-300">No cases yet.</p>
            <p className="text-xs text-slate-500 mt-1">Create one and add the XR, CT, or MR studies that belong together.</p>
          </div>
        )}
      </div>

      <div className="w-[min(400px,40vw)] hidden lg:flex bg-slate-950 border-l border-slate-800 overflow-hidden flex-col min-w-0">
        {selected ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold tracking-tight text-slate-100 break-words">{selected.name}</h3>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-2">
                  {selected.visibility === "PUBLIC" ? (
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">PUBLIC</span>
                  ) : (
                    <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded border border-red-500/30">PRIVATE</span>
                  )}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => openEdit(selected)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {selected.description || "No description provided."}
            </p>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Series order</h4>
              {selectedItems.length ? selectedItems.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100 truncate">{playlistItemLabel(item)}</p>
                  </div>
                  <div className="flex flex-col shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      aria-label="Move earlier"
                      onClick={() => persistOrder(selected.id, index, -1)}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === selectedItems.length - 1}
                      aria-label="Move later"
                      onClick={() => persistOrder(selected.id, index, 1)}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )) : (
                <p className="text-xs text-slate-500">No studies in this case yet.</p>
              )}
            </div>
            <Button
              className="w-full"
              disabled={!selectedItems[0]?.studies?.url_params}
              onClick={() => {
                const href = playlistLaunchHref(selected);
                if (href) window.open(href, "_blank", "noopener,noreferrer");
              }}
            >
              Launch case
            </Button>
            <div className="space-y-2 rounded-lg border border-slate-800 p-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Share link</h4>
                <p className="mt-1 text-[11px] text-slate-500">
                  Anyone with this link can open every study in the case, even if the case is private.
                </p>
              </div>
              <Button
                variant="secondary"
                className="w-full gap-2"
                disabled={shareBusy || !selectedItems[0]?.studies?.url_params}
                onClick={() => copyShareLink(selected)}
              >
                {shareCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {selected.share_token ? "Copy share link" : "Create share link"}
              </Button>
              {selected.share_token ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs text-slate-400"
                    disabled={shareBusy}
                    onClick={() => copyShareLink(selected, { rotate: true })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    New link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs text-slate-400"
                    disabled={shareBusy}
                    onClick={() => turnOffShareLink(selected)}
                  >
                    <Link2Off className="h-3.5 w-3.5" />
                    Turn off
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500 p-6">
            Select a case
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-3xl bg-slate-950 border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit case" : "New case"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Search your studies and add them to this case. The list below is the order in the viewer menu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Right lower quadrant pain"
                className="bg-slate-900/50 border-slate-800"
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional"
                className="bg-slate-900/50 border-slate-800 min-h-[80px]"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
              <div>
                <Label>Public case</Label>
                <p className="text-xs text-slate-500">Others can see this playlist if the studies are public.</p>
              </div>
              <Switch
                checked={draft.visibility === Visibility.PUBLIC}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    visibility: checked ? Visibility.PUBLIC : Visibility.PRIVATE,
                  }))
                }
              />
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2 min-w-0">
                <Label>Add from your studies</Label>
                <StudyPicker
                  studies={studies}
                  addedIds={new Set(draft.studyIds.map(String))}
                  query={studyQuery}
                  onQuery={setStudyQuery}
                  onAdd={(studyId) => toggleStudy(studyId, true)}
                />
              </div>
              <div className="grid gap-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label>In this case</Label>
                  <span className="text-[11px] text-slate-500 tabular-nums">{draft.studyIds.length} added</span>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-slate-800">
                  {draft.studyIds.length ? (
                    <ol className="p-2 space-y-2">
                      {draft.studyIds.map((studyId, index) => {
                        const study = studyById.get(String(studyId));
                        return (
                          <li
                            key={studyId}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragOverIndex(index);
                            }}
                            onDrop={() => dropStudy(index)}
                            className={`flex items-start gap-2 rounded-md border p-2 bg-slate-900/40 ${
                              dragOverIndex === index ? "border-blue-500/60" : "border-slate-800"
                            }`}
                          >
                            <span
                              draggable
                              aria-label="Drag to reorder"
                              onDragStart={() => {
                                dragIndexRef.current = index;
                              }}
                              onDragEnd={() => setDragOverIndex(null)}
                              className="mt-0.5 text-slate-500 cursor-grab"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-400">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-100 truncate">{study?.name || "Untitled study"}</p>
                              <Input
                                value={draft.labels[studyId] || ""}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    labels: { ...prev.labels, [studyId]: e.target.value },
                                  }))
                                }
                                placeholder="Label (CT, XR…)"
                                className="mt-2 h-8 bg-slate-900 border-slate-800 text-xs"
                              />
                            </div>
                            <div className="flex flex-col shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={index === 0}
                                aria-label="Move earlier"
                                onClick={() => moveStudy(studyId, -1)}
                              >
                                <ChevronUp className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={index === draft.studyIds.length - 1}
                                aria-label="Move later"
                                onClick={() => moveStudy(studyId, 1)}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                aria-label="Remove from case"
                                onClick={() => toggleStudy(studyId, false)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-xs text-slate-500 p-3">Nothing added yet. Search above and add a study. This list is the viewer order.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveDraft} disabled={saving}>
              {saving ? "Saving…" : "Save case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShareByEmailDialog
        open={!!sharePlaylist}
        onOpenChange={(open) => { if (!open) setSharePlaylist(null); }}
        title="Share this case"
        description="Enter their account email. Each study is copied into their viewbox, and the case is added to their Cases list."
        busy={emailSharing}
        onSubmit={handleShareCase}
      />
    </div>
  );
}
