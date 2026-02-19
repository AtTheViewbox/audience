// components/Login/PasswordRecovery.jsx
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Check, ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function PasswordRecovery({ onSendReset, sent, switchToLogin }) {
  return (
    <>
      {!sent ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="resetEmail">Email</Label>
            <Input
              id="resetEmail"
              placeholder="name@example.com"
              type="email"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 justify-center"
              onClick={switchToLogin}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <Button className="flex-1" onClick={onSendReset}>
              Send link
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <Check className="h-4 w-4" />
            <AlertTitle>Email sent!</AlertTitle>
            <AlertDescription>
              Please check your inbox for password reset instructions.
            </AlertDescription>
          </Alert>

          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={switchToLogin}
          >
            Return to login
          </Button>
        </div>
      )}
    </>
  );
}
