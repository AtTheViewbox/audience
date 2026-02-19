import { useState, useContext } from "react"
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

    const { supabaseClient, userData } = useContext(UserContext).data;
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
        try {
            // Extract only the search params from the link URL
            const linkValue = document.getElementById("link").value;
            let searchParams = '';

            try {
                // If it's a full URL, extract the search params
                if (linkValue.startsWith('http')) {
                    const url = new URL(linkValue);
                    searchParams = url.search.substring(1); // Remove leading '?'
                } else {
                    // If it already looks like query params, use as is
                    searchParams = linkValue;
                }
            } catch (e) {
                // If URL parsing fails, use the value as is
                searchParams = linkValue;
            }

            // Create new case object
            const caseItem = {
                owner: userData.id,
                name: document.getElementById("name").value,
                description: document.getElementById("description").value,
                url_params: searchParams,
                visibility: visibility,
            }

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
                <Button variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Case
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-950 border-slate-800 text-slate-100">

                <DialogHeader>
                    <DialogTitle className="text-slate-100">Add New Case</DialogTitle>
                    <DialogDescription className="text-slate-400">Fill in the details to create a new case.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="text-slate-300">Name</Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="Case name"
                            required
                            className="bg-slate-900/50 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-slate-700/30"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description" className="text-slate-300">Description</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Describe the case"
                            className="bg-slate-900/50 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-slate-700/30"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="link" className="text-slate-300">Link</Label>
                        <Input
                            id="link"
                            name="link"
                            placeholder="https://example.com"
                            type="url"
                            required
                            className="bg-slate-900/50 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-slate-700/30"
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="public-switch" className="text-slate-300">Visibility</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">{visibility == "PUBLIC" ? "Public" : "Private"}</span>
                                <Switch id="public-switch" checked={visibility == "PUBLIC"} onCheckedChange={changeVisibility} className="data-[state=checked]:bg-slate-700" />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">
                            {visibility == "PUBLIC"
                                ? "Public cases are visible to everyone."
                                : "Private cases are only visible to you."}
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={addCase} className="bg-slate-100 hover:bg-slate-200 text-slate-950 border-0">Add Case</Button>
                </DialogFooter>

            </DialogContent>
        </Dialog>

    )
}
