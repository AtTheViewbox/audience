import { Button } from "@/components/ui/button"
import { useState, useContext } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';

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
import OpenTab from "./OpenTab.jsx";

function DialogPage() {

  return (
    <>
        <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
            Eventually will have buttons for layout and interactions along with a tab for sharing w/ interaction
        </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="tools">
        <TabsList className="">
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="sharing">Share</TabsTrigger>
            <TabsTrigger value="open">New Image</TabsTrigger>
        </TabsList>
        <TabsContent value="tools">

        </TabsContent>
        <TabsContent value="sharing">
            <ShareTab/>
        </TabsContent>

        <TabsContent value="open">
            <OpenTab/>
        </TabsContent>
      </Tabs>
    </>
  )
}

export default DialogPage;