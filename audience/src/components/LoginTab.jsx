import { useState, useContext } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MailIcon, UserIcon,CheckCircle  } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const LoginState = {
  LOGIN: "login",
  SIGN_UP: "sign up",
  FORGET_PASSWORD: "reset password",
  LOADING: "loading",
};

export function LoginTab() {
  const { supabaseClient } = useContext(DataContext).data;
  const [loginError, setloginError] = useState(false);
  const [signUpError, setSignUpError] = useState(null);
  const [loginState, setLoginState] = useState(LoginState.LOGIN);
  const [isLoading, setisLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  async function handleLogin() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) {
      setloginError(true);
      throw error;
    }
    setloginError(false);
    location.reload();
  }

  async function handleSignUp() {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try{
      setisLoading(true)
      const { data, error } = await supabaseClient.auth.signUp({
        name: name,
        email: email,
        password: password,
      });
      if (error) {
        setSignUpError(error);
        throw error;
      }
      setisLoading(false)
      setSignUpSuccess(true)
      setSignUpError(null);
    }
    catch(error){
      console.log(error)
    }
    
  }

  
  async function loginWithProvider(provider) {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: provider,
      options: {
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
  }
  function LoginView() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Login </CardTitle>
          <CardDescription>Login to Generate Share Link</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                //value={email}
                //onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                //value={password}
                //onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {!loginError ? null : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Login failed. Please check your credentials.
                </AlertDescription>
              </Alert>
            )}
            
            <Button onClick={handleLogin} type="submit" className="w-full">
              Login
            </Button>

          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" disabled>
              <MailIcon className="mr-2 h-4 w-4" />
              Outlook
            </Button>
            <Button variant="outline" disabled>
              <MailIcon className="mr-2 h-4 w-4" />
              Google
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="link">Forgot password?</Button>
          <Button variant="link" onClick={()=>{setLoginState(LoginState.SIGN_UP)}} >Sign up</Button>
        </CardFooter>
      </Card>
    );
  }
  function SignUpView() {
    return (
    <Card >
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Sign up to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="John Doe" required />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              required
            />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required />
          </div>
          {signUpError && (
              <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Sign Up failed. Check email and password.
              </AlertDescription>
            </Alert>
            )}
            {signUpSuccess &&(
              <Alert variant="default" className="border-green-500 bg-green-50 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Confirm Email and Login</AlertDescription>
            </Alert>
            )}
        </div>
       
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={()=>setLoginState(LoginState.LOGIN)}>Login</Button>
        <Button disabled={isLoading} onClick={handleSignUp}>
          {isLoading ? "Signing up..." : "Sign up"}
        </Button>
      </CardFooter>
    </Card>
    )
  }

  switch (loginState) {
    case LoginState.LOGIN:
      return <LoginView />;
    case LoginState.SIGN_UP:
      return <SignUpView />;
    //case loginState.FORGET_PASSWORD:
    //  return <DifferentExistingShareView />;
    default:
      return <div>Loading...</div>;
  }
}
