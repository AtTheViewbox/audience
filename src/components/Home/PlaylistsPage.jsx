import { useContext, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, Layers, List, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserContext } from "../../context/UserContext";
import { Visibility } from "../../lib/constants";
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylists,
  playlistItemLabel,
  playlistLaunchHref,
  sortedPlaylistItems,
  updatePlaylist,
} from "../../lib/playlist";

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

  const selected = playlists.find((p) => p.id === selectedId) || playlists[0] || null;

  async function load() {
    if (!supabaseClient || !userData?.id || userData.is_anonymous) {
      setPlaylists([]);
      setStudies([]);
      return;
    }
    const [list, studyRows] = await Promise.all([
      fetchPlaylists(supabaseClient, userData.id),
      supabaseClient.from("studies").select("id, name, description, url_params, visibility").eq("owner", userData.id),
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
    setDraft(emptyDraft());
    setEditorOpen(true);
  }

  function openEdit(playlist) {
    setDraft(draftFromPlaylist(playlist));
    setEditorOpen(true);
  }

  function toggleStudy(studyId, checked) {
    setDraft((prev) => {
      const studyIds = checked
        ? [...prev.studyIds, studyId]
        : prev.studyIds.filter((id) => id !== studyId);
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
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.5rem] gap-2 border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500">
                <span>#</span>
                <span>Case</span>
                <span>Access</span>
                <span />
              </div>
              <div className="divide-y divide-slate-800/80">
                {visible.map((playlist, index) => {
                  const items = sortedPlaylistItems(playlist);
                  const open = openIds.has(playlist.id);
                  const active = selected?.id === playlist.id;
                  return (
                    <div key={playlist.id} className={active ? "bg-blue-500/10" : ""}>
                      <div
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.5rem] gap-2 items-center px-3 py-2.5 cursor-pointer hover:bg-slate-900/70"
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
                            onClick={() => removePlaylist(playlist)}
                            aria-label="Delete case"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {open ? (
                        <ol className="border-t border-slate-800/80 bg-slate-950/50">
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
                                  {item.label && item.studies?.name ? (
                                    <span className="block text-[11px] text-slate-500 truncate">{item.studies.name}</span>
                                  ) : null}
                                </span>
                              </button>
                            </li>
                          )) : (
                            <li className="px-3 py-2 pl-12 text-xs text-slate-500">No studies in this case</li>
                          )}
                        </ol>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlaylist(playlist);
                      }}
                      aria-label="Delete case"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-slate-100 font-semibold mb-1 truncate pr-8" title={playlist.name}>
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
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Series</h4>
              {selectedItems.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                  <p className="text-sm text-slate-100">{playlistItemLabel(item)}</p>
                  <p className="text-[11px] text-slate-500">
                    {index + 1} of {selectedItems.length}
                    {item.studies?.name && item.label ? ` · ${item.studies.name}` : ""}
                  </p>
                </div>
              ))}
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
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500 p-6">
            Select a case
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit case" : "New case"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Pick the studies that belong together. Order is the order they appear in the viewer menu.
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
            <div className="grid gap-2">
              <Label>Studies</Label>
              <ScrollArea className="h-56 rounded-md border border-slate-800 p-2">
                {studies.length ? (
                  <div className="space-y-2">
                    {studies.map((study) => {
                      const checked = draft.studyIds.includes(study.id);
                      const order = draft.studyIds.indexOf(study.id);
                      return (
                        <div key={study.id} className="rounded-md border border-slate-800/80 p-2">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleStudy(study.id, value === true)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-100 truncate">{study.name}</p>
                              {checked ? (
                                <Input
                                  value={draft.labels[study.id] || ""}
                                  onChange={(e) =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      labels: { ...prev.labels, [study.id]: e.target.value },
                                    }))
                                  }
                                  placeholder="Label (CT, XR…)"
                                  className="mt-2 h-8 bg-slate-900 border-slate-800 text-xs"
                                />
                              ) : null}
                            </div>
                            {checked ? (
                              <div className="flex flex-col">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={order <= 0}
                                  onClick={() => moveStudy(study.id, -1)}
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={order === draft.studyIds.length - 1}
                                  onClick={() => moveStudy(study.id, 1)}
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 p-2">Save some studies in Your Viewbox first.</p>
                )}
              </ScrollArea>
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
    </div>
  );
}
