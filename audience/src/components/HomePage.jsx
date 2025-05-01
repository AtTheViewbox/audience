import { useState, useEffect,useContext } from "react"
import {  Heart,Trash2,  Copy,Check, } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import HomeSideBar from "./HomeSideBarComp"
import HomeHeaderComp from "./HomeHeaderComp"
import AddCaseDialog from "./AddCaseDialog"
import { UserContext } from "../context/UserContext"
import { Input } from "@/components/ui/input"
import {  Filter } from "../lib/constants"

export default function HomePage() {
    const [selectedStudyList, setSelectedStudyList] = useState([])
    const [filter, setFilter] = useState(Filter.ALL)
    const [search, setSearch] = useState("")
    const [studyList, setStudyList] = useState([])
    const [displayStudyList, setdisplayStudyList] = useState([])
    const { supabaseClient,userData } = useContext(UserContext).data;
    const [rightPanelWidth, setRightPanelWidth] = useState(400) // 80 * 4 = 320px (w-80)
    const [isResizingRight, setIsResizingRight] = useState(false)
    const [copyClicked, setCopyClicked] = useState(false);
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


    const handleDelete = async (study_id) => {
        try {
            const { data, error } = await supabaseClient
                .from("studies")
                .delete()
                .eq("id", study_id);

            if (error) throw error;

            // Refresh the study list after deletion
            getStudies();

        } catch (error) {
            console.log(error)
        }
    };
    const getStudies = async () => {
        try {
            let data, error;
    
            if (filter === Filter.PUBLIC) {
                ({ data, error } = await supabaseClient
                    .from("studies")
                    .select("*")
                    .eq("visibility", "PUBLIC"));
            }
            else if (filter === Filter.MYSTUDIES) {
                ({ data, error } = await supabaseClient
                    .from("studies")
                    .select("*")
                    .eq("owner", userData.id));
            } else {
                ({ data, error } = await supabaseClient
                    .from("studies")
                    .select("*"));
            }
    
            if (error) throw error;
    
            console.log(data);
            setStudyList(data);
            setdisplayStudyList(data)
            setSelectedStudyList(data[0]);
    
        } catch (error) {
            console.log(error);
        }
    };    

    useEffect(() => {
        
        getStudies();
    }, [filter]);

    useEffect(() => {
        function searchItems(query, list) {
            return list.filter(item =>
              Object.values(item).some(value =>
                value.toString().toLowerCase().includes(query.toLowerCase())
              )
            );
          }
          setdisplayStudyList(searchItems(search, studyList));

    }, [search]);

    return (
        <div className="flex h-screen bg-background">
            <HomeSideBar filter = {filter} setFilter={setFilter} />
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <HomeHeaderComp setSearch = {setSearch}/>

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-auto p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold ">Studies</h2>
                            <div className="flex items-center gap-4">
                            {!userData?.is_anonymous?<AddCaseDialog onStudyAdded={getStudies}/>:null}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {displayStudyList.map((study) => (
                                <Card
                                    key={study.id}
                                    className={`relative group cursor-pointer hover:bg-muted/20 transition-colors ${selectedStudyList.id === study.id ? "border-primary" : ""}`}
                                    onClick={() => setSelectedStudyList(study)}
                                >
                                    {filter === Filter.MYSTUDIES?<Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                                       onClick={() => handleDelete(study.id)}
                                        aria-label="Delete study"
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>: null}
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start gap-3">

                                            <div>
                                                <CardTitle className="text-base">{study.name}</CardTitle>
                                                <CardDescription className="text-xs line-clamp-2">{study.description.length > 100
                                                    ? study.description.slice(0, 100) + "..."
                                                    : study.description}</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardFooter className="pt-2 text-xs text-muted-foreground">
                                    Created on {(new Date(study.last_accessed)).toISOString().split('T')[0]}
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
                        {selectedStudyList && (
                            <>
                                <div className="p-6 border-b">
                                    <div className="flex flex-col items-center text-center mb-4">
                                        <iframe
                                            src={selectedStudyList.url_params+"&preview=true"}
                                            title={`${selectedStudyList.name}`}
                                            className="w-full h-[300px] border-0"
                                            allow="accelerometer;  clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        ></iframe>

                                        <h3 className="text-xl font-bold">{selectedStudyList.name}</h3>

                                        <div className="text-xs text-muted-foreground mt-2">
                                            Created by {selectedStudyList.owner} 
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                    <div className="flex gap-2">
                                        <Button
                                            className="flex-1"
                                            onClick={() => {
                                                window.open(selectedStudyList.url_params, '_blank');
                                            }}
                                        >
                                            Launch to New Tab
                                        </Button>

                                    </div>
                                    <div className="flex gap-2">

                                        <Input value={selectedStudyList.url_params??""} readOnly />
                                        <Button
                                            size="icon"
                                            onClick={() => {
                                                navigator.clipboard.writeText(selectedStudyList.url_params)
                                                setCopyClicked(true)
                                            }}
                                        >
                                            {copyClicked ? (
                                                <Check className="h-4" />
                                            ) : (
                                                <Copy className="h-4" />
                                            )}
                                        </Button>

                                    </div>
                                </div>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="p-4">
                                        <h4 className="font-medium mb-2">Description</h4>
                                        <p className="text-sm text-muted-foreground">{selectedStudyList.description}</p>

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
