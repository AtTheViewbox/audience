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

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserContext, UserDispatchContext } from "../context/UserContext"
import { Visibility } from "../lib/constants.js";

const ShareSessionState = {
  AUTHENTICATION_ERROR: "authentication error",
  EXISTING_OTHER_SESSION: "existing other session",
  EXISTING_SAME_SESSION: "existing same session",
  NO_EXISTING_SESSION: "no existing session",
  LOADING: "loading",
};

const Mode = {
  PRESENTATION: "PRESENTATION",
  TEAM: "TEAM",
};
function ShareTab() {
  const { dispatch } = useContext(DataDispatchContext);
  const { userDispatch } = useContext(UserDispatchContext);
  const { userData, supabaseClient } = useContext(UserContext).data;

  const [visibility, setVisibility] = useState(Visibility.PUBLIC);
  const [qrCodeValue, setQRCodeValue] = useState("");
  const [copyClicked, setCopyClicked] = useState(false);
  const [presentationModeSwitch, setPresentationModeSwitch] = useState(false);

  const queryParams = new URLSearchParams(window.location.search);

  const [shareSessionState, setShareSessionState] = useState(
    ShareSessionState.LOADING
  );
  const [shareLink, setShareLink] = useState(null);

  useEffect(() => {
    const checkWhetherUserIsSharing = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("viewbox")
          .select("user, url_params, session_id,visibility,mode")
          .eq("user", userData.id);

        if (error) throw error;

        if (data.length > 1) {
          console.log("BIG ERROR");
        }

        if (data.length == 0) {
          setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
        } else if (data[0].url_params == queryParams.toString()) {
          setVisibility(data[0].visibility);
          setPresentationModeSwitch(data[0].mode == Mode.TEAM ? false : true);
          setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);

          const newQueryParams = new URLSearchParams("");
          newQueryParams.set("s", data[0].session_id);
          setShareLink(
            `${window.location.origin + window.location.pathname
            }?${newQueryParams.toString()}`
          );
          setQRCodeValue(
            `${window.location.origin + window.location.pathname
            }?${newQueryParams.toString()}`
          );
        } else {
          setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
        }
      } catch (error) {
        console.log(error)
        userDispatch({ type: "auth_update", payload: { session: null } });
      }
    };

    if (userData && !userData.is_anonymous) checkWhetherUserIsSharing();
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
    if (!userData || userData.is_anonymous) {
      toast.error('Please sign in to create a shared session.');
      return;
    }
    try {
      console.log(queryParams.toString());
      const { data, update_error } = await supabaseClient
        .from("viewbox")
        .upsert({ user: userData.id, url_params: queryParams.toString() })
        .select();
      queryParams.set("s", data[0].session_id);
      if (update_error) throw delete_error;
      setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);

      const newQueryParams = new URLSearchParams("");
      newQueryParams.set("s", data[0].session_id);
      setVisibility(data[0].visibility);
      setPresentationModeSwitch(data[0].mode == Mode.TEAM ? false : true);
      setShareLink(
        `${window.location.origin + window.location.pathname
        }?${newQueryParams.toString()}`
      );
      setQRCodeValue(
        `${window.location.origin + window.location.pathname
        }?${newQueryParams.toString()}`
      );
      dispatch({
        type: "connect_to_sharing_session",
        payload: { sessionId: data[0].session_id },
      });

      //TODO: Fix buggy tranfering sessions, but reloading works for now.
      window.location.reload();
    } catch (error) {
      console.log(error.code);
    }
  }

  async function generateSharedSession() {
    if (!userData || userData.is_anonymous) {
      toast.error('Please sign in to create a shared session.');
      return;
    }
    try {
      const { _, delete_error } = await supabaseClient
        .from("viewbox")
        .delete()
        .eq("user", userData.id);

      if (delete_error) throw delete_error;

      const { data, insert_error } = await supabaseClient
        .from("viewbox")
        .upsert([
          {
            user: userData.id,
            url_params: queryParams.toString(),
            visibility: visibility,
            mode: presentationModeSwitch ? Mode.PRESENTATION : Mode.TEAM,
          },
        ])
        .select();
      if (insert_error) throw insert_error;

      // once a shared session is created, need to now create a room
      dispatch({
        type: "connect_to_sharing_session",
        payload: { sessionId: data[0].session_id, mode: data[0].mode },
      });
      const newQueryParams = new URLSearchParams();
      newQueryParams.set("s", data[0].session_id);
      const shareLink = `${window.location.origin + window.location.pathname}?${newQueryParams.toString()}`;
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
                ? "Here is the link to the existing shared session if you would like to share it with more people."
                : "Click the button below to generate a link to a shared session where you and others can interact with the dicom together!"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">


            {qrCodeValue && (
              <div className="flex justify-center">
                <QRCodeSVG value={qrCodeValue} size={200} />
              </div>
            )}

            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ? (
              <>
                <div className="flex w-full max-w-sm items-center space-x-2 p-2">

                  {/**<Input disabled placeholder={shareLink} />*/}
                  <Input value={shareLink} readOnly />
                  <Button
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink)
                      setCopyClicked(true)
                    }}
                  >
                    {copyClicked ? (
                      <Check className="h-4" />
                    ) : (
                      <Copy className="h-4" />
                    )}
                  </Button>

                </div>
                <Separator className="my-2" />
              </>
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



  // Anonymous users cannot create sessions
  if (!userData || userData.is_anonymous) {
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

