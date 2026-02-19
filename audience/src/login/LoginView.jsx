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
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function LoginView({ onLogin, loginError, switchToSignUp, switchToReset }) {
  const { userData } = useContext(UserContext).data;
  return (

    <>
      <DialogHeader>
        <DialogTitle>Login</DialogTitle>
        <DialogDescription>
          Enter your credentials to access your account.
        </DialogDescription>
      </DialogHeader>
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

      <div className="flex justify-between">
        <Button variant="link" onClick={switchToReset}>Forgot password?</Button>
        <Button variant="link" onClick={switchToSignUp}>Sign up</Button>
      </div>
    </>
  );
}
