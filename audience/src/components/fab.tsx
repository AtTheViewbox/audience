import { mergeProps, useLongPress, usePress } from 'react-aria';
import { Button } from "@/components/ui/button"
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
  const { sharing } = useContext(DataContext).data;
  // get mode from state

  const { dispatch } = useContext(DataDispatchContext);

  let { longPressProps } = useLongPress({
    accessibilityDescription: 'Long press to toggle sharing interactions',
    onLongPress: (e) => {
      dispatch({type: 'toggle_sharing'})
    }
  });

  let { pressProps } = usePress({
    onPress: (e) => {
      console.log("open dialog")
      setDialogIsOpen(true);
    }
  });

return (
  <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
    <Button 
        size={"icon"}
        {...mergeProps(pressProps, longPressProps)}
        style={{
          backgroundColor: sharing ? 'red' : 'green', 
          position: 'fixed', left: '10px', bottom: '10px'
        }}
    >
        {"-"}
    </Button>
    <DialogContent>
      <DialogPage/>
    </DialogContent>
  </Dialog>
)
}

export default fab;