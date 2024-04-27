import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button.js"
import { useState, useContext } from 'react';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';

import DialogPage from "./DialogPage.jsx";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.js"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js"

import { Input } from "@/components/ui/input.js"
import { Label } from "@/components/ui/label.js"

function fab() {
  let [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { userData, sharingUser } = useContext(DataContext).data;
  // get mode from state

  const { dispatch } = useContext(DataDispatchContext);

  let { longPressProps } = useLongPress({
    accessibilityDescription: 'Long press to toggle sharing interactions',
    onLongPress: (e) => {
      dispatch({type: 'toggle_sharing'})
    }
  });

  let { pressProps } = usePress({
    onPress: (e) => { setDialogIsOpen(true); }
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
          {"-"}
      </Button>
      <DialogContent>
        <DialogPage/>
      </DialogContent>
  </Dialog>))
}

export default fab;