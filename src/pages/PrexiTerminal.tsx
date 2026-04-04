import { useState, useRef, useEffect } from "react";
import { Send, Mic, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prexi-chat`;

const PrexiTerminal = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Connection failed" }));
        upsertAssistant(`⚠️ ${err.error || "Failed to connect to PREXI Brain."}`);
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      upsertAssistant("⚠️ Connection to PREXI Brain failed. Check your network.");
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-[calc(100vh-52px)]">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Prexi AI Terminal — Groq Brain
        </h2>
        <p className="text-[9px] text-muted-foreground mt-1">
          Ask about market sentiment, strategy, or trade analysis
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center mt-12 space-y-3">
            <p className="text-xs text-muted-foreground">PREXI Brain is online.</p>
            <div className="space-y-2">
              {[
                "Summarize the NFP impact for today",
                "What's the best XAU/USD entry right now?",
                "Analyze GBP/JPY sentiment",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block mx-auto px-4 py-2 rounded-lg bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${
              msg.role === "assistant"
                ? "glass-panel mr-auto"
                : "bg-accent ml-auto text-accent-foreground"
            }`}
          >
            {msg.role === "assistant" ? (
              <div className="prose prose-invert prose-xs max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              msg.content
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="glass-panel max-w-[85%] p-3 rounded-xl mr-auto flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">PREXI is analyzing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border glass-panel">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask PREXI anything..."
            className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-prexfx-silver font-mono"
            disabled={isLoading}
          />
          <button className="p-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent/80 transition-colors">
            <Mic size={16} />
          </button>
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-prexfx-silver-bright transition-colors disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrexiTerminal;
