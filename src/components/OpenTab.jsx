import { Button } from "@/components/ui/button";

import { useEffect, useContext, useState } from "react";
import { DataDispatchContext, DataContext } from "../context/DataContext.jsx";
import { recreateList } from "../lib/inputParser.ts";
import { unflatten, flatten } from "flat";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
 
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card"

function OpenTab() {
  const { dispatch } = useContext(DataDispatchContext);
  const { userData } = useContext(DataContext).data;
  const [link, setLink] = useState("");
  const [errorFlag, setErrorFlag] = useState(false);

  const submit = () => {
    const link = document.getElementById("link").value;
    setLink(link);
    var inputData = unflatten(Object.fromEntries(new URLSearchParams(link)));

    if (inputData.vd) {
        inputData.vd.forEach((vdItem) => {
        if (
          vdItem.s &&
          vdItem.s.pf &&
          vdItem.s.sf &&
          vdItem.s.s &&
          vdItem.s.e
        ) {
          vdItem.s = recreateList(
            vdItem.s.pf,
            vdItem.s.sf,
            vdItem.s.s,
            vdItem.s.e
          );
        }
      });
    }
    if(inputData.ld==undefined||inputData.vd==undefined){
        setErrorFlag(true)
    }else{
        dispatch({type: 'load_image', payload: {vd:inputData.vd,ld:inputData.ld}})
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          To load new image, enter valid URL from AtTheViewBox
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input type="link" placeholder="URL" id="link" />
          <Button type="submit" onClick={submit}>
            Open
          </Button>
        </div>
      </CardContent>

      {errorFlag ? (
        <CardContent className="space-y-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4 " />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              The URL was invalid. Please try again.
            </AlertDescription>
          </Alert>
     </CardContent>
      ) : null}
    </Card>
  );
}

export default OpenTab;
