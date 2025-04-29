// components/Login/SignUpView.jsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"

export default function SignUpView({
  onSignUp, isLoading, error, success, switchToLogin,
}) {
  return (
   
<>
      <DialogHeader>
          <DialogTitle>Create an account</DialogTitle>
          <DialogDescription>
          Sign up to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="grid w-full items-center gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="John Doe" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="john@example.com" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>Sign Up failed. Check email and password. {error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="default" className="border-green-500 bg-green-50 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Confirm Email and Login</AlertDescription>
            </Alert>
          )}
        </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={switchToLogin}>Login</Button>
        <Button disabled={isLoading} onClick={onSignUp}>
          {isLoading ? "Signing up..." : "Sign up"}
        </Button>
      </div>
      </>
  );
}
