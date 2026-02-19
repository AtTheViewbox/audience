import { useState, useContext, useEffect } from "react";
import { UserContext } from "../context/UserContext";
import { LoginDialog } from "../login/LoginDialog.jsx";

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import ShareTab from "./ShareTab.jsx";
import SettingTab from "./SettingTab.jsx";

export const AuthMode = {
  LOGIN: "login",
  SIGN_UP: "signup",
  RECOVERY: "recovery",
};

function DialogPage() {
  const { userData } = useContext(UserContext).data;
  const isAnonymous = !userData || userData.is_anonymous;

  const [authMode, setAuthMode] = useState(AuthMode.LOGIN);

  // ✅ this is the missing piece: actual selected tab value
  const [tabValue, setTabValue] = useState(isAnonymous ? "login" : "sharing");

  // If auth status changes, snap to the correct default tab
  useEffect(() => {
    setTabValue(isAnonymous ? "login" : "sharing");
  }, [isAnonymous]);

  const loginTabLabel =
    authMode === AuthMode.SIGN_UP
      ? "Create account"
      : authMode === AuthMode.RECOVERY
        ? "Reset password"
        : "Login";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isAnonymous ? "Account" : "Share"}</DialogTitle>
        <DialogDescription>
          {isAnonymous
            ? "Log in, create an account, or reset your password."
            : "Manage your sharing settings and application preferences."}
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tabValue} onValueChange={setTabValue}>
        <TabsList className="grid w-full grid-cols-2">
          {isAnonymous ? (
            <TabsTrigger value="login">{loginTabLabel}</TabsTrigger>
          ) : (
            <TabsTrigger value="sharing">Share</TabsTrigger>
          )}
          <TabsTrigger value="setting">Setting</TabsTrigger>
        </TabsList>

        {isAnonymous ? (
          <TabsContent value="login" className="mt-4">
            <LoginDialog authMode={authMode} setAuthMode={setAuthMode} />
          </TabsContent>
        ) : (
          <TabsContent value="sharing">
            <ShareTab />
          </TabsContent>
        )}

        <TabsContent value="setting">
          <SettingTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default DialogPage;
