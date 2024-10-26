import { Button } from "@/components/ui/button";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { ClipboardCopy, Globe, Lock, Users, Plus, X, Presentation } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area"
import { QRCodeSVG } from 'qrcode.react'
import { LoginTab } from "./LoginTab.jsx";
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const ShareSessionState = {
  AUTHENTICATION_ERROR: "authentication error",
  EXISTING_OTHER_SESSION: "existing other session",
  EXISTING_SAME_SESSION: "existing same session",
  NO_EXISTING_SESSION: "no existing session",
  LOADING: "loading",
};

const Visibility = {
  AUTHENTICATED: "AUTHENTICATED",
  PUBLIC: "PUBLIC",
};

const Mode = {
  PRESENTATION:"PRESENTATION",
  TEAM:"TEAM"
};
function ShareTab() {
  const { dispatch } = useContext(DataDispatchContext);

  const { supabaseClient, userData } = useContext(DataContext).data;

  const [visibility, setVisibility] = useState(Visibility.AUTHENTICATED)
  const [emails, setEmails] = useState([])
  const [currentEmail, setCurrentEmail] = useState("")
  const [qrCodeValue, setQRCodeValue] = useState('')
  const [presentationModeSwitch, setPresentationModeSwitch] = useState(false);


  const addEmail = () => {
    var currentEmail = document.getElementById("email-input").value;
    if (currentEmail && !emails.includes(currentEmail)) {
      setEmails([...emails, currentEmail])
      setCurrentEmail("")
    }
  }

  const removeEmail = (email) => {
    setEmails(emails.filter(e => e !== email))
  }

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
          setVisibility(data[0].visibility)
          setPresentationModeSwitch(data[0].mode==Mode.TEAM?false:true)
          setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);

          const newQueryParams = new URLSearchParams("");
          newQueryParams.set("s", data[0].session_id);
          setShareLink(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`);
          setQRCodeValue(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`)

        } else {
          setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
        }
      } catch (error) {
        dispatch({ type: "auth_update", payload: { session: null } });
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
      dispatch({ type: "clean_up_supabase" });
      setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
    } catch (error) {
      console.log(error.code);
    }
  }

  async function transferSharedSession() {
    try {
      console.log(queryParams.toString())
      const { data, update_error } = await supabaseClient
        .from("viewbox")
        .upsert({ user: userData.id, url_params: queryParams.toString() })
        .select()
      queryParams.set("s", data[0].session_id);
      if (update_error) throw delete_error;
      setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);

      const newQueryParams = new URLSearchParams("");
      newQueryParams.set("s", data[0].session_id);
      setVisibility(data[0].visibility)
      setPresentationModeSwitch(data[0].mode==Mode.TEAM?false:true)
      setShareLink(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`);
      setQRCodeValue(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`)
      dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: data[0].session_id } })

    } catch (error) {
      console.log(error.code);
    }
  }

  async function generateSharedSession() {
    try {
      const { _, delete_error } = await supabaseClient
        .from("viewbox")
        .delete()
        .eq("user", userData.id);

      if (delete_error) throw delete_error;

      const { data, insert_error } = await supabaseClient
        .from("viewbox")
        .upsert([{ user: userData.id, url_params: queryParams.toString(), visibility: visibility,mode: presentationModeSwitch?Mode.PRESENTATION:Mode.TEAM }])
        .select();
      if (insert_error) throw insert_error;

      // once a shared session is created, need to now create a room
      dispatch({
        type: "connect_to_sharing_session",
        payload: { sessionId: data[0].session_id,mode:data[0].mode },
      });
      const newQueryParams = new URLSearchParams();
      newQueryParams.set("s", data[0].session_id);
      queryParams.set("s", data[0].session_id);
      setShareLink(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`);
      setQRCodeValue(`${window.location.origin+ window.location.pathname}/?${newQueryParams.toString()}`)
      setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION)

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
            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ?
              "You already have an active shared session for this study" :
              "Welcome!"}
          </CardTitle>
          <CardDescription>
            {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ? "Here is the link to the existing shared session if you would like to share it with more people." :
              "Click the button below to generate a link to a shared session where you and others can interact with the dicom together!"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <RadioGroup defaultValue="public" value={visibility} onValueChange={setVisibility}>
            <div className="flex items-center space-x-2 mb-4">
              <RadioGroupItem value="PUBLIC" id="public" />
              <Label htmlFor="public" className="flex items-center cursor-pointer">
                <Globe className="h-5 w-5 mr-2 text-blue-500" />
                <div>
                  <p className="font-medium">Public</p>
                  <p className="text-sm text-muted-foreground">Anyone on the internet can see this</p>
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 mb-4">
              <RadioGroupItem value="AUTHENTICATED" id="auth" />
              <Label htmlFor="auth" className="flex items-center cursor-pointer">
                <Users className="h-5 w-5 mr-2 text-green-500" />
                <div>
                  <p className="font-medium">Authenticated users</p>
                  <p className="text-sm text-muted-foreground">Only users with accounts can access this</p>
                </div>
              </Label>
            </div>
          </RadioGroup>

          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between space-x-2">
              <div>
                <Label htmlFor="presentation-mode" className="font-medium">
                  {presentationModeSwitch ? "Presentation Mode" : "Team Mode"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {presentationModeSwitch ? " Presentation Mode is used when sharing with a large group of people. It allows users to only broadcast to the presenter screen." :
                    "Team Mode is used when sharing with a small group of people. It allows users to broadcast to all users in the session."}
                </p>
              </div>
              <Switch
                id="presentation-mode"
                checked={presentationModeSwitch}
                onCheckedChange={setPresentationModeSwitch}
              />
            </div>

          </div>
          {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ?
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {qrCodeValue && (
                  <div className="flex justify-center mt-4">
                    <QRCodeSVG value={qrCodeValue} size={200} />
                  </div>
                )}
              </div>
              <div className="flex w-full max-w-sm items-center space-x-2">
                {/**<Input disabled placeholder={shareLink} />*/}
                <Input value={shareLink} readOnly/>
                <Button
                  size="icon"
                  onClick={() => navigator.clipboard.writeText(shareLink)}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </div>

              <CardDescription>
                If you would like to inactivate the previous session and create a
                new shared session for this study, click the generate shared session
                button below:
              </CardDescription>
            </> : null}

        </CardContent>

        <CardFooter className="flex justify-between">

          <Button onClick={generateSharedSession}>
            Generate New Shared Session
          </Button>
          {shareSessionState == ShareSessionState.EXISTING_SAME_SESSION ?
            <Button variant="outline" onClick={stopSharedSession}>
              Stop Session
            </Button> : null}

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
        {/* <CardContent className="space-y-2">
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input disabled placeholder="link to go here" />
            <Button size="icon">
              <ClipboardCopy className="h-4 w-4"/>
            </Button>
          </div>
          <div className="space-y-1">
            <Label>QR to go here</Label>
          </div>
          <CardDescription>
            If you would like to inactivate the previous session and create a new shared session, click the generate shared session button below:
          </CardDescription>
        </CardContent> */}

        <CardFooter className="flex justify-between">

          <Button onClick={transferSharedSession}>
            Transfer Session
          </Button>

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

  if (!userData || userData.is_anonymous) return <LoginTab />;

  switch (shareSessionState) {
    case ShareSessionState.LOGGED_OUT:
      return <LoginTab />;
    case ShareSessionState.EXISTING_SAME_SESSION:
    case ShareSessionState.NO_EXISTING_SESSION:
      return <ShareView />;
    case ShareSessionState.EXISTING_OTHER_SESSION:
      return <DifferentExistingShareView />;
    //case ShareSessionState.EXISTING_SAME_SESSION:
    //  return <SameExistingShareView />;
    default:
      return <div>Loading...</div>;
  }
}

export default ShareTab;

{/** 
          <CardContent className="space-y-1.5">
            <RadioGroup defaultValue="public" value={visibility} onValueChange={setVisibility}>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="PUBLIC" id="public" />
                <Label htmlFor="public" className="flex items-center cursor-pointer">
                  <Globe className="h-5 w-5 mr-2 text-blue-500" />
                  <div>
                    <p className="font-medium">Public</p>
                    <p className="text-sm text-muted-foreground">Anyone on the internet can see this</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 mb-4">
                <RadioGroupItem value="AUTHENTICATED" id="auth" />
                <Label htmlFor="auth" className="flex items-center cursor-pointer">
                  <Users className="h-5 w-5 mr-2 text-green-500" />
                  <div>
                    <p className="font-medium">Authenticated users</p>
                    <p className="text-sm text-muted-foreground">Only users with accounts can access this</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>

            {visibility === "private" && (
              <div className="mt-4 space-y-4">
                <Label htmlFor="email-input">Add email addresses to share with:</Label>
                <div className="flex space-x-2">
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="Enter email address"
                    className="flex-grow"
                  />
                  <Button onClick={addEmail} size="icon">
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Add email</span>
                  </Button>
                </div>
                {emails.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold mb-2">Added Emails:</h3>
                    <ScrollArea className="h-[200px] w-full rounded-md border">
                      <div className="p-4 space-y-2">
                        {emails.map((email) => (
                          <div key={email} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                            <span className="text-sm">{email}</span>
                            <Button onClick={() => removeEmail(email)} variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <X className="h-4 w-4" />
                              <span className="sr-only">Remove {email}</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
  */}

