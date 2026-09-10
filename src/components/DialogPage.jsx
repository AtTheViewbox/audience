import { useState, useContext, useEffect } from "react";
import { UserContext } from "../context/UserContext";
import { LoginDialog } from "../login/LoginDialog.jsx";
import { isDemoMode } from "../lib/demoCase.js";

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
import AnnotationTab from "./AnnotationTab.jsx";

export const AuthMode = {
  LOGIN: "login",
  SIGN_UP: "signup",
  RECOVERY: "recovery",
};

function DialogPage() {
  const { userData } = useContext(UserContext).data;
  const isAnonymous = !userData || userData.is_anonymous;
  const demoMode = isDemoMode();
  const canShare = !isAnonymous || demoMode;
  const canAnnotate = !isAnonymous || demoMode;
  const showLogin = isAnonymous && !demoMode;

  const [authMode, setAuthMode] = useState(AuthMode.LOGIN);

  const defaultTab = canShare ? "sharing" : "login";
  const [tabValue, setTabValue] = useState(defaultTab);

  useEffect(() => {
    setTabValue(canShare ? "sharing" : "login");
  }, [canShare]);

  const loginTabLabel =
    authMode === AuthMode.SIGN_UP
      ? "Create account"
      : authMode === AuthMode.RECOVERY
        ? "Reset password"
        : "Login";

  const tabsClass = canShare ? "grid-cols-3" : "grid-cols-2";

  return (
    <>
      <DialogHeader className="shrink-0">
        <DialogTitle>{canShare ? "Share" : "Account"}</DialogTitle>
        <DialogDescription>
          {canShare
            ? "Manage your sharing settings and application preferences."
            : "Log in, create an account, or reset your password."}
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={tabValue}
        onValueChange={setTabValue}
        className="min-h-0 flex-1 overflow-hidden flex flex-col"
      >
        <TabsList className={`grid w-full shrink-0 ${tabsClass}`}>
          {canShare && <TabsTrigger value="sharing">Share</TabsTrigger>}
          {showLogin && <TabsTrigger value="login">{loginTabLabel}</TabsTrigger>}
          {canAnnotate && <TabsTrigger value="annotate">Questions</TabsTrigger>}
          <TabsTrigger value="setting">Setting</TabsTrigger>
        </TabsList>

        {canShare && (
          <TabsContent value="sharing" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <ShareTab />
          </TabsContent>
        )}

        {showLogin && (
          <TabsContent value="login" className="mt-4 min-h-0 overflow-y-auto overscroll-contain">
            <LoginDialog authMode={authMode} setAuthMode={setAuthMode} />
          </TabsContent>
        )}

        {canAnnotate && (
          <TabsContent value="annotate" className="mt-2 min-h-0 min-w-0 overflow-y-auto overscroll-contain">
            <AnnotationTab />
          </TabsContent>
        )}

        <TabsContent value="setting" className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
          <SettingTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default DialogPage;
