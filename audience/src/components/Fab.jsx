import { mergeProps, useLongPress, usePress } from "react-aria";
import { Button } from "@/components/ui/button";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { LocateFixed, LocateOff, LogIn } from "lucide-react";
import { UserContext } from "../context/UserContext"

import DialogPage from "./DialogPage.jsx";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";



function Fab() {
  let [dialogIsOpen, setDialogIsOpen] = useState(false);
  //const { userData, sharingUser } = useContext(DataContext).data;
  const { sharingUser } = useContext(DataContext).data;
  const  {userData}= useContext(UserContext).data;

  // get mode from state
  useEffect(()=>{
    console.log(userData)
  },[userData])

  const { dispatch } = useContext(DataDispatchContext);

  let { longPressProps } = useLongPress({
    accessibilityDescription: "Long press to toggle sharing interactions",
    onLongPress: (e) => {
      //switch long and short press
      dispatch({ type: "toggle_sharing" });
    },
  });

  let { pressProps } = usePress({
    onPress: (e) => {
      setDialogIsOpen(true);
    },
  });

  // guard against there being no userData
  return !userData ? null : (
    <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
      <Button
        size={"icon"}
        {...mergeProps(pressProps, longPressProps)}
        style={{
          backgroundColor: sharingUser == userData.id ? "red" : "white",
          position: "fixed",
          left: "10px",
          bottom: "10px",
        }}
        
      >
        {sharingUser == userData.id ? (
          <LocateFixed strokeWidth={1.5} color="#000000" />
        ) : (
          <LocateFixed strokeWidth={1.5} color="#000000" />
        )}
      </Button>


      <DialogContent>
        <DialogPage />
      </DialogContent>
    </Dialog>
  );
}

export default Fab;
