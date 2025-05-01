import { Button } from "@/components/ui/button"
import {ChevronRight,LogOut,Home } from "lucide-react";
import {  useContext } from "react";
import { UserContext } from "../context/UserContext"
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"


import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card"


function SettingTab() {
    const { userData,supabaseClient} = useContext(UserContext).data;
    console.log(userData)
    const navigate = useNavigate();
    
async function logOut() {

    try {
        let { error } = await supabaseClient.auth.signOut({scope:'global',})
        if (error) throw error;

        //log back in as Anonymous user 
        const { data: { user }, error: signInError } = await supabaseClient.auth.signInAnonymously();
    } catch (error) {
      console.log(error)
    }
  }
    // Get initials from user name for avatar fallback
    const getInitials = (name) => {
      return name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    }
    return (
        <Card>
        <CardContent>
        <div className="py-4 flex items-center space-x-4 border-b">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg bg-slate-200 text-slate-800">{getInitials(userData.email)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h3 className="font-medium text-base">{userData.user_metadata?.name}</h3>
            <p className="text-sm text-muted-foreground">{userData.email}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-left h-auto py-3"
            onClick={() => {navigate("/");}}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5" />
                <span>Navigate Home</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left h-auto py-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            onClick = {logOut}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5" />
                <span>Log Out</span>
              </div>
              <ChevronRight className="h-4 w-4" />
            </div>
          </Button>
        </div>
        </CardContent>
      </Card>

    );
}

export default SettingTab;
