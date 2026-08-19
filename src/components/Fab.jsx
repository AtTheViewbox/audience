import { mergeProps, useLongPress, usePress } from "react-aria";
import { Button } from "@/components/ui/button";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { LocateFixed, LocateOff, LogIn } from "lucide-react";
import { UserContext } from "../context/UserContext"
import { isDemoPresenter } from "../lib/demoCase.js";

import DialogPage from "./DialogPage.jsx";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";



function Fab() {
  let [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { sharingUser, sharingPending, sessionId, sessionMeta } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const { dispatch } = useContext(DataDispatchContext);

  const isParticipant =
    !!sessionId &&
    !!userData &&
    sessionMeta?.owner !== userData.id &&
    !isDemoPresenter();

  const openDialog = () => setDialogIsOpen(true);
  const toggleSharing = () => {
    dispatch({ type: "toggle_sharing", payload: { userData } });
  };

  let { longPressProps } = useLongPress({
    accessibilityDescription: isParticipant
      ? "Hold to open login and share settings"
      : "Hold to toggle sharing",
    onLongPress: () => {
      if (isParticipant) openDialog();
      else toggleSharing();
    },
  });

  let { pressProps } = usePress({
    onPress: () => {
      if (isParticipant) toggleSharing();
      else openDialog();
    },
  });

  // guard against there being no userData
  return !userData ? null : (
    <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
      <Button
        disabled={sharingPending}
        size="icon"
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
