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
  const { userData} = useContext(UserContext).data;
  return (

    (!userData || userData.is_anonymous)?<LoginDialog />: <>
    <DialogHeader>
    <DialogTitle>Settings</DialogTitle>
    <DialogDescription>
        Eventually will have buttons for layout and interactions along with a tab for sharing w/ interaction
    </DialogDescription>
    </DialogHeader>
    <Tabs defaultValue="sharing">
    <TabsList className="">
        <TabsTrigger value="sharing">Share</TabsTrigger>
        {userData.is_anonymous?null:<TabsTrigger value="setting">Setting</TabsTrigger>}
    </TabsList>
    <TabsContent value="sharing">
        <ShareTab/>
    </TabsContent>
    <TabsContent value="setting">
        <SettingTab/>
    </TabsContent>
  </Tabs>
</>
   
  )
}

export default DialogPage;