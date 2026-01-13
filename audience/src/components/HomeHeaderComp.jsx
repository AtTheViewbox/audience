import { ChevronRight, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UploaderComp } from "./UploaderComp"
import { useContext, useState } from "react"
import { UserContext } from "../context/UserContext"
import { Input } from "@/components/ui/input"

import {
    Dialog,
    DialogContent,
    DialogTitle
} from "@/components/ui/dialog";
import { LoginDialog } from "../login/LoginDialog.jsx";

function HomeHeaderComp({ setSearch, onUploadComplete }) {
    const { userData, supabaseClient } = useContext(UserContext).data;
    const [isOpen, setIsOpen] = useState(false)
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
                {!isOpen ? (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setIsOpen(true)}>
                        <ChevronRight className="h-4 w-4" />
                        Browse
                    </Button>
                ) : (
                    <div className="relative">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-md" aria-hidden="true" />

                        <div className="relative flex items-center">
                            <div className="absolute left-3 text-muted-foreground">
                                <Search className="h-4 w-4" />
                            </div>
                            <Input
                                type="text"
                                placeholder="Search..."
                                className="w-[400px] pl-9 pr-10 h-10 rounded-md border-slate-200 shadow-sm focus-visible:ring-slate-300 focus-visible:ring-offset-0 transition-all duration-300 animate-in fade-in slide-in-from-left-4"
                                autoComplete="off"
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close search"
                            >
                                <X onClick={() => { setSearch("") }} className="h-4 w-4" />
                            </Button>
                        </div>

                    </div>
                )}
            </div>
            {!userData?.is_anonymous ?
                <div className="flex items-center gap-4">
                    <UploaderComp />
                    <Button variant="outline" onClick={logOut}>Log Out</Button>
                </div> :
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




