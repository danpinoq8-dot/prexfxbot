import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const TradeVaultPanel = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrades = async () => {
      const { data } = await supabase
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setTrades(data);
    };
    fetchTrades();

    const channel = supabase
      .channel("vault-trades")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => fetchTrades())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Trade Vault
        </h3>
        <span className="text-[8px] uppercase tracking-widest text-muted-foreground">
          {openTrades.length} OPEN | {closedTrades.length} CLOSED
        </span>
      </div>

      <div className="space-y-2">
        {trades.length === 0 && (
          <p className="text-[9px] text-muted-foreground italic">No trades yet</p>
        )}
        {trades.map((t) => {
          const pl = t.profit_loss || 0;
          const isProfit = pl > 0;
          const isOpen = t.status === "open";
          return (
            <button
              key={t.id}
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              className="w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${isOpen ? "bg-accent-foreground animate-pulse" : isProfit ? "bg-prexfx-profit" : "bg-prexfx-loss"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-foreground font-medium">
                      {t.pair} – {t.direction?.toUpperCase()} @ {t.entry_price || "—"}
                    </p>
                    <span className={`text-[10px] font-medium ${pl >= 0 ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
                      {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    {isOpen ? "LIVE" : "CLOSED"}
                    {t.units ? ` | ${Math.abs(t.units)} units` : ""}
                  </p>
                  {expanded === t.id && (
                    <div className="mt-1.5 space-y-1">
                      {t.stop_loss && <p className="text-[9px] text-muted-foreground">SL: {t.stop_loss} | TP: {t.take_profit || "—"}</p>}
                      {t.signal_reason && <p className="text-[9px] text-muted-foreground italic">AI: {t.signal_reason}</p>}
                    </div>
                  )}
                </div>
                <ChevronRight size={12} className={`text-muted-foreground transition-transform shrink-0 ${expanded === t.id ? "rotate-90" : ""}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TradeVaultPanel;
