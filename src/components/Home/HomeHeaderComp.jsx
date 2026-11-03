import { ChevronRight, Search, X, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { UserContext } from "../../context/UserContext"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { caseCodeFromQuery, caseCodeHref, caseIdQueryDigits, isCaseLookupQuery } from "../../lib/answerKeyCase.js"
import { resolveCaseCode } from "../../lib/playlist.js"
import JoinSessionForm from "./JoinSessionForm"

import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import DialogPage from "../DialogPage.jsx";

function HomeHeaderComp({ setSearch, setMobileMenuOpen, showMenuButton = false, showJoin = false, searchPlaceholder = "Search studies..." }) {
    const { userData, supabaseClient } = useContext(UserContext).data;
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [caseResult, setCaseResult] = useState(null)
    const [menuBox, setMenuBox] = useState(null)
    const searchRef = useRef(null)
    const inputRef = useRef(null)
    const lookupSeq = useRef(0)
    let [dialogIsOpen, setDialogIsOpen] = useState(false);
    const showMenu = Boolean(caseResult);
    const caseDigits = caseIdQueryDigits(query);

    useEffect(() => {
        if (!showMenu || !searchRef.current) return undefined;
        const place = () => {
            const rect = searchRef.current.getBoundingClientRect();
            setMenuBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [showMenu, query]);

    function closeSearch() {
        lookupSeq.current += 1;
        setIsOpen(false);
        setQuery("");
        setSearch("");
        setCaseResult(null);
        setMenuBox(null);
    }

    function onQueryChange(value) {
        const next = caseDigits != null ? `case:${value.replace(/\D/g, "").slice(0, 6)}` : value;
        setQuery(next);
        setCaseResult(null);
        setMenuBox(null);
        setSearch(next);
    }

    async function lookupCase(code) {
        const seq = lookupSeq.current + 1;
        lookupSeq.current = seq;
        setCaseResult({ code, status: "loading" });
        if (!supabaseClient) {
            setCaseResult({ code, status: "error" });
            return;
        }
        try {
            const row = await resolveCaseCode(supabaseClient, code);
            if (lookupSeq.current !== seq) return;
            setCaseResult(row?.id
                ? { code, status: "found", name: row.name || "" }
                : { code, status: "missing" });
        } catch (error) {
            console.error(error);
            if (lookupSeq.current !== seq) return;
            setCaseResult({ code, status: "error" });
        }
    }

    function openCase(code) {
        window.location.assign(caseCodeHref(code));
    }

    function onSearchKeyDown(event) {
        if (event.key === "Escape") {
            setCaseResult(null);
            setMenuBox(null);
            return;
        }
        if (event.key === "Backspace" && caseDigits === "") {
            event.preventDefault();
            setQuery("");
            setSearch("");
            setCaseResult(null);
            return;
        }
        if (event.key !== "Enter") return;
        const typed = caseDigits != null
            ? `case:${event.currentTarget.value.replace(/\D/g, "")}`
            : event.currentTarget.value;
        const code = caseCodeFromQuery(typed);
        if (!code) {
            if (isCaseLookupQuery(typed)) {
                setCaseResult({ code: "", status: "invalid" });
            }
            return;
        }
        event.preventDefault();
        if (caseResult?.status === "found" && caseResult.code === code) {
            openCase(code);
            return;
        }
        lookupCase(code);
    }

    async function logOut() {

        try {
            const { error } = await supabaseClient.auth.signOut({ scope: 'global' })
            if (error) throw error;

            await supabaseClient.auth.signInAnonymously();
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <header className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-6">
            <div className="flex items-center gap-2 w-full lg:w-auto">
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "mr-2 text-slate-400 hover:text-slate-100 hover:bg-slate-900/50",
                        !showMenuButton && "lg:hidden"
                    )}
                    onClick={() => setMobileMenuOpen(true)}
                    title="Open menu"
                >
                    <Menu className="h-5 w-5" />
                </Button>

                {!isOpen ? (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border border-slate-800" onClick={() => setIsOpen(true)}>
                        <ChevronRight className="h-4 w-4" />
                        Browse
                    </Button>
                ) : (
                    <div ref={searchRef} className="relative flex-1 lg:flex-none">
                        <div className={cn(
                            "relative flex items-center w-full",
                            caseDigits != null && "h-10 rounded-lg border border-slate-800 bg-slate-900/50 pr-10 focus-within:ring-1 focus-within:ring-blue-500/30 lg:w-[400px]"
                        )}>
                            <div className="absolute left-3 z-[3] text-slate-500">
                                <Search className="h-4 w-4" />
                            </div>
                            {caseDigits != null ? (
                                <span className="relative z-[2] ml-9 mr-1.5 shrink-0 rounded bg-[#4e5058] px-1.5 text-sm leading-5 text-slate-100">case:</span>
                            ) : null}
                            <Input
                                ref={inputRef}
                                type="text"
                                placeholder={caseDigits != null ? "" : searchPlaceholder}
                                value={caseDigits != null ? caseDigits : query}
                                className={cn(
                                    "relative z-[2] h-10 rounded-lg border-slate-800 text-slate-100 placeholder:text-slate-500 shadow-none focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 transition-all duration-300 animate-in fade-in slide-in-from-left-4",
                                    caseDigits != null
                                        ? "w-full min-w-0 flex-1 border-0 bg-transparent px-0 focus-visible:ring-0"
                                        : "w-full bg-slate-900/50 pl-9 pr-10 lg:w-[400px]"
                                )}
                                autoComplete="off"
                                autoFocus
                                onChange={(e) => onQueryChange(e.target.value)}
                                onKeyDown={onSearchKeyDown}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 z-[3] -translate-y-1/2 h-8 w-8 rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-800"
                                onClick={closeSearch}
                                aria-label="Close search"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        {showMenu && menuBox ? createPortal(
                            <div
                                className="fixed z-50 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 py-1 shadow-xl"
                                style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
                            >
                                {caseResult?.status === "loading" ? (
                                    <p className="px-3 py-2 text-sm text-slate-300">Looking up case:{caseResult.code}</p>
                                ) : caseResult?.status === "found" ? (
                                    <button
                                        type="button"
                                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-900"
                                        onClick={() => openCase(caseResult.code)}
                                    >
                                        <span className="text-sm text-slate-100">{caseResult.name || "Open case"}</span>
                                        <span className="text-xs text-slate-400">case:{caseResult.code}</span>
                                    </button>
                                ) : caseResult ? (
                                    <p className="px-3 py-2 text-sm text-slate-400">
                                        {caseResult.status === "error"
                                            ? "Could not look up that case."
                                            : caseResult.status === "invalid"
                                                ? "Enter the full case ID."
                                                : "That case link is not active."}
                                    </p>
                                ) : null}
                            </div>,
                            document.body
                        ) : null}
                    </div>
                )}
            </div>



            <div className="flex items-center gap-2 shrink-0">
                {showJoin ? <JoinSessionForm variant="header" /> : null}
                {!userData?.is_anonymous ?
                    <Button variant="ghost" className="text-xs font-medium text-slate-400 hover:text-slate-100 border border-slate-800" onClick={logOut}>Log Out</Button>
                    :
                    <Dialog open={dialogIsOpen} onOpenChange={setDialogIsOpen}>
                        <Button className="h-8 bg-white text-slate-950 hover:bg-slate-100 text-xs font-semibold px-3" onClick={() => setDialogIsOpen(true)}>Login</Button>
                        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
                            <DialogPage />
                        </DialogContent>
                    </Dialog>
                }
            </div>
        </header>
    )
}

export default HomeHeaderComp;




