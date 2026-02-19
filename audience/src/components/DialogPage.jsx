import { Button } from "@/components/ui/button"
import { useState, useContext } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"
import { LoginDialog } from "../login/LoginDialog.jsx";

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"


import ShareTab from "./ShareTab.jsx";
import SettingTab from "./SettingTab.jsx";

function DialogPage() {
  const { userData } = useContext(UserContext).data;
  const isAnonymous = !userData || userData.is_anonymous;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isAnonymous ? "Login" : "Share"}</DialogTitle>
        <DialogDescription>
          {isAnonymous
            ? "Log in to access sharing and advanced features."
            : "Manage your sharing settings and application preferences."}
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue={isAnonymous ? "login" : "sharing"}>
        <TabsList className="grid w-full grid-cols-2">
          {isAnonymous ? (
            <TabsTrigger value="login">Login</TabsTrigger>
          ) : (
            <TabsTrigger value="sharing">Share</TabsTrigger>
          )}
          <TabsTrigger value="setting">Setting</TabsTrigger>
        </TabsList>

        {isAnonymous ? (
          <TabsContent value="login" className="mt-4">
            <LoginDialog />
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