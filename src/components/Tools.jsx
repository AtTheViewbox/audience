import { Button } from "@/components/ui/button"
import { ZoomIn, Contrast, Move, ArrowDownUp, Bolt, Crosshair, SquareDashedMousePointer, Flame } from "lucide-react";
import { DotFilledIcon } from "@radix-ui/react-icons";
import { useEffect, useContext, useState } from "react";
import { DataDispatchContext, DataContext } from '../context/DataContext.jsx';
import { UserContext } from '../context/UserContext.jsx';
import { isPresenter } from "../lib/demoCase.js";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { WINDOW_PRESETS, applyWindowPreset, presetFromDigitKey } from "../lib/windowPresets.js";


function Tools() {
    const { dispatch } = useContext(DataDispatchContext);
    const {
        sharingUser,
        toolSelected,
        sessionId,
        sessionMeta,
        heatmapVisible,
        answerKeyAuthoring,
        renderingEngine,
    } = useContext(DataContext).data;
    const { userData } = useContext(UserContext).data;

    const isSessionOwner = isPresenter({
        sessionId,
        userId: userData?.id,
        ownerId: sessionMeta?.owner,
    });

    const [position, setPosition] = useState("scroll")
    const [modelDropdown, setModelDropdown] = useState(false)

    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    const closeMobileMenu = () => {
        if (mobile) setModelDropdown(false);
    }

    const selectTool = (value) => {
        setPosition(value)
        dispatch({ type: 'select_tool', payload: value })
        closeMobileMenu()
    }

    const selectPreset = (preset) => {
        setPosition("scroll");
        dispatch({ type: 'select_tool', payload: 'scroll' })
        applyWindowPreset(renderingEngine, preset.ww, preset.wc);
        closeMobileMenu()
    }

    // Sync local position state with global toolSelected state
    useEffect(() => {
        setPosition(toolSelected);
    }, [toolSelected]);

    // Auto-switch session-only tools to scroll when sharing/session ends
    useEffect(() => {
        if (!sharingUser && toolSelected === "pointer") {
            setPosition("scroll");
            dispatch({ type: 'select_tool', payload: 'scroll' });
        }
        if (!sessionId && !answerKeyAuthoring && toolSelected === "annotate") {
            setPosition("scroll");
            dispatch({ type: 'select_tool', payload: 'scroll' });
        }
    }, [sharingUser, sessionId, toolSelected, answerKeyAuthoring]);

    // Number keys 1–5 → window presets; stay on scroll
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

            const preset = presetFromDigitKey(e.key);
            if (!preset) return;

            e.preventDefault();
            setPosition("scroll");
            dispatch({ type: "select_tool", payload: "scroll" });
            applyWindowPreset(renderingEngine, preset.ww, preset.wc);
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                setModelDropdown(false);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dispatch, renderingEngine]);

    const windowSelected = position === "window";

    return (
        <DropdownMenu modal={false} open={mobile ? modelDropdown : true} onOpenChange={setModelDropdown}>
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
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                        className="text-white relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                        onClick={() => {
                            // Select Window/Level but keep menu open on mobile so presets stay reachable
                            setPosition("window");
                            dispatch({ type: 'select_tool', payload: 'window' });
                        }}
                    >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                            {windowSelected ? <DotFilledIcon className="h-4 w-4 fill-current" /> : null}
                        </span>
                        <Contrast strokeWidth={0.75} className="mr-2 h-4 w-4" />
                        <span>&nbsp;Window/Level</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48 border-0 bg-transparent p-1 text-white shadow-none">
                        {WINDOW_PRESETS.map((preset) => (
                            <DropdownMenuItem
                                key={preset.id}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    selectPreset(preset);
                                }}
                                className="justify-between gap-3 focus:bg-accent focus:text-accent-foreground"
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-3 text-xs tabular-nums opacity-60">{preset.key}</span>
                                    <span>{preset.label}</span>
                                </span>
                                <span className="text-xs tabular-nums opacity-60">
                                    {preset.ww}/{preset.wc}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuRadioGroup value={position} onValueChange={selectTool}>
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
                        <DropdownMenuRadioItem value="heatmap" onClick={(e) => {
                            e.preventDefault();
                            dispatch({ type: 'toggle_heatmap' });
                            closeMobileMenu();
                        }}>
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
