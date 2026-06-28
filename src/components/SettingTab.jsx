import { Button } from "@/components/ui/button"
import { ChevronRight, LogOut, Home } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { UserContext, UserDispatchContext } from "../context/UserContext"
import { DataContext, DataDispatchContext } from "../context/DataContext"
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  getShowMedGemmaButton,
  getAutoTransferSession,
  setShowMedGemmaLocal,
  getLeaderboardEnabled,
  setLeaderboardEnabledLocal,
} from "../lib/userPreferences"

import {
  Card,
  CardContent,
} from "@/components/ui/card"


function SettingTab() {
  const { userData, supabaseClient } = useContext(UserContext).data;
  const { userDispatch } = useContext(UserDispatchContext);
  const { sessionId, sessionMeta } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const navigate = useNavigate();

  const inSession = !!sessionId;
  const isSessionOwner = !!userData && sessionMeta?.owner === userData.id;
  // The leaderboard is a session-wide setting: only the author may change it,
  // and participants don't get an individual toggle.
  const canControlLeaderboard = !inSession || isSessionOwner;

  const [showMedGemma, setShowMedGemma] = useState(false);
  const [autoTransfer, setAutoTransfer] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAnonymous = userData?.is_anonymous;

  useEffect(() => {
    if (!userData) return;
    setShowMedGemma(getShowMedGemmaButton(userData));
    setAutoTransfer(getAutoTransferSession(userData));
    setShowLeaderboard(getLeaderboardEnabled(userData));
  }, [
    userData,
    userData?.id,
    userData?.is_anonymous,
    userData?.user_metadata?.show_medgemma_button,
    userData?.user_metadata?.auto_transfer_session,
    userData?.user_metadata?.show_leaderboard,
  ]);

  function mergeUserMetadata(patch) {
    return {
      ...userData,
      user_metadata: { ...userData.user_metadata, ...patch },
    };
  }

  async function persistMedGemma(checked) {
    setShowMedGemma(checked);
    if (isAnonymous) {
      setShowMedGemmaLocal(checked);
      return;
    }
    const prev = userData.user_metadata?.show_medgemma_button;
    userDispatch({
      type: 'auth_update',
      payload: { session: { user: mergeUserMetadata({ show_medgemma_button: checked }) } },
    });
    setSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: { show_medgemma_button: checked },
      });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      userDispatch({
        type: 'auth_update',
        payload: { session: { user: mergeUserMetadata({ show_medgemma_button: prev }) } },
      });
      setShowMedGemma(!checked);
    } finally {
      setSaving(false);
    }
  }

  async function persistAutoTransfer(checked) {
    setAutoTransfer(checked);
    const prev = userData.user_metadata?.auto_transfer_session;
    userDispatch({
      type: 'auth_update',
      payload: { session: { user: mergeUserMetadata({ auto_transfer_session: checked }) } },
    });
    setSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: { auto_transfer_session: checked },
      });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      userDispatch({
        type: 'auth_update',
        payload: { session: { user: mergeUserMetadata({ auto_transfer_session: prev }) } },
      });
      setAutoTransfer(!checked);
    } finally {
      setSaving(false);
    }
  }

  async function persistLeaderboard(checked) {
    setShowLeaderboard(checked);
    // Push the change to everyone in the session immediately (author only).
    if (inSession && isSessionOwner) {
      dispatch({ type: 'broadcast_leaderboard', payload: checked });
    }
    if (isAnonymous) {
      setLeaderboardEnabledLocal(checked);
      return;
    }
    const prev = userData.user_metadata?.show_leaderboard;
    userDispatch({
      type: 'auth_update',
      payload: {
        session: {
          user: mergeUserMetadata({ show_leaderboard: checked }),
        },
      },
    });
    setSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: { show_leaderboard: checked },
      });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      userDispatch({
        type: 'auth_update',
        payload: {
          session: { user: mergeUserMetadata({ show_leaderboard: prev }) },
        },
      });
      setShowLeaderboard(!checked);
    } finally {
      setSaving(false);
    }
  }

  async function logOut() {

    try {
      let { error } = await supabaseClient.auth.signOut({ scope: 'global', })
      if (error) throw error;

      //log back in as Anonymous user 
      const { data: { user }, error: signInError } = await supabaseClient.auth.signInAnonymously();
    } catch (error) {
      console.log(error)
    }
  }
  // Get initials from user name for avatar fallback
  const getInitials = (name, email) => {
    if (!name && !email) return "GU";
    const source = name || email;
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  if (!userData) return null;

  const displayName = userData.user_metadata?.name || userData.email || "Guest User";
  const displayEmail = isAnonymous ? "Anonymous Session" : userData.email;

  return (
    <Card>
      <CardContent>
        <div className="py-4 flex items-center space-x-4 border-b">
          <Avatar className="h-16 w-16">
            <AvatarFallback className={`text-lg ${isAnonymous ? 'bg-orange-100 text-orange-800' : 'bg-slate-200 text-slate-800'}`}>
              {getInitials(userData.user_metadata?.name, userData.email)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h3 className="font-medium text-base">{displayName}</h3>
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="pref-medgemma" className="text-sm font-medium">MedGemma AI button</Label>
              <p className="text-xs text-muted-foreground">
                Show the assistant button on the viewer.
              </p>
            </div>
            <Switch
              id="pref-medgemma"
              checked={showMedGemma}
              disabled={saving}
              onCheckedChange={persistMedGemma}
            />
          </div>

          <div className={`flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3 ${isAnonymous ? 'opacity-60' : ''}`}>
            <div className="space-y-0.5">
              <Label htmlFor="pref-autotransfer" className="text-sm font-medium">Auto-transfer share session</Label>
              <p className="text-xs text-muted-foreground">
                If you already have an active share session and open a different study, automatically move the session to the current study (same as Transfer Session).
              </p>
            </div>
            <Switch
              id="pref-autotransfer"
              checked={autoTransfer}
              disabled={saving || isAnonymous}
              onCheckedChange={persistAutoTransfer}
            />
          </div>

          {canControlLeaderboard && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="pref-leaderboard" className="text-sm font-medium">
                  Leaderboard
                </Label>
                <p className="text-xs text-muted-foreground">
                  {inSession
                    ? "Show the ranking to everyone in this session after they submit answers."
                    : "Show ranking after participants submit answers."}
                </p>
              </div>
              <Switch
                id="pref-leaderboard"
                checked={showLeaderboard}
                disabled={saving}
                onCheckedChange={persistLeaderboard}
              />
            </div>
          )}

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-start text-left h-auto py-3"
            onClick={() => { navigate("/"); }}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5" />
                <span>Navigate Home</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Button>
          {!isAnonymous && (
            <Button
              variant="ghost"
              className="w-full justify-start text-left h-auto py-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={logOut}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <LogOut className="h-5 w-5" />
                  <span>Log Out</span>
                </div>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

  );
}

export default SettingTab;
