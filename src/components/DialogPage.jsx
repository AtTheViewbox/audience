import { useState, useContext, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { LoginDialog } from "../login/LoginDialog.jsx";
import { isDemoMode, isJoinParticipant } from "../lib/demoCase.js";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import ShareTab from "./ShareTab.jsx";
import SettingTab from "./SettingTab.jsx";
import AnnotationTab from "./AnnotationTab.jsx";
import PlaylistTab from "./PlaylistTab.jsx";
import DescriptionTab from "./DescriptionTab.jsx";
import { DataContext } from "../context/DataContext.jsx";
import { getCaseIdFromSearch, getPlaylistTokenFromSearch } from "../lib/answerKeyCase.js";
import { loadViewerDescription, sortedPlaylistItems } from "../lib/playlist.js";

export const AuthMode = {
  LOGIN: "login",
  SIGN_UP: "signup",
  RECOVERY: "recovery",
};

function DialogPage({ open = true }) {
  const { userData, supabaseClient } = useContext(UserContext).data;
  const viewer = useContext(DataContext)?.data;
  const playlistId = viewer?.playlistId;
  const sessionId = viewer?.sessionId;
  const isAnonymous = !userData || userData.is_anonymous;
  const demoMode = isDemoMode();
  const canShare = !isAnonymous || demoMode;
  const canAnnotate = !isAnonymous || demoMode;
  const location = useLocation();
  const showLogin = isAnonymous && !demoMode;
  const showSetting = !showLogin;
  const inSession = Boolean(sessionId);
  const isParticipant = isJoinParticipant({
    sessionId,
    userId: userData?.id,
    ownerId: viewer?.sessionMeta?.owner,
    search: location.search,
  });
  const caseId = viewer?.studyId || getCaseIdFromSearch(location.search);
  const [studyCount, setStudyCount] = useState(null);
  const [description, setDescription] = useState(null);

  useEffect(() => {
    if (!supabaseClient) return;
    let cancelled = false;
    setDescription(null);
    setStudyCount(null);
    const token = getPlaylistTokenFromSearch(location.search);
    (async () => {
      const { playlist, description: text } = await loadViewerDescription(supabaseClient, {
        playlistId,
        caseId,
        token,
      });
      if (cancelled) return;
      setStudyCount(playlistId ? sortedPlaylistItems(playlist || {}).length : null);
      setDescription(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseClient, playlistId, caseId, location.search]);

  const showDescription = Boolean(description);

  const showPlaylist = Boolean(playlistId) && !showLogin && studyCount > 1;

  const [authMode, setAuthMode] = useState(AuthMode.LOGIN);

  const preferredTab = showPlaylist && inSession ? "playlist" : canShare ? "sharing" : "login";
  const [tabValue, setTabValue] = useState(preferredTab);
  const dialogWasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      dialogWasOpen.current = false;
      return;
    }
    // Starting a session while this dialog is open should leave Share on screen.
    if (dialogWasOpen.current) return;
    if (description == null) return;
    if (playlistId && studyCount == null) return;
    dialogWasOpen.current = true;
    if (isParticipant && description) setTabValue("description");
    else setTabValue(showPlaylist && inSession ? "playlist" : canShare ? "sharing" : "login");
  }, [open, showPlaylist, inSession, canShare, playlistId, studyCount, description, isParticipant]);

  useEffect(() => {
    const playlistHidden = tabValue === "playlist" && !showPlaylist && !(playlistId && studyCount == null);
    const descriptionHidden = tabValue === "description" && description === "";
    if (playlistHidden || descriptionHidden) {
      setTabValue(canShare ? "sharing" : "login");
    }
  }, [tabValue, showPlaylist, playlistId, studyCount, canShare, description]);

  const loginTabLabel =
    authMode === AuthMode.SIGN_UP
      ? "Create account"
      : authMode === AuthMode.RECOVERY
        ? "Reset password"
        : "Login";

  const tabCount = [canShare, showDescription, showLogin, canAnnotate, showPlaylist, showSetting].filter(Boolean).length;
  const tabsClass = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }[tabCount] || "grid-cols-3";
  const tabTriggerClass = tabCount >= 5 ? "px-1 text-[11px] sm:px-2 sm:text-xs" : undefined;

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle>{canShare ? "Share" : "Account"}</DialogTitle>
        <DialogDescription>
          {canShare
            ? "Manage your sharing settings and application preferences."
            : "Log in, create an account, or reset your password."}
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={tabValue}
        onValueChange={setTabValue}
        className="min-h-0 flex-1 overflow-hidden flex flex-col"
      >
        {tabCount > 1 && (
          <TabsList className={`grid w-full shrink-0 ${tabsClass}`}>
            {canShare && <TabsTrigger value="sharing" className={tabTriggerClass}>Share</TabsTrigger>}
            {showPlaylist && <TabsTrigger value="playlist" className={tabTriggerClass}>Studies</TabsTrigger>}
            {showDescription && <TabsTrigger value="description" className={tabTriggerClass}>Description</TabsTrigger>}
            {showLogin && <TabsTrigger value="login" className={tabTriggerClass}>{loginTabLabel}</TabsTrigger>}
            {canAnnotate && <TabsTrigger value="annotate" className={tabTriggerClass}>Questions</TabsTrigger>}
            {showSetting && <TabsTrigger value="setting" className={tabTriggerClass}>Setting</TabsTrigger>}
          </TabsList>
        )}

        {canShare && (
          <TabsContent value="sharing" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <ShareTab />
          </TabsContent>
        )}

        {showPlaylist && (
          <TabsContent value="playlist" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <PlaylistTab />
          </TabsContent>
        )}

        {showDescription && (
          <TabsContent value="description" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <DescriptionTab text={description} />
          </TabsContent>
        )}

        {showLogin && (
          <TabsContent value="login" className="mt-4 min-h-0 overflow-y-auto overscroll-contain">
            <LoginDialog authMode={authMode} setAuthMode={setAuthMode} />
          </TabsContent>
        )}

        {canAnnotate && (
          <TabsContent value="annotate" className="mt-2 min-h-0 min-w-0 overflow-y-auto overscroll-contain">
            <AnnotationTab />
          </TabsContent>
        )}

        {showSetting && (
          <TabsContent value="setting" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <SettingTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

export default DialogPage;
