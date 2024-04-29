import { Button } from "@/components/ui/button"

import { useEffect, useContext,useState } from "react";
import { DataDispatchContext,DataContext } from '../context/DataContext.jsx';
import { recreateList } from '../lib/inputParser.ts';
import { unflatten, flatten } from "flat";
import { Input } from "@/components/ui/input"


function OpenTab() {
    const { dispatch } = useContext(DataDispatchContext);
    const { userData } = useContext(DataContext).data;
    const [link,setLink] = useState("");

    
    const submit = () => {
        const link = document.getElementById('link').value;
        setLink(link)
        console.log(link)

        var initialData = unflatten(Object.fromEntries(new URLSearchParams(link)));

if (initialData.vd) {
    initialData.vd.forEach((vdItem) => {
        if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e) {
            vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e);
        }
    })
} 
console.log(initialData)
    }
   
    return (

        <div className="flex w-full max-w-sm items-center space-x-2">
        <Input type="link" placeholder="AtTheViewBox Link" id="link"/>
        <Button type="submit" onClick={submit}>Submit</Button>
      </div>


    );
}

export default OpenTab;