import { Button } from "@/components/ui/button"
import {ZoomIn, Contrast, Move, ArrowDownUp, Bolt } from "lucide-react";
import { useEffect, useContext,useState } from "react";
import { DataDispatchContext,DataContext } from '../context/DataContext.jsx';
import { UserContext } from "../context/UserContext"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card"


function SettingTab() {
    const { dispatch } = useContext(DataDispatchContext);
    //const { supabaseClient, userData } = useContext(DataContext).data;
    const { supabaseClient } = useContext(DataContext).data;
    const { userData} = useContext(UserContext).data;

    const [position, setPosition] = useState("window")

    const selectTool = (value) => {
        setPosition(value)
        dispatch({ type: 'select_tool', payload: value })
    }
    
async function logOut() {

    try {

        let { error } = await supabaseClient.auth.signOut({scope:'global',})
        if (error) throw error;

        //log back in as Anonymous user 
        ({ data: { user }, error } = await supabaseClient.auth.signInAnonymously());
    } catch (error) {
      console.log(error)
    }
  }
    return (
        <Card>
        <CardHeader>
          <CardTitle>Welcome {userData.email}!</CardTitle>
          <CardDescription>
           Placeholder Text. User can change password settings.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick = {logOut}>Log Out</Button>
        </CardFooter>
      </Card>

    );
}

export default SettingTab;
