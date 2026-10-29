import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ArrowDownUp,
    Contrast,
    Crosshair,
    LocateFixed,
    Maximize2,
    Monitor,
    Move,
    Smartphone,
    ZoomIn,
} from "lucide-react";

export function isMobileViewer() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    const iPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches && navigator.maxTouchPoints > 0;
    return iPad || coarse;
}

const ROWS = [
    { icon: ArrowDownUp, name: "Scroll", desktop: "Drag or wheel", mobile: "Drag" },
    { icon: ZoomIn, name: "Zoom", desktop: "Right-drag", mobile: "Pinch" },
    { icon: Move, name: "Pan", desktop: "Middle-drag", mobile: "Two fingers" },
    { icon: Contrast, name: "Window", desktop: "Shift-drag · 1–5", mobile: "Three fingers" },
    { icon: Crosshair, name: "Pointer", both: "Hold while sharing" },
    { icon: Maximize2, name: "Fullscreen", desktop: "Double-click", mobile: "Double-tap" },
    { icon: LocateFixed, name: "Share", both: "Lower-left button" },
];

export default function ControlsCard() {
    return (
        <Card>
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Viewer controls</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-muted-foreground">
                            <th className="w-24 pb-1" />
                            <th className="pb-1 text-left font-medium">
                                <span className="inline-flex items-center gap-1">
                                    <Monitor className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    Desktop
                                </span>
                            </th>
                            <th className="pb-1 text-left font-medium">
                                <span className="inline-flex items-center gap-1">
                                    <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    Mobile
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {ROWS.map(({ icon: Icon, name, desktop, mobile, both }) => (
                            <tr key={name} className="border-t">
                                <th className="py-1.5 pr-2 text-left font-medium">
                                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                                        {name}
                                    </span>
                                </th>
                                {both ? (
                                    <td colSpan={2} className="py-1.5 text-center text-muted-foreground">{both}</td>
                                ) : (
                                    <>
                                        <td className="py-1.5 pr-2 text-muted-foreground">{desktop}</td>
                                        <td className="py-1.5 text-muted-foreground">{mobile}</td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
}
