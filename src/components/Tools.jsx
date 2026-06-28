import { Button } from "@/components/ui/button"
import { ZoomIn, Contrast, Move, ArrowDownUp, Bolt, Crosshair, SquareDashedMousePointer, Flame } from "lucide-react";
import { useEffect, useContext, useState } from "react";
import { DataDispatchContext, DataContext } from '../context/DataContext.jsx';
import { UserContext } from '../context/UserContext.jsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu"


function Tools() {
    const { dispatch } = useContext(DataDispatchContext);
    const { sharingUser, toolSelected, sessionId, sessionMeta, heatmapVisible, answerKeyAuthoring } = useContext(DataContext).data;
    const { userData } = useContext(UserContext).data;

    const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;

    const [position, setPosition] = useState("scroll")
    const [modelDropdown, setModelDropdown] = useState(false)

    const selectTool = (value) => {
        setPosition(value)
        dispatch({ type: 'select_tool', payload: value })
    }

    // Sync local position state with global toolSelected state
    useEffect(() => {
        setPosition(toolSelected);
    }, [toolSelected]);

    // Auto-switch session-only tools to scroll when sharing/session ends
    useEffect(() => {
        if (!sharingUser && toolSelected === "pointer") {
            selectTool("scroll");
        }
        if (!sessionId && !answerKeyAuthoring && toolSelected === "annotate") {
            selectTool("scroll");
        }
    }, [sharingUser, sessionId, toolSelected, answerKeyAuthoring]);

    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    return (

        <DropdownMenu modal={false} open={mobile ? modelDropdown : true} onOpenChange={() => { setModelDropdown(!modelDropdown) }}>
            <DropdownMenuTrigger asChild style={mobile ? {} : { display: "none" }} >
                <Button
                    size={"icon"}
                    style={{
                        backgroundColor: 'transparent',
                        position: 'fixed', left: '10px', top: '10px',
                    }}
                >
                    <Bolt strokeWidth={0.75} />
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
                        <span>&nbsp;{mobile ? "Zoom & Pan" : "Zoom"}</span>
                    </DropdownMenuRadioItem>

                    {mobile ? null : <DropdownMenuRadioItem value="pan">
                        <Move strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Pan</span>
                    </DropdownMenuRadioItem>}

                    <DropdownMenuRadioItem value="scroll">
                        <ArrowDownUp strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Scroll</span>
                    </DropdownMenuRadioItem>

                    {(sharingUser && userData && sharingUser === userData.id) && (
                        <DropdownMenuRadioItem value="pointer">
                            <Crosshair strokeWidth={0.75} className="mr-2 h-4 w-4" />
                            <span>&nbsp;Pointer</span>
                        </DropdownMenuRadioItem>
                    )}

                    {answerKeyAuthoring && (
                        <DropdownMenuRadioItem value="annotate">
                            <SquareDashedMousePointer strokeWidth={0.75} className="mr-2 h-4 w-4" />
                            <span>&nbsp;Annotate</span>
                        </DropdownMenuRadioItem>
                    )}

                    {isSessionOwner && (
                        <DropdownMenuRadioItem value="heatmap" onClick={(e) => { e.preventDefault(); dispatch({ type: 'toggle_heatmap' }); }}>
                            <Flame strokeWidth={0.75} className="mr-2 h-4 w-4" />
                            <span>&nbsp;{heatmapVisible ? "Hide" : "Show"} Answer</span>
                        </DropdownMenuRadioItem>
                    )}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>

    );
}

export default Tools;
