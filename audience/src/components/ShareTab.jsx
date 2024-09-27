import { Button } from "@/components/ui/button";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { ClipboardCopy, Globe, Lock, Users, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area"
import { QRCodeSVG } from 'qrcode.react'
import { LoginTab } from "./LoginTab.jsx";
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
function ShareTab() {
  const { dispatch } = useContext(DataDispatchContext);

  const { supabaseClient, userData } = useContext(DataContext).data;

  const [visibility, setVisibility] = useState("public")
  const [emails, setEmails] = useState([])
  const [currentEmail, setCurrentEmail] = useState("")
  const [qrCodeValue, setQRCodeValue] = useState('')



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
          .select("user, url_params, session_id")
          .eq("user", userData.id);

        if (error) throw error;

        if (data.length > 1) {
          console.log("BIG ERROR");
        }
        console.log(queryParams.toString())
        if (data.length == 0) {
          setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
        } else if (data[0].url_params == queryParams.toString()) {
          setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);
          queryParams.set("s", data[0].session_id);
          setShareLink(`${window.location.origin}/?${queryParams.toString()}`);
          setQRCodeValue(`${window.location.origin}/?${queryParams.toString()}`)
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
      dispatch({type: "clean_up_supabase"});
      setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
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
      console.log(queryParams.toString());
      const { data, write_error } = await supabaseClient
        .from("viewbox")
        .insert([{ user: userData.id, url_params: queryParams.toString() }])
        .select();
      console.log(data);
      if (write_error) throw write_error;

      // once a shared session is created, need to now create a room
      dispatch({
        type: "connect_to_sharing_session",
        payload: { sessionId: data[0].session_id },
      });

      queryParams.set("s", data[0].session_id);
      setShareLink(`${window.location.origin}/?${queryParams.toString()}`);
      setQRCodeValue(shareLink)
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
        <CardHeader>
          <CardTitle>Welcome! </CardTitle>
          <CardDescription>
            Click the button below to generate a link to a shared session where
            you and others can interact with the dicom together!
          </CardDescription>
        </CardHeader>

        <CardFooter>
          <Button onClick={generateSharedSession}>
            Generate Shared Session
          </Button>
        </CardFooter>
      </Card>
    );
  }

  function SameExistingShareView() {
    return (
      <ScrollArea  className="h-[500px]">   
      
      <Card>
        <CardHeader>
          <CardTitle>
            You already have an active shared session for this study
          </CardTitle>
          <CardDescription>
            Here is the link to the existing shared session if you would like to
            share it with more people.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-1.5">
        <RadioGroup defaultValue="public" value={visibility} onValueChange={setVisibility}>
        <div className="flex items-center space-x-2 mb-4">
          <RadioGroupItem value="public" id="public" />
          <Label htmlFor="public" className="flex items-center cursor-pointer">
            <Globe className="h-5 w-5 mr-2 text-blue-500" />
            <div>
              <p className="font-medium">Public</p>
              <p className="text-sm text-muted-foreground">Anyone on the internet can see this</p>
            </div>
          </Label>
        </div>
        <div className="flex items-center space-x-2 mb-4">
          <RadioGroupItem value="org" id="org" />
          <Label htmlFor="org" className="flex items-center cursor-pointer">
          <Users className="h-5 w-5 mr-2 text-green-500" />
            <div>
              <p className="font-medium">Within my organization</p>
              <p className="text-sm text-muted-foreground">Only members of your organization can access this</p>
            </div>
          </Label>
        </div>
        <div className="flex items-center space-x-2 mb-4">
          <RadioGroupItem value="private" id="private" />
          <Label htmlFor="private" className="flex items-center cursor-pointer">
          <Lock className="h-5 w-5 mr-2 text-red-500" />
            <div>
              <p className="font-medium">Private</p>
              <p className="text-sm text-muted-foreground">You and shared users can access this</p>
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
<Separator className="my-4" />
<div className="space-y-1">
          {qrCodeValue && (
              <div className="flex justify-center mt-4">
                <QRCodeSVG value={qrCodeValue} size={200} />
              </div>
            )}
          </div>
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input disabled placeholder={shareLink} />
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
        </CardContent>
        <CardFooter className="flex justify-between">
        
          <Button onClick={generateSharedSession}>
            Generate New Shared Session
          </Button>
          <Button variant="outline" onClick={stopSharedSession}>
            Stop Session
          </Button>
        
        </CardFooter>
      </Card>
 </ScrollArea>
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
        <CardFooter>
          <Button onClick={generateSharedSession}>
            Generate New Shared Session
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!userData || userData.is_anonymous) return <LoginTab />;

  switch (shareSessionState) {
    case ShareSessionState.LOGGED_OUT:
      return <LoginTab />;
    case ShareSessionState.NO_EXISTING_SESSION:
      return <ShareView />;
    case ShareSessionState.EXISTING_OTHER_SESSION:
      return <DifferentExistingShareView />;
    case ShareSessionState.EXISTING_SAME_SESSION:
      return <SameExistingShareView />;
    default:
      return <div>Loading...</div>;
  }
}

export default ShareTab;
