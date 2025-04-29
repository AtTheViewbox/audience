// components/Login/PasswordRecovery.jsx
import {
    Card, CardHeader, CardTitle, CardDescription,
    CardContent, CardFooter,
  } from "@/components/ui/card";
  import { Input } from "@/components/ui/input";
  import { Button } from "@/components/ui/button";
  import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
  import { Check, ArrowLeft } from "lucide-react";
  import { Label } from "@/components/ui/label";
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog"
  
  export default function PasswordRecovery({
    onSendReset, sent, switchToLogin,
  }) {
    return (
        <>

        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
          {!sent
              ? "Enter your email and we'll send a reset link."
              : "Check your inbox for the recovery link."}
          </DialogDescription>
        </DialogHeader>
  
        {!sent ? (
          <>
            <div>
              <Label htmlFor="resetEmail">Email</Label>
              <Input id="resetEmail" placeholder="name@example.com" type="email" required />
            </div>
            <div className="flex flex-col space-y-4">
              <Button className="w-full" onClick={onSendReset}>Send reset link</Button>
              <Button variant="link" onClick={switchToLogin}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to login
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <Check className="h-4 w-4" />
              <AlertTitle>Email sent!</AlertTitle>
              <AlertDescription>
                Please check your inbox for password reset instructions.
              </AlertDescription>
            </Alert>
            <Button variant="link" className="mt-4 w-full" onClick={switchToLogin}>
              Return to login
            </Button>
          </div>
        )}
 </>
    );
  }
  