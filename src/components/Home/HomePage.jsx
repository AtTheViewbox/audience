import { useState, useEffect, useContext } from "react"
import { Trash2, Copy, Check, MoreHorizontal, ExternalLink, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import HomeSideBar from "./HomeSideBarComp"
import HomeHeaderComp from "./HomeHeaderComp"
import AddCaseDialog from "./AddCaseDialog"
import { UserContext } from "../../context/UserContext"
import { Input } from "@/components/ui/input"
import { Filter } from "../../lib/constants"
import { unflatten, flatten } from "flat";
import BuilderPage from "./Builder/BuilderPage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu"

export default function HomePage() {
  const [selectedSeries, setSelectedSeries] = useState([])
  const [filter, setFilter] = useState(Filter.ALL)
  const [search, setSearch] = useState("")
  const [seriesList, setSeriesList] = useState([])
  const [displaySeriesList, setdisplaySeriesList] = useState([])
  const [pacsbinStudyList, setPacsbinStudyList] = useState([])
  const { supabaseClient, userData } = useContext(UserContext).data;
  const [rightPanelWidth, setRightPanelWidth] = useState(400) // 80 * 4 = 320px (w-80)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [copyClicked, setCopyClicked] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const minRightWidth = 240
  const maxRightWidth = 500


  const handleUploadComplete = (url) => {
    console.log("HomePage: handleUploadComplete triggered with URL:", url);
    setUploadedUrl(url);
    setSelectedSeries(null);
  };


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


  const handleDelete = async (series_id) => {
    try {
      const { data, error } = await supabaseClient
        .from("studies")
        .delete()
        .eq("id", series_id);

      if (error) throw error;

      // Refresh the study list after deletion
      getSeries();

    } catch (error) {
      console.log(error)
    }
  };

  const deleteStudy = async (study_id) => {
    try {
      const { data, error } = await supabaseClient
        .from("pacsbinStudies")
        .delete()
        .eq("id", study_id);

      if (error) throw error;
      getSeries()

    } catch (error) {
      console.log(error)
    }
  };
  const getIframeURL = (url_params, preview = false) => {
    const rootUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;

    // Handle both full URLs and search params strings
    let searchString = '';
    try {
      // Check if it's a full URL
      if (url_params.startsWith('http')) {
        const url = new URL(url_params);
        searchString = url.search.substring(1); // Remove leading '?'
      } else {
        // It's already just search params
        searchString = url_params;
      }
    } catch (e) {
      // If parsing fails, assume it's search params
      searchString = url_params;
    }

    let params = new URLSearchParams(searchString);
    const initialData = unflatten(Object.fromEntries(params));

    if (preview) {
      if (initialData.vd) {
        initialData.vd.forEach((vdItem) => {
          if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
            var newD = vdItem.s.D * Math.floor((vdItem.s.e - vdItem.s.s) / (10 * vdItem.s.D))
            if (newD < 1) {
              newD = 1
            }
            vdItem.s.D = newD;
          }
        })
      }
      const updatedFlatData = flatten(initialData);
      params = new URLSearchParams(updatedFlatData);
      params.set('preview', 'true');
    }
    const newSearch = '?' + params.toString();
    const fullUrl = rootUrl + newSearch;
    return fullUrl;
  }
  const getSeries = async () => {
    try {
      let data, error;

      if (filter === Filter.PACSBIN) {
        ({ data, error } = await supabaseClient
          .from("pacsbinStudies")
          .select("*"));
        if (error) throw error;
        setPacsbinStudyList(data)
      }

      if (filter === Filter.PUBLIC) {
        ({ data, error } = await supabaseClient
          .from("studies")
          .select("*")
          .eq("visibility", "PUBLIC"));
      }
      else if (filter === Filter.MYSTUDIES) {
        if (userData) {
          ({ data, error } = await supabaseClient
            .from("studies")
            .select("*")
            .eq("owner", userData.id));
        } else {
          // Should not happen if filtered efficiently, but safe fallback
          data = [];
        }
      } else if (filter === Filter.BUILDER) {
        ({ data, error } = await supabaseClient
          .from("dicom_series")
          .select("*"));
        console.log("Builder Filter - Fetched Data:", data);
        console.log("Builder Filter - Error:", error);
      } else if (filter === Filter.ALL) {
        ({ data, error } = await supabaseClient
          .from("studies")
          .select("*"));
      } else {
        data = []
      }

      if (error) throw error;

      setSeriesList(data);
      setdisplaySeriesList(data)
      // Only auto-select first series on desktop
      if (window.innerWidth >= 768) {
        setSelectedSeries(data[0]);
      } else {
        setSelectedSeries(null);
      }

    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getSeries();
  }, [filter]);

  useEffect(() => {
    const results = seriesList.filter(item =>
      Object.values(item).some(value =>
        value.toString().toLowerCase().includes(search.toLowerCase())
      )
    );
    setdisplaySeriesList(results);

  }, [search, seriesList]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when filter changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [filter]);

  return (
    <div className="flex h-screen bg-background relative text-foreground">
      <HomeSideBar filter={filter} setFilter={setFilter} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <HomeHeaderComp setSearch={setSearch} onUploadComplete={handleUploadComplete} setMobileMenuOpen={setMobileMenuOpen} />

        <div className="flex-1 flex overflow-hidden relative">
          {filter === Filter.BUILDER ? (
            <BuilderPage
              allSeries={seriesList}
              filteredSeries={displaySeriesList}
              uploadedUrl={uploadedUrl}
              onClearUpload={() => setUploadedUrl("")}
              onStudySaved={getSeries}
            />
          ) : (
            <>
              <div className="flex-1 overflow-auto p-6 w-full bg-slate-950/20">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-100">Studies</h2>
                  <div className="flex items-center gap-4">
                    {!userData?.is_anonymous ? (
                      <AddCaseDialog onStudyAdded={getSeries} />
                    ) : null}
                  </div>
                </div>

                {filter == Filter.PACSBIN ? <div>{pacsbinStudyList.map((study) => (
                  <div
                    key={study.id}
                    className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{study.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Created by: {study.userID}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => window.open(study.metadata[0].url)}
                      >
                        <ExternalLink className="size-4 text-muted-foreground" />
                        <span className="sr-only">Open in new tab</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More options</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => deleteStudy(study.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}</div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displaySeriesList.map((series) => (
                    <Card
                      key={series.id}
                      className={`relative group cursor-pointer bg-slate-900/40 border-slate-800 hover:bg-slate-900/60 hover:border-slate-700 transition-all duration-200 ${selectedSeries?.id === series.id ? "ring-1 ring-blue-500/50 border-blue-500/50" : ""
                        }`}
                      onClick={() => setSelectedSeries(series)}
                    >
                      {filter === Filter.MYSTUDIES ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(series.id);
                          }}
                          aria-label="Delete series"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                      <CardHeader className="pb-2">
                        <div className="flex items-start gap-3">
                          <div>
                            <CardTitle className="text-base text-slate-100 font-semibold mb-1">
                              {series.name}
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                              {series.description && series.description.length > 100
                                ? series.description.slice(0, 100) + "..."
                                : series.description || "No description"}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardFooter className="pt-2 text-xs text-muted-foreground">
                        Created on{" "}
                        {
                          series.last_accessed ? new Date(series.last_accessed)
                            .toISOString()
                            .split("T")[0] : series.created_at ? new Date(series.created_at)
                              .toISOString()
                              .split("T")[0] : "Unknown date"
                        }
                      </CardFooter>
                    </Card>
                  ))}
                </div>}
              </div>

              {/* Desktop Resize Handle */}
              <div
                className="w-px cursor-col-resize bg-slate-800 hover:bg-blue-500/40 transition-colors hidden md:block"
                onMouseDown={() => setIsResizingRight(true)}
              />

              {/* Preview Panel - Desktop: Side, Mobile: Full Overlay */}
              <div
                className={`bg-slate-950 border-l border-slate-800 overflow-hidden flex flex-col 
                ${(selectedSeries || uploadedUrl) ? 'fixed inset-0 z-40 md:static md:z-auto' : 'hidden md:flex'}
            `}
                style={{ width: (window.innerWidth >= 768) ? `${rightPanelWidth}px` : '100%' }}
              >
                {/* Mobile Back Button */}
                <div className="md:hidden p-4 border-b flex items-center">
                  <Button variant="ghost" onClick={() => {
                    setSelectedSeries(null);
                    setUploadedUrl("");
                  }}>
                    <ChevronRight className="h-4 w-4 rotate-180 mr-2" />
                    Back to List
                  </Button>
                </div>

                {selectedSeries && (
                  <>
                    <div className="border-b bg-muted/20">
                      <div className="flex flex-col items-center text-center">
                        <div className="w-full aspect-square bg-black overflow-hidden border-b transition-colors">
                          <iframe
                            src={
                              selectedSeries?.url_params
                                ? getIframeURL(selectedSeries?.url_params, true)
                                : ""
                            }
                            title={`${selectedSeries.name}`}
                            className="w-full h-full border-0"
                            allow="accelerometer;  clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          ></iframe>
                        </div>

                        <div className="p-4 w-full text-left">
                          <h3 className="text-lg font-bold tracking-tight">
                            {selectedSeries.name}
                          </h3>
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">
                            Created by {selectedSeries.owner}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4 p-4">
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => {
                              window.open(
                                selectedSeries?.url_params
                                  ? getIframeURL(selectedSeries?.url_params)
                                  : "",
                                "_blank"
                              );
                            }}
                          >
                            Launch to New Tab
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={
                              selectedSeries?.url_params
                                ? getIframeURL(selectedSeries?.url_params)
                                : "" ?? ""
                            }
                            readOnly
                            className="bg-slate-900/50 border-slate-800 text-slate-300 text-xs h-9"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-slate-400 hover:text-slate-100 border border-slate-800 hover:bg-slate-900"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                selectedSeries?.url_params
                                  ? getIframeURL(selectedSeries?.url_params)
                                  : ""
                              );
                              setCopyClicked(true);
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
                    <ScrollArea className="flex-1 bg-slate-950/20">
                      <div className="p-6">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Description</h4>
                        <p className="text-sm text-slate-300 leading-relaxed italic">
                          {selectedSeries.description}
                        </p>
                      </div>
                    </ScrollArea>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
