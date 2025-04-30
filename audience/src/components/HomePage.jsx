"use client"

import { useState, useEffect } from "react"
import { Music, Home, Search, Library, PlusCircle, Heart, Clock, User, Settings, ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import HomeSideBar from "./HomeSideBarComp"
import HomeHeaderComp from "./HomeHeaderComp"

// Sample data for playlists
const playlists = [
    {
        id: 1,
        title: "Chill Vibes",
        description: "Relaxing beats to study and work to",
    
        tracks: 24,
        duration: "1h 42m",
        creator: "Jane Doe",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2Fbyou2mvZUj_1613192914.43722958750188138547142278382773578733%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=1&vd.0.s.e=103&vd.0.s.D=1&vd.0.ww=435&vd.0.wc=1069&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    },
    {
        id: 2,
        title: "Workout Mix",
        description: "High energy tracks to keep you motivated",
   
        tracks: 18,
        duration: "1h 15m",
        creator: "John Smith",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2FWyEhuu38LB_1.2.826.0.1.3680043.2.629.20190306.13443345420354718385031285380%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=01&vd.0.s.e=32&vd.0.s.D=1&vd.0.ww=3000&vd.0.wc=1324&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    },
    {
        id: 3,
        title: "Focus Flow",
        description: "Ambient sounds for deep concentration",
      
        tracks: 32,
        duration: "2h 10m",
        creator: "Alex Johnson",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2Fbyou2mvZUj_1613192914.43722958750188138547142278382773578733%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=1&vd.0.s.e=103&vd.0.s.D=1&vd.0.ww=435&vd.0.wc=1069&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    
    },
    {
        id: 4,
        title: "Indie Discoveries",
        description: "New and upcoming indie artists",

        tracks: 15,
        duration: "58m",
        creator: "Music Explorer",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2Fbyou2mvZUj_1613192914.43722958750188138547142278382773578733%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=1&vd.0.s.e=103&vd.0.s.D=1&vd.0.ww=435&vd.0.wc=1069&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    
    },
    {
        id: 5,
        title: "Classic Rock Essentials",
        description: "Timeless rock hits from the legends",

        tracks: 28,
        duration: "1h 52m",
        creator: "Rock Enthusiast",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2Fbyou2mvZUj_1613192914.43722958750188138547142278382773578733%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=1&vd.0.s.e=103&vd.0.s.D=1&vd.0.ww=435&vd.0.wc=1069&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    
    },
    {
        id: 6,
        title: "Jazz Lounge",
        description: "Smooth jazz for relaxing evenings",
     
        tracks: 20,
        duration: "1h 30m",
        creator: "Jazz Club",
        src:"https://attheviewbox.github.io/audience/?m=true&ld.r=1&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fimages.pacsbin.com%2Fdicom%2Fproduction%2Fbyou2mvZUj_1613192914.43722958750188138547142278382773578733%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=1&vd.0.s.e=103&vd.0.s.D=1&vd.0.ww=435&vd.0.wc=1069&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0"
    
    },
]

export default function HomePage() {
    const [selectedPlaylist, setSelectedPlaylist] = useState(playlists[0])
    const [rightPanelWidth, setRightPanelWidth] = useState(400) // 80 * 4 = 320px (w-80)
    const [isResizingRight, setIsResizingRight] = useState(false)
    const minRightWidth = 240
    const maxRightWidth = 500

    // Handle mouse events for resizing
    useEffect(() => {
        const handleMouseMove = (e) => {
            const containerWidth = window.innerWidth
            const newWidth = Math.min(Math.max(containerWidth - e.clientX, minRightWidth), maxRightWidth)
            setRightPanelWidth(newWidth)
        }

        const handleMouseUp = () => {
            setIsResizingRight(false)
        }

        if (isResizingRight) {
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
    }, [isResizingRight])

    // Apply dark mode when component mounts
    useEffect(() => {
        document.documentElement.classList.add("dark")
        return () => {
            // If you want to remove dark mode when navigating away
            // document.documentElement.classList.remove('dark');
        }
    }, [])

     useEffect(() => {
        const getStudies = async () => {
          try {
            const { data, error } = await supabaseClient
              .from("viewbox")
              .select("user, url_params, session_id,visibility,mode")
              .eq("visibility", "PUBLIC");
    
            if (error) throw error;

            console.log(data)
    
          } catch (error) {
            console.log(error)
          }
        };
    
      }, []);

    return (
        <div className="flex h-screen bg-background">
            <HomeSideBar />
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <HomeHeaderComp />

                <div className="flex-1 flex overflow-hidden">
                    {/* Playlist Grid */}
                    <div className="flex-1 overflow-auto p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold ">Studies</h2>

                        <div className="flex items-center gap-4">
                                            <Button variant="outline" >Add</Button>
                                        </div>
                    </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {playlists.map((playlist) => (
                                <Card
                                    key={playlist.id}
                                    className={`cursor-pointer hover:bg-muted/20 transition-colors ${selectedPlaylist.id === playlist.id ? "border-primary" : ""}`}
                                    onClick={() => setSelectedPlaylist(playlist)}
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start gap-3">
                                           
                                            <div>
                                                <CardTitle className="text-base">{playlist.title}</CardTitle>
                                                <CardDescription className="text-xs line-clamp-2">{playlist.description}</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardFooter className="pt-2 text-xs text-muted-foreground">
                                        {playlist.tracks} tracks · {playlist.duration}
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Resize handle for right panel */}
                    <div
                        className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/30 transition-colors"
                        onMouseDown={() => setIsResizingRight(true)}
                    />

                    {/* Preview Panel */}
                    <div
                        className="bg-background border-l border-border overflow-hidden flex flex-col"
                        style={{ width: `${rightPanelWidth}px` }}
                    >
                        {selectedPlaylist && (
                            <>
                                <div className="p-6 border-b">
                                    <div className="flex flex-col items-center text-center mb-4">
                                    <iframe
                                        src={selectedPlaylist.src}
                                        title={`${selectedPlaylist.title} player`}
                                        className="w-full h-full border-0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    ></iframe>
                                       
                                        <h3 className="text-xl font-bold">{selectedPlaylist.title}</h3>

                                        <p className="text-sm text-muted-foreground">{selectedPlaylist.description}</p>
                                        <div className="text-xs text-muted-foreground mt-2">
                                            Created by {selectedPlaylist.creator} · {selectedPlaylist.tracks} tracks
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button className="flex-1">Play</Button>
                                        <Button variant="outline" size="icon">
                                            <Heart className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <ScrollArea className="flex-1">
                                    <div className="p-4">
                                        <h4 className="font-medium mb-2">Tracks</h4>
                                      
                                    </div>
                                </ScrollArea>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
