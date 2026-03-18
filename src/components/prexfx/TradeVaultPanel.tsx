import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const TradeVaultPanel = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setTrades(data);
    };
    fetch();

    const channel = supabase
      .channel("vault-trades")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Trade Vault
        </h3>
        <span className="text-[8px] uppercase tracking-widest text-muted-foreground">
          OANDA
        </span>
      </div>

      <div className="space-y-2">
        {trades.length === 0 && (
          <p className="text-[9px] text-muted-foreground italic">No trades yet — bot will execute when signals are strong</p>
        )}
        {trades.map((t) => {
          const isProfit = (t.profit_loss || 0) > 0;
          return (
            <button
              key={t.id}
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              className="w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    t.status === "open" ? "bg-accent-foreground animate-pulse" : isProfit ? "bg-prexfx-profit" : "bg-prexfx-loss"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-foreground font-medium">
                    {t.pair} – {t.direction.toUpperCase()} @ {t.entry_price || "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {t.status === "open" ? "OPEN" : `P/L: $${t.profit_loss?.toFixed(2) || "0.00"}`}
                    {t.units ? ` | ${Math.abs(t.units)} units` : ` | $${t.stake} stake`}
                  </p>
                  {expanded === t.id && t.signal_reason && (
                    <p className="text-[9px] text-muted-foreground mt-1.5 italic leading-relaxed">
                      AI Logic: {t.signal_reason}
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={12}
                  className={`text-muted-foreground transition-transform shrink-0 ${expanded === t.id ? "rotate-90" : ""}`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TradeVaultPanel;
