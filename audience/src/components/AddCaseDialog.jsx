import { useState ,useContext} from "react"
import { Plus, Lock, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { UserContext } from "../context/UserContext"
import { Visibility } from "../lib/constants"


export default function AddCaseDialog({ onStudyAdded }) {

    const { supabaseClient,userData } = useContext(UserContext).data;
    // State for dialog open/close
    const [open, setOpen] = useState(false)
    // State for dialog open/close
    const [visibility, setVisibility] = useState(Visibility.PUBLIC);

    function changeVisibility() {
        if (visibility === Visibility.PUBLIC) {
            setVisibility(Visibility.PRIVATE);
        } else {
            setVisibility(Visibility.PUBLIC);
        }
    }

    async function addCase() {
        try { // Create new case object
            console.log(userData)
            const caseItem = {
                owner: userData.id,
                name: document.getElementById("name").value,
                description: document.getElementById("description").value,
                url_params: document.getElementById("link").value,
                visibility: visibility,
            }
            console.log(caseItem)
            const { data, upsert_error } = await supabaseClient
                .from("studies")
                .upsert(caseItem)
                .select();
            if (upsert_error) throw upsert_error;
            if (onStudyAdded) onStudyAdded();
            setOpen(false)
        } catch (error) {
            console.log(error);
        } 
    }
    return (

        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Case
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
    
                    <DialogHeader>
                        <DialogTitle>Add New Case</DialogTitle>
                        <DialogDescription>Fill in the details to create a new case.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                name="name"
                                placeholder="Case name"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                placeholder="Describe the case"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="link">Link</Label>
                            <Input
                                id="link"
                                name="link"
                                placeholder="https://example.com"
                                type="url"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="public-switch">Visibility</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">{visibility=="PUBLIC" ? "Public" : "Private"}</span>
                                    <Switch id="public-switch" checked={visibility=="PUBLIC"} onCheckedChange={changeVisibility} />
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {visibility=="PUBLIC"
                                    ? "Public cases are visible to everyone."
                                    : "Private cases are only visible to you."}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick = {addCase}>Add Case</Button>
                    </DialogFooter>
         
            </DialogContent>
        </Dialog>

    )
}
