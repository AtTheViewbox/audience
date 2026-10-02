import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import {
  Globe,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QRCodeSVG } from "qrcode.react";
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
import { UserContext, UserDispatchContext } from "../context/UserContext"
import { Visibility } from "../lib/constants.js";
import { transferSessionToCurrentUrl } from "../lib/transferSharedSession.js";
import { isDemoMode } from "../lib/demoCase.js";
import {
  createShareSession,
  sameViewerStudy,
  buildJoinLink,
  ShareMode,
} from "../lib/shareSession.js";

const ShareSessionState = {
  AUTHENTICATION_ERROR: "authentication error",
  EXISTING_OTHER_SESSION: "existing other session",
  EXISTING_SAME_SESSION: "existing same session",
  NO_EXISTING_SESSION: "no existing session",
  LOADING: "loading",
};

const Mode = ShareMode;
function ShareTab() {
  const { data: viewboxData } = useContext(DataContext);
  const { dispatch } = useContext(DataDispatchContext);
  const { userDispatch } = useContext(UserDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [visibility, setVisibility] = useState(Visibility.PUBLIC);
  const [qrCodeValue, setQRCodeValue] = useState("");
  const [copyClicked, setCopyClicked] = useState(false);
  const [presentationModeSwitch, setPresentationModeSwitch] = useState(false);

  const queryParams = new URLSearchParams(window.location.search);
  const demoMode = isDemoMode(queryParams.toString());
  const canCreateSession = !!userData && (!userData.is_anonymous || demoMode);

  const [shareSessionState, setShareSessionState] = useState(
    ShareSessionState.LOADING
  );
  const [shareLink, setShareLink] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [copyCodeClicked, setCopyCodeClicked] = useState(false);

  useEffect(() => {
    const checkWhetherUserIsSharing = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("viewbox")
          .select("user, url_params, session_id,visibility,mode,join_code")
          .eq("user", userData.id);

        if (error) throw error;

        if (data.length > 1) {
          console.log("BIG ERROR");
        }

        if (data.length == 0) {
          setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
        } else if (sameViewerStudy(data[0].url_params, queryParams.toString())) {
          setVisibility(data[0].visibility);
          setPresentationModeSwitch(data[0].mode == Mode.TEAM ? false : true);
          setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);

          const shareLink = buildJoinLink(data[0].session_id, data[0].join_code);
          setJoinCode(data[0].join_code || "");
          setShareLink(shareLink);
          setQRCodeValue(shareLink);
        } else {
          setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
        }
      } catch (error) {
        console.log(error)
        if (demoMode) {
          setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
          return;
        }
        userDispatch({ type: "auth_update", payload: { session: null } });
      }
    };

    if (canCreateSession) checkWhetherUserIsSharing();
  }, [userData]);

  async function stopSharedSession() {
    try {
      const { _, delete_error } = await supabaseClient
        .from("viewbox")
        .delete()
        .eq("user", userData.id);

      if (delete_error) throw delete_error;
      userDispatch({ type: "clean_up_supabase" });
      setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
      setQRCodeValue("")
    } catch (error) {
      console.log(error.code);
    }
  }

  async function transferSharedSession() {
    if (!canCreateSession) {
      toast.error('Please sign in to create a shared session.');
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
      toast.error('Could not transfer session.');
    }
  }

  async function generateSharedSession() {
    if (!canCreateSession) {
      toast.error('Please sign in to create a shared session.');
      return;
    }
    try {
      const data = await createShareSession({
        supabaseClient,
        userId: userData.id,
        visibility,
        mode: presentationModeSwitch ? Mode.PRESENTATION : Mode.TEAM,
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
      const shareLink = buildJoinLink(data.session_id, data.join_code);
      setJoinCode(data.join_code || "");
      setShareLink(shareLink);
      setQRCodeValue(shareLink);
      setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);
    } catch (error) {
      console.log(error.code);
      if (error.code === "23505") {
        setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
      }
    }
  }

  function ShareView() {
    return (
      <Card>
        <ScrollArea className=" h-full flex-grow max-h-[450px] w-full overflow-y-auto">
          <CardHeader>
            <CardTitle>
              {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION
                ? "You already have an active shared session for this study"
                : "Welcome!"}
            </CardTitle>
            <CardDescription>
              {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION
                ? "Share the short code below, or send the link. Anyone can type the code on the home page to join."
                : "Click the button below to generate a short join code so others can hop into this study with you."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">


            {qrCodeValue && (
              <div className="flex flex-col items-center gap-3 py-2">
                <QRCodeSVG value={qrCodeValue} size={200} />
                {joinCode ? (
                  <p className="font-mono text-4xl font-bold tracking-[0.28em] text-foreground">
                    {joinCode}
                  </p>
                ) : null}
                <div className="flex items-center gap-1">
                  {joinCode ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(joinCode);
                        setCopyCodeClicked(true);
                      }}
                    >
                      {copyCodeClicked ? (
                        <Check className="h-4 w-4 mr-1.5" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1.5" />
                      )}
                      {copyCodeClicked ? "Copied code" : "Copy code"}
                    </Button>
                  ) : null}
                  {shareLink ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink);
                        setCopyClicked(true);
                      }}
                    >
                      {copyClicked ? (
                        <Check className="h-4 w-4 mr-1.5" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1.5" />
                      )}
                      {copyClicked ? "Copied link" : "Copy link"}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ? (
              <Separator className="my-2" />
            ) : null}


            <RadioGroup
              defaultValue="public"
              value={visibility}
              onValueChange={setVisibility}
              className="space-y-2 pt-2"

            >
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="PUBLIC" id="public" />
                <Label
                  htmlFor="public"
                  className="flex items-center cursor-pointer"
                >
                  <Globe className="h-5 w-5 mr-2 text-blue-500" />
                  <div>
                    <p className="font-medium">Public</p>
                    <p className="text-sm text-muted-foreground">
                      Anyone on the internet can see this
                    </p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="AUTHENTICATED" id="auth" />
                <Label
                  htmlFor="auth"
                  className="flex items-center cursor-pointer"
                >
                  <Users className="h-5 w-5 mr-2 text-green-500" />
                  <div>
                    <p className="font-medium">Authenticated users</p>
                    <p className="text-sm text-muted-foreground">
                      Only users with accounts can access this
                    </p>
                  </div>
                </Label>
              </div>
            </RadioGroup>

            <div className="flex flex-col">
              <div className="flex items-center justify-between space-x-2">
                <div>
                  <Label
                    htmlFor="presentation-mode"
                    className="font-medium"
                  >
                    {presentationModeSwitch
                      ? "Presentation Mode"
                      : "Team Mode"}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {presentationModeSwitch
                      ? " Presentation Mode is used when sharing with a large group of people. It allows users to only broadcast to the presenter screen."
                      : "Team Mode is used when sharing with a small group of people. It allows users to broadcast to all users in the session."}
                  </p>
                </div>
                <Switch
                  id="presentation-mode"
                  checked={presentationModeSwitch}
                  onCheckedChange={setPresentationModeSwitch}
                />
              </div>
            </div>
            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ? (
              <div className="space-y-2 pt-2">


                <CardDescription>
                  If you would like to inactivate the previous session and
                  create a new shared session for this study, click the generate
                  shared session button below:
                </CardDescription>
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button onClick={generateSharedSession}>
              Generate New Shared Session
            </Button>
            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ? (
              <Button variant="outline" onClick={stopSharedSession}>
                Stop Session
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
          <CardTitle>
            You have an active shared session open for a different study
          </CardTitle>
          <CardDescription>
            You can only have one shared session open at a time. If you would
            like to inactivate the other share session and create a new one for
            this study, click the button below.
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex justify-between">
          <Button onClick={transferSharedSession}>Transfer Session</Button>

          <Button onClick={generateSharedSession} variant="secondary">
            New Session
          </Button>

          <Button onClick={stopSharedSession} variant="outline">
            Stop Session
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
            You need a verified account to create a shared session. Please sign in and try again.
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

