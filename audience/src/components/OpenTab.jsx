import { Button } from "@/components/ui/button"

import { useEffect, useContext,useState } from "react";
import { DataDispatchContext,DataContext } from '../context/DataContext.jsx';
import { Input } from "@/components/ui/input"


function OpenTab() {
    const { dispatch } = useContext(DataDispatchContext);
    const { userData } = useContext(DataContext).data;
    const [link,setLink] = useState("");

    
    const submit = () => {
        const link = document.getElementById('link').value;
        setLink(link)
        console.log(link)
    }
   
    return (

        <div className="flex w-full max-w-sm items-center space-x-2">
        <Input type="link" placeholder="AtTheViewBox Link" id="link"/>
        <Button type="submit" onClick={submit}>Submit</Button>
      </div>


    );
}

export default OpenTab;