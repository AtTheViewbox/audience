import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Loader2, Send, User, Share } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

const Visibility = { PUBLIC: "PUBLIC" };
const Mode = { TEAM: "TEAM" };

export default function MedGemmaChat({
    messages,
    setMessages,
    BASE_URL,
    userData,
    supabaseClient
}) {
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, chatLoading]);

    const handleChatSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || chatLoading) return;

        const userMsg = { role: "user", content: chatInput };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setChatInput("");
        setChatLoading(true);

        try {
            const response = await fetch(`${BASE_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newHistory.filter(m => m.role === 'user' || m.role === 'assistant')
                })
            });

            if (!response.ok) throw new Error("Chat failed");

            const data = await response.json();
            setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
        } catch (err) {
            console.error(err);
            toast.error("Failed to send message");
            setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error." }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleShareSession = async () => {
        if (!userData || !supabaseClient) {
            toast.error("You need to be logged in to share sessions.");
            return;
        }

        try {
            const queryParams = new URLSearchParams(window.location.search);
            await supabaseClient.from("viewbox").delete().eq("user", userData.id);

            const { data, error } = await supabaseClient
                .from("viewbox")
                .upsert([{
                    user: userData.id,
                    url_params: queryParams.toString(),
                    visibility: Visibility.PUBLIC,
                    mode: Mode.TEAM,
                }])
                .select();

            if (error) throw error;

            if (data && data.length > 0) {
                const sessionId = data[0].session_id;
                const newQueryParams = new URLSearchParams();
                newQueryParams.set("s", sessionId);
                const shareLink = `${window.location.origin}${window.location.pathname}?${newQueryParams.toString()}`;

                if (navigator.share) {
                    try {
                        await navigator.share({ title: "Shared Medical Imaging Session", text: "Review this case on ViewBox:", url: shareLink });
                        toast.success("Opened share dialog.");
                    } catch (shareErr) {
                        if (shareErr.name === 'AbortError') return;
                        await navigator.clipboard.writeText(shareLink);
                        toast.success("Link copied to clipboard.");
                    }
                } else {
                    await navigator.clipboard.writeText(shareLink);
                    toast.success("Shared session created! Link copied to clipboard.");
                }
            }
        } catch (err) {
            console.error("Share failed:", err);
            toast.error("Failed to create shared session.");
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-950">
            <ScrollArea className="flex-1 bg-slate-950/20">
                <div className="p-2 space-y-2 pb-2">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'assistant'
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}>
                                {msg.role === 'assistant' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            </div>
                            <div className={`p-2 text-xs max-w-[88%] leading-relaxed ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                                : 'bg-slate-900/60 border border-slate-800 text-slate-200 rounded-2xl rounded-tl-sm'
                                }`}>
                                {msg.role === 'assistant' ? (
                                    <div className="markdown-content [&_p]:text-slate-200 [&_li]:text-slate-200 [&_h1]:text-slate-100 [&_h2]:text-slate-100 [&_h3]:text-slate-100 [&_strong]:text-slate-100 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </div>
                    ))}

                    {messages.length > 2 && !chatLoading && (
                        <div className="flex justify-end px-1 pt-1">
                            <button
                                onClick={handleShareSession}
                                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                            >
                                <Share className="h-3 w-3" /> Share with care team
                            </button>
                        </div>
                    )}

                    {chatLoading && (
                        <div className="flex gap-2">
                            <div className="h-6 w-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                <Bot className="h-3 w-3" />
                            </div>
                            <div className="bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-2xl rounded-tl-sm text-xs text-slate-400 animate-pulse flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-2 bg-slate-950 border-t border-slate-800">
                <form onSubmit={handleChatSubmit} className="flex gap-2 relative">
                    <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask a follow-up..."
                        className="flex-1 pr-8 h-8 text-xs bg-slate-900/50 text-slate-100 border-slate-800 placeholder:text-slate-500 focus-visible:ring-blue-500/30"
                        disabled={chatLoading}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleChatSubmit(e); }}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!chatInput.trim() || chatLoading}
                        className="absolute right-1 top-0.5 h-7 w-7 text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                        variant="ghost"
                    >
                        {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                </form>
            </div>
        </div>
    );
}