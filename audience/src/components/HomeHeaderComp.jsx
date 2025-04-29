import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UploaderComp } from "./UploaderComp"
import { useContext, useState } from "react"
import { UserContext } from "../context/UserContext"

import {
    Dialog,
    DialogContent,
    DialogTitle
} from "@/components/ui/dialog";
import { LoginDialog} from "../login/LoginDialog.jsx";

function HomeHeaderComp() {
    const { userData, supabaseClient } = useContext(UserContext).data;
    let [dialogIsOpen, setDialogIsOpen] = useState(false);

    async function logOut() {

        try {
            let { error } = await supabaseClient.auth.signOut({ scope: 'global', })
            if (error) throw error;

            //log back in as Anonymous user 
            const { data: { user }, error: signInError } = await supabaseClient.auth.signInAnonymously();
        } catch (error) {
            console.log(error)
        }
    }

    return (
        <header className="h-16 border-b flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1">
                    <ChevronRight className="h-4 w-4" />
                    Browse
                </Button>
            </div>
            {!userData?.is_anonymous ?
                <div className="flex items-center gap-4">
                    <UploaderComp />
                    <Button variant="outline" onClick={logOut}>Log Out</Button>
                </div>:
                <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
                <Button variant="outline" onClick={() => setDialogIsOpen(true)}>Login</Button>
                <DialogContent>
                    <LoginDialog />
                </DialogContent>
            </Dialog>
            }
        </header>
    )
}

export default HomeHeaderComp;




