import { Button } from "@/components/ui/button"
import 
// import { useState, useContext } from 'react';
// import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';

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

function ToolsTab() {
  
  const [loginError, setLoginError] = useState(null);

  async function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const { error } = await supabase.auth.signIn({
        email: username,
        password: password,
      });

      if (error) throw error;
    } catch (error) {
      setLoginError(error.message);
    }
  }
  // const { sharing } = useContext(DataContext).data;
  // // get mode from state

  // const { dispatch } = useContext(DataDispatchContext);

  // STATE
  // is user logged in
  // what is the user's name

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



  let isLoggedIn = false; // This should be replaced with actual logic to check if the user is logged in

  switch (isLoggedIn) {
    case false:
      return <NotLoggedInView />;
    default:
      return (
        <>
          {/* Content for logged in users goes here */}
        </>
      );
  }
}

export default ToolsTab;