import { useState, useEffect } from "react"
import { Home, Search, Library,  User, Settings, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"


function HomeSideBar() {
    const [leftPanelWidth, setLeftPanelWidth] = useState(256) // 64 * 4 = 256px (w-64)

    const [isResizingLeft, setIsResizingLeft] = useState(false)

    const minLeftWidth = 180
    const maxLeftWidth = 400


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
            {/* Left Sidebar */}
            <div className="bg-background border-r border-border flex flex-col" style={{ width: `${leftPanelWidth}px` }}>
                <div className="p-4">
                    <div className="flex items-center gap-2 mb-6">

                        <h1 className="text-xl font-semibold">AtTheViewBox</h1>
                    </div>

                    <nav className="space-y-1">
                        <Button variant="ghost" className="w-full justify-start">
                            <Home className="mr-2 h-4 w-4" />
                            Home
                        </Button>
                        <Button variant="ghost" className="w-full justify-start">
                            <Search className="mr-2 h-4 w-4" />
                            Search
                        </Button>
                        <Button variant="ghost" className="w-full justify-start">
                            <Library className="mr-2 h-4 w-4" />
                            Your Studies
                        </Button>
                    </nav>
                    {/** 
                    <Separator className="my-4" />

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Your Playlists</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </div>

                        <nav className="space-y-1">
                            <Button variant="ghost" className="w-full justify-start">
                                <Heart className="mr-2 h-4 w-4" />
                                Liked Songs
                            </Button>
                            <Button variant="ghost" className="w-full justify-start">
                                <Clock className="mr-2 h-4 w-4" />
                                Recently Played
                            </Button>
                        </nav>
                    </div>*/}
                </div>

                <div className="mt-auto p-4 border-t">
                    <Button variant="ghost" className="w-full justify-start">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                    </Button>
                </div>
            </div>

            {/* Resize handle for left panel */}
            <div
                className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors"
                onMouseDown={() => setIsResizingLeft(true)}
            />
        </>
    )
}

export default HomeSideBar;




