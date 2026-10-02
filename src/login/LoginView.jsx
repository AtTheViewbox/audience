// components/Login/LoginView.jsx
import { useContext } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, User } from "lucide-react";
import OAuthButtons from "./OAuthButtons.jsx";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function LoginView({ onLogin, loginError, switchToSignUp, switchToReset, onGoogleLogin }) {
  const { userData } = useContext(UserContext).data;
  return (

    <>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required />
        </div>
        {loginError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Login failed. Please check your credentials.
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={onLogin} type="submit" className="w-full">
          Login
        </Button>
      </div>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-700" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <OAuthButtons onGoogleLogin={onGoogleLogin} />

      <div className="flex justify-between mt-2">
        <Button variant="link" onClick={switchToReset}>Forgot password?</Button>
        <Button variant="link" onClick={switchToSignUp}>Sign up</Button>
      </div>
    </>
  );
}
