import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button"
import { useState, useContext } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { Eye, EyeOff } from "lucide-react";

import DialogPage from "./DialogPage.jsx";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function fab() {
  let [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { userData, sharingUser } = useContext(DataContext).data;
  // get mode from state

  const { dispatch } = useContext(DataDispatchContext);

  let { longPressProps } = useLongPress({
    accessibilityDescription: 'Long press to toggle sharing interactions',
    onLongPress: (e) => {
      
    }
  });

  let { pressProps } = usePress({
    onPress: (e) => { dispatch({type: 'toggle_sharing'}) }
  });

  // guard against there being no userData
  return (!userData ? null :
    (<Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
      <Button 
          size={"icon"}
          {...mergeProps(pressProps, longPressProps)}
          style={{
            backgroundColor: sharingUser == userData.id ? 'red' : 'white', 
            position: 'fixed', left: '10px', bottom: '10px'
          }}
      >
          { sharingUser == userData.id ? <EyeOff strokeWidth={1.5} color="#000000"/> : <Eye strokeWidth={1.5} color="#000000"/> }
      </Button>
      <DialogContent>
        <DialogPage/>
      </DialogContent>
  </Dialog>))
}

export default fab;