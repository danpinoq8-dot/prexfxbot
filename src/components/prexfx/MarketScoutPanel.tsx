import { useState, useEffect } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MarketScoutPanel = () => {
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("trade_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4);
      if (data) setSignals(data);
    };
    fetch();

    const channel = supabase
      .channel("scout-signals")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_signals" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Market Scout
        </h3>
        <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded bg-accent text-accent-foreground">
          <Zap size={8} className="inline mr-1" />
          Live Signals
        </span>
      </div>

      <div className="space-y-2.5">
        {signals.length === 0 && (
          <p className="text-[9px] text-muted-foreground italic">No signals yet — waiting for next scan</p>
        )}
        {signals.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
              s.signal === "hold"
                ? "bg-secondary/30"
                : s.executed
                ? "bg-accent/20 border border-accent/30"
                : "bg-destructive/10 border border-destructive/20"
            }`}
          >
            {s.signal !== "hold" && !s.executed && (
              <AlertTriangle size={12} className="text-destructive-foreground shrink-0" />
            )}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                s.signal === "buy" ? "bg-prexfx-profit" : s.signal === "sell" ? "bg-prexfx-loss" : "bg-muted-foreground"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-foreground font-medium truncate">
                {s.pair} — {s.signal.toUpperCase()} ({s.confidence}%)
              </p>
              <p className="text-[9px] text-muted-foreground truncate">
                {s.reasoning?.slice(0, 60) || "No reasoning"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketScoutPanel;
