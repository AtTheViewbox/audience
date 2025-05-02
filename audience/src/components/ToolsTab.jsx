import { Button } from "@/components/ui/button"
import {ZoomIn, Contrast, Move, ArrowDownUp, Bolt,Crosshair } from "lucide-react";
import { useEffect, useContext,useState } from "react";
import { DataDispatchContext,DataContext } from '../context/DataContext.jsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu"


function ToolsTab() {
    const { dispatch } = useContext(DataDispatchContext);

    const [position, setPosition] = useState("window")
    const [modelDropdown, setModelDropdown] = useState(false)

    const selectTool = (value) => {
        setPosition(value)
        dispatch({ type: 'select_tool', payload: value })
    }

    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    return (
       
        <DropdownMenu modal={false} open={mobile? modelDropdown : true} onOpenChange={() => {setModelDropdown(!modelDropdown)}}>
            <DropdownMenuTrigger asChild style={mobile?{}:{display: "none"}} >
                <Button
                    size={"icon"}
                    variant="ghost"
                    style={{
                        //backgroundColor:  'transparent',
                        position: 'fixed', left: '10px', top: '10px',
                    }}
                >
                    <Bolt strokeWidth={0.75}/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
                <DropdownMenuRadioGroup value={position} onValueChange={selectTool}>
                    <DropdownMenuRadioItem value="window">
                        <Contrast strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Window/Level</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="zoom">
                        <ZoomIn strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;{mobile?"Zoom & Pan" :"Zoom"}</span>
                    </DropdownMenuRadioItem>
                    {mobile?null:<DropdownMenuRadioItem value="pan">
                        <Move strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Pan</span>
                    </DropdownMenuRadioItem>}
                    
                    <DropdownMenuRadioItem value="scroll">
                        <ArrowDownUp strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Scroll</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="pointer">
                        <Crosshair strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Pointer</span>
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
                 
    );
}

export default ToolsTab;
