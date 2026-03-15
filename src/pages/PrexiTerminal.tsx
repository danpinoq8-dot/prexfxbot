import { useState } from "react";
import { Send, Mic } from "lucide-react";

const PrexiTerminal = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant" as const,
      content:
        'PREXI: Impact expected to be high. Gold often reacts strongly. I advise monitoring key support at $1950 before entering.',
    },
    {
      role: "user" as const,
      content: '"Prexi, summarize the NFP impact for today."',
    },
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-[calc(100vh-52px)]">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Prexi AI Terminal — Gemini Brain
        </h2>
        <p className="text-[9px] text-muted-foreground mt-1">
          Ask about market sentiment, strategy, or trade analysis
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${
              msg.role === "assistant"
                ? "glass-panel mr-auto"
                : "bg-accent ml-auto text-accent-foreground"
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border glass-panel">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Prexi AI Terminal..."
            className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-prexfx-silver font-mono"
          />
          <button className="p-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent/80 transition-colors">
            <Mic size={16} />
          </button>
          <button className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-prexfx-silver-bright transition-colors">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrexiTerminal;
