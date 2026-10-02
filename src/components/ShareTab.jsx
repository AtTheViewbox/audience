import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { Globe, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserContext, UserDispatchContext } from "../context/UserContext";
import { Visibility } from "../lib/constants.js";
import { transferSessionToCurrentUrl } from "../lib/transferSharedSession.js";
import { isDemoMode } from "../lib/demoCase.js";
import {
  createShareSession,
  sameViewerStudy,
  buildJoinLink,
  ShareMode,
  VIEWBOX_SESSION_COLS,
} from "../lib/shareSession.js";
import JoinQrCard from "./JoinQrCard.jsx";

const ShareSessionState = {
  EXISTING_OTHER_SESSION: "existing other session",
  EXISTING_SAME_SESSION: "existing same session",
  NO_EXISTING_SESSION: "no existing session",
  LOADING: "loading",
};

function ShareTab() {
  const { data: viewboxData } = useContext(DataContext);
  const { dispatch } = useContext(DataDispatchContext);
  const { userDispatch } = useContext(UserDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [visibility, setVisibility] = useState(Visibility.PUBLIC);
  const [presentationModeSwitch, setPresentationModeSwitch] = useState(false);
  const [shareSessionState, setShareSessionState] = useState(ShareSessionState.LOADING);
  const [shareLink, setShareLink] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const queryParams = new URLSearchParams(window.location.search);
  const demoMode = isDemoMode(queryParams.toString());
  const canCreateSession = !!userData && (!userData.is_anonymous || demoMode);
  const liveSameStudy = shareSessionState === ShareSessionState.EXISTING_SAME_SESSION;

  function showLiveSession(row) {
    setVisibility(row.visibility);
    setPresentationModeSwitch(row.mode !== ShareMode.TEAM);
    setJoinCode(row.join_code || "");
    setShareLink(buildJoinLink(row.session_id, row.join_code));
    setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);
  }

  function clearLiveSession() {
    setJoinCode("");
    setShareLink("");
    setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
  }

  useEffect(() => {
    if (!canCreateSession) return;

    const checkWhetherUserIsSharing = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("viewbox")
          .select(VIEWBOX_SESSION_COLS)
          .eq("user", userData.id)
          .limit(1);

        if (error) throw error;

        if (!data?.[0]) {
          clearLiveSession();
        } else if (sameViewerStudy(data[0].url_params, queryParams.toString())) {
          showLiveSession(data[0]);
        } else {
          setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
        }
      } catch (error) {
        console.error(error);
        if (demoMode) {
          clearLiveSession();
          return;
        }
        userDispatch({ type: "auth_update", payload: { session: null } });
      }
    };

    checkWhetherUserIsSharing();
  }, [userData]);

  async function stopSharedSession() {
    try {
      const { error } = await supabaseClient
        .from("viewbox")
        .delete()
        .eq("user", userData.id);

      if (error) throw error;
      userDispatch({ type: "clean_up_supabase" });
      clearLiveSession();
    } catch (error) {
      console.error(error);
    }
  }

  async function transferSharedSession() {
    if (!canCreateSession) {
      toast.error("Please sign in to create a shared session.");
      return;
    }
    try {
      await transferSessionToCurrentUrl({
        supabaseClient,
        userId: userData.id,
        chatHistory: viewboxData.chatHistory || [],
        dispatch,
      });
    } catch (error) {
      console.error(error);
      toast.error("Could not transfer session.");
    }
  }

  async function generateSharedSession() {
    if (!canCreateSession) {
      toast.error("Please sign in to create a shared session.");
      return;
    }
    try {
      const data = await createShareSession({
        supabaseClient,
        userId: userData.id,
        visibility,
        mode: presentationModeSwitch ? ShareMode.PRESENTATION : ShareMode.TEAM,
        chatHistory: viewboxData.chatHistory || [],
      });

      dispatch({
        type: "connect_to_sharing_session",
        payload: {
          sessionId: data.session_id,
          mode: data.mode,
          owner: userData.id,
          joinCode: data.join_code,
        },
      });
      showLiveSession(data);
    } catch (error) {
      console.error(error);
      if (error.code === "23505") {
        setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
      }
    }
  }

  function ShareView() {
    return (
      <Card>
        <ScrollArea className="h-full flex-grow max-h-[450px] w-full overflow-y-auto">
          <CardHeader>
            <CardTitle>
              {liveSameStudy ? "Session is live" : "Share this study"}
            </CardTitle>
            <CardDescription>
              {liveSameStudy
                ? "Share the code or QR. People can also type it on the home page."
                : "Generate a short join code so others can follow along."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {shareLink ? (
              <JoinQrCard joinLink={shareLink} joinCode={joinCode} size={200} />
            ) : null}

            {liveSameStudy ? <Separator className="my-2" /> : null}

            <RadioGroup
              value={visibility}
              onValueChange={setVisibility}
              className="space-y-2 pt-2"
            >
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="PUBLIC" id="public" />
                <Label htmlFor="public" className="flex items-center cursor-pointer">
                  <Globe className="h-5 w-5 mr-2 text-blue-500" />
                  <div>
                    <p className="font-medium">Public</p>
                    <p className="text-sm text-muted-foreground">Anyone with the code can join</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="AUTHENTICATED" id="auth" />
                <Label htmlFor="auth" className="flex items-center cursor-pointer">
                  <Users className="h-5 w-5 mr-2 text-green-500" />
                  <div>
                    <p className="font-medium">Signed-in users</p>
                    <p className="text-sm text-muted-foreground">Only people with accounts</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>

            <div className="flex items-center justify-between space-x-2">
              <div>
                <Label htmlFor="presentation-mode" className="font-medium">
                  {presentationModeSwitch ? "Presentation Mode" : "Team Mode"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {presentationModeSwitch
                    ? "Viewers broadcast only to the presenter."
                    : "Everyone can broadcast to the group."}
                </p>
              </div>
              <Switch
                id="presentation-mode"
                checked={presentationModeSwitch}
                onCheckedChange={setPresentationModeSwitch}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button onClick={generateSharedSession}>
              {liveSameStudy ? "New session" : "Start session"}
            </Button>
            {liveSameStudy ? (
              <Button variant="outline" onClick={stopSharedSession}>
                Stop session
              </Button>
            ) : null}
          </CardFooter>
        </ScrollArea>
      </Card>
    );
  }

  function DifferentExistingShareView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You already have a session on another study</CardTitle>
          <CardDescription>
            You can only host one session at a time. Transfer it here, start a new one, or stop it.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-between">
          <Button onClick={transferSharedSession}>Transfer session</Button>
          <Button onClick={generateSharedSession} variant="secondary">
            New session
          </Button>
          <Button onClick={stopSharedSession} variant="outline">
            Stop session
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!canCreateSession) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to share</CardTitle>
          <CardDescription>
            You need an account to host a session.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  switch (shareSessionState) {
    case ShareSessionState.EXISTING_SAME_SESSION:
    case ShareSessionState.NO_EXISTING_SESSION:
      return ShareView();
    case ShareSessionState.EXISTING_OTHER_SESSION:
      return DifferentExistingShareView();
    default:
      return <div>Loading...</div>;
  }
}

export default ShareTab;
