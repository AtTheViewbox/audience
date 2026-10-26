import { mergeProps, useLongPress, usePress } from "react-aria";
import { Button } from "@/components/ui/button";
import { useState, useContext, useEffect } from "react";
import { DataContext, DataDispatchContext } from "../context/DataContext.jsx";
import { LocateFixed } from "lucide-react";
import { UserContext } from "../context/UserContext"
import { isJoinParticipant } from "../lib/demoCase.js";
import { VIEWER_DIALOG_CLOSE_EVENT } from "../lib/viewerLocation.js";

import DialogPage from "./DialogPage.jsx";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";



function Fab() {
  let [dialogIsOpen, setDialogIsOpen] = useState(false);
  const { sharingUser, sessionId, sessionMeta } = useContext(DataContext).data;
  const { userData } = useContext(UserContext).data;
  const { dispatch } = useContext(DataDispatchContext);

  const isParticipant = isJoinParticipant({
    sessionId,
    userId: userData?.id,
    ownerId: sessionMeta?.owner,
  });

  const openDialog = () => setDialogIsOpen(true);

  useEffect(() => {
    const close = () => setDialogIsOpen(false);
    window.addEventListener(VIEWER_DIALOG_CLOSE_EVENT, close);
    return () => window.removeEventListener(VIEWER_DIALOG_CLOSE_EVENT, close);
  }, []);
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
        size="icon"
        {...mergeProps(pressProps, longPressProps)}
        style={{
          backgroundColor: sharingUser == userData.id ? "red" : "white",
          position: "fixed",
          left: "10px",
          bottom: "10px",
        }}

      >
        <LocateFixed strokeWidth={1.5} color="#000000" />
      </Button>


      <DialogContent className="max-h-[calc(100dvh-2rem)] !flex flex-col overflow-hidden">
        <DialogPage />
      </DialogContent>
    </Dialog>
  );
}

export default Fab;
