import { useState, useEffect, useContext } from "react"
import { Home, Search, Library, User, Settings, Globe, Moon,Monitor, FileStack, X, Hammer } from "lucide-react"
import { Filter, Visibility } from "../lib/constants"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Dialog,
    DialogContent,
    DialogTrigger,
    DialogTitle
} from "@/components/ui/dialog"
import SettingTab from "./SettingTab.jsx"
import { UserContext } from "../context/UserContext"


function HomeSideBar({ filter, setFilter, mobileMenuOpen, setMobileMenuOpen }) {
    const [leftPanelWidth, setLeftPanelWidth] = useState(256) // 64 * 4 = 256px (w-64)
    const [open, setOpen] = useState(false)
    const { userData } = useContext(UserContext).data;

    const [isResizingLeft, setIsResizingLeft] = useState(false)

    const minLeftWidth = 180
    const maxLeftWidth = 400


    useEffect(() => {
        document.documentElement.classList.add("dark")
        return () => {
            // If you want to remove dark mode when navigating away
            // document.documentElement.classList.remove('dark');
        }
    }, [])

    const ToggleDarkMode = () => {
        if (document.documentElement.classList.contains("dark")) {
            document.documentElement.classList.remove("dark")
        } else {
            document.documentElement.classList.add("dark")
        }
    }

    // Handle mouse events for resizing
    useEffect(() => {
        const handleMouseMove = (e) => {
            const newWidth = Math.min(Math.max(e.clientX, minLeftWidth), maxLeftWidth)
            setLeftPanelWidth(newWidth)
        }

        const handleMouseUp = () => {
            setIsResizingLeft(false)
        }

        if (isResizingLeft) {
            document.addEventListener("mousemove", handleMouseMove)
            document.addEventListener("mouseup", handleMouseUp)
            // Add a class to the body to prevent text selection during resize
            document.body.classList.add("resize-cursor")
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove)
            document.removeEventListener("mouseup", handleMouseUp)
            document.body.classList.remove("resize-cursor")
        }
    }, [isResizingLeft])

    return (
        <>
            {/* Mobile Overlay */}
             {mobileMenuOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Left Sidebar */}
            <div 
                className={cn(
                    "bg-background border-r border-border flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0",
                    // Mobile: Fixed, Full Height, Slide in
                    "fixed inset-y-0 left-0 z-50 w-64 md:static md:z-auto",
                     mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
                )}
                style={{ width: (window.innerWidth >= 768) ? `${leftPanelWidth}px` : undefined }} 
            >
                <div className="p-4">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-xl font-semibold">AtTheViewBox</h1>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="md:hidden"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            <X className="h-4 w-4"/>
                        </Button>
                    </div>

                    <nav className="space-y-1">
                        {!userData || userData.is_anonymous ? null :
                            <Button variant="ghost" onClick={() => setFilter(Filter.ALL)} className={cn("w-full justify-start",
                                filter === Filter.ALL
                                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                    : "",
                            )}>
                                <Home className="mr-2 h-4 w-4" />
                                Home
                            </Button>}

                        <Button onClick={() => setFilter(Filter.PUBLIC)} variant="ghost" className={cn("w-full justify-start",
                            filter === Filter.PUBLIC
                                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                : "",
                        )}>
                            <Globe className="mr-2 h-4 w-4" />
                            Everyone's Viewbox
                        </Button>
                        {!userData || userData.is_anonymous ? null :
                        <div>
                            <Button onClick={() => setFilter(Filter.MYSTUDIES)} variant="ghost" className={cn("w-full justify-start",
                                filter === Filter.MYSTUDIES
                                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                    : "",
                            )}>
                                <Monitor className="mr-2 h-4 w-4" />
                                Your Viewbox
                            </Button>

                            <Button onClick={() => setFilter(Filter.PACSBIN)} variant="ghost" className={cn("w-full justify-start",

                            )}>
                                <FileStack className="mr-2 h-4 w-4" />
                                Pacsbin Studies
                            </Button>
                            <Button onClick={() => setFilter(Filter.BUILDER)} variant="ghost" className={cn("w-full justify-start",
                                filter === Filter.BUILDER
                                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                                    : "",
                            )}>
                                <Hammer className="mr-2 h-4 w-4" />
                                Builder
                            </Button>
                            
                            </div>
                        }
                    </nav>
                </div>

                <div className="mt-auto p-4 border-t">
                    {!userData || userData.is_anonymous ? null :
                        <Dialog open={open} onOpenChange={setOpen} >

                            <Button onClick={() => setOpen(true)} variant="ghost" className="w-full justify-start">
                                <Settings className="mr-2 h-4 w-4" />
                                Settings
                            </Button>
                            <DialogTitle className="hidden">Settings</DialogTitle>
                            <DialogContent className="sm:max-w-md p-0 rounded-2xl shadow-xl overflow-hidden border-0">
                                <SettingTab />
                            </DialogContent>
                        </Dialog>}


                    <Button onClick={ToggleDarkMode} variant="ghost" className="w-full justify-start">
                        <Moon className="mr-2 h-4 w-4" />
                        Toggle Dark Mode
                    </Button>
                </div>



            </div>

            {/* Resize handle for left panel - Desktop Only */}
            <div
                className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors hidden md:block"
                onMouseDown={() => setIsResizingLeft(true)}
            />
        </>
    )
}

export default HomeSideBar;




