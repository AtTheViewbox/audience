import { Button } from "@/components/ui/button"
import { useState, useContext, useEffect } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { ClipboardCopy } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const ShareSessionState = {
  AUTHENTICATION_ERROR: "authentication error",
  EXISTING_OTHER_SESSION: "existing other session",
  EXISTING_SAME_SESSION: "existing same session",
  NO_EXISTING_SESSION: "no existing session",
  LOADING: 'loading'
};
function ShareTab() {

  const { dispatch } = useContext(DataDispatchContext);
  const { supabaseClient, user_data } = useContext(DataContext).data;

  const queryParams = new URLSearchParams(window.location.search);
  queryParams.delete('s');

  console.log(supabaseClient, user_data)
  
  const [shareSessionState, setShareSessionState] = useState(ShareSessionState.LOADING);
  const [shareLink, setShareLink] = useState(null);

  useEffect(() => {

    const checkWhetherUserIsSharing = async () => {

      try {
        const { data, error } = await supabaseClient
          .from('viewbox').select('user, url_params, session_id')
          .eq('user', user_data.user.id)
        
        if (error) throw error;
          // .select('user_id, url_params')
          // .eq('name', user_data.user.id)
        if (data.length > 1) { console.log("BIG ERROR") };
        console.log(data)
        if (data.length == 0) {
          setShareSessionState(ShareSessionState.NO_EXISTING_SESSION);
        } else if (data[0].url_params == queryParams.toString()) {
          setShareSessionState(ShareSessionState.EXISTING_SAME_SESSION);
          queryParams.set('s', data[0].session_id);
          setShareLink(`http://localhost:5173/?${queryParams.toString()}`)
        } else {
          setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION);
        }
      } catch (error) {
        dispatch({type: 'auth_update', payload: {session: null}})
      }
    };

    if (user_data) checkWhetherUserIsSharing();

  }, [user_data]);

  async function handleLogin() {

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: username,
        password: password,
      });

      if (error) throw error;

      // if user logged in successfully, the auth listener will automatically register that and change state
      
    } catch (error) {
      console.log(error)
    }
  }

  async function generateSharedSession() {

    try {

      const { _, delete_error } = await supabaseClient
        .from('viewbox')
        .delete()
        .eq('user', user_data.user.id);

      if (delete_error) throw delete_error;

      const { data, write_error } = await supabaseClient
        .from('viewbox')
        .insert([
          { url_params: queryParams.toString() },
        ])
        .select() 

      if (write_error) throw write_error;

      // once a shared session is created, need to now create a room
      dispatch({type: 'connect_to_sharing_session', payload: {sessionId: data[0].session_id}})
      
      queryParams.set('s', data[0].session_id);
      setShareLink(`http://localhost:5173/?${queryParams.toString()}`)
      //set state
      
    } catch (error) {
      console.log(error.code)
      if (error.code === '23505') {
        setShareSessionState(ShareSessionState.EXISTING_OTHER_SESSION)
      } 
      //setLoginError(error.message);
    }
  }

  function NotLoggedInView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>To enable sharing, you will need to login first...</CardTitle>
          <CardDescription>
            Please login to access sharing tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" type="text" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleLogin}>Login</Button>
        </CardFooter>
      </Card>
    );
  }

  function ShareView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome! </CardTitle>
          <CardDescription>
            Click the button below to generate a link to a shared session where you and others can interact with the dicom together!
          </CardDescription>
        </CardHeader>
        {/* <CardContent className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="username">Username</Label>
            <Input id="username" type="text" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" />
          </div>
        </CardContent> */}
        <CardFooter>
          <Button onClick={generateSharedSession}>Generate Shared Session</Button>
        </CardFooter>
      </Card>
    );
  }

  function SameExistingShareView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You already have an active shared session for this study</CardTitle>
          <CardDescription>
            Here is the link to the existing shared session if you would like to share it with more people.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input disabled placeholder={ shareLink } />
            <Button size="icon" onClick={() => navigator.clipboard.writeText(shareLink)}>
              <ClipboardCopy className="h-4 w-4"/>
            </Button>
          </div>
          <div className="space-y-1">
            <Label>QR to go here</Label>
          </div>
          <CardDescription>
            If you would like to inactivate the previous session and create a new shared session for this study, click the generate shared session button below:
          </CardDescription>
        </CardContent>
        <CardFooter>
          <Button onClick={generateSharedSession}>Generate New Shared Session</Button>
        </CardFooter>
      </Card>
    );
  }

  function DifferentExistingShareView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You have an active shared session open for a different study</CardTitle>
          <CardDescription>
            You can only have one shared session open at a time. If you would like to inactivate the other share session and create a new one for this study, click the button below.
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
          <Button onClick={generateSharedSession}>Generate New Shared Session</Button>
        </CardFooter>
      </Card>
    );
  }

  if (!user_data) return <NotLoggedInView />;

  // if there are no sessions open by the user
  // if the same session is opened by the user
  // if a different session is open by the user



  console.log(shareSessionState)
  switch (shareSessionState) {
    case ShareSessionState.LOGGED_OUT:
      return <NotLoggedInView />;
    case ShareSessionState.NO_EXISTING_SESSION:
      return <ShareView />;
    case ShareSessionState.EXISTING_OTHER_SESSION:
      return <DifferentExistingShareView />
    case ShareSessionState.EXISTING_SAME_SESSION:
      return <SameExistingShareView />;
    default:
      return <div>Loading...</div>;
  }
}

export default ShareTab;