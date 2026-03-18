import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Target, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const IntelligenceVault = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const [tradesRes, configRes] = await Promise.all([
        supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("bot_config").select("balance").limit(1).single(),
      ]);
      if (tradesRes.data) setTrades(tradesRes.data);
      if (configRes.data) setBalance(Number(configRes.data.balance));
    };
    fetchData();

    const channel = supabase
      .channel("intel-vault")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const closedTrades = trades.filter(t => t.status === "closed");
  const wins = closedTrades.filter(t => (t.profit_loss || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "—";
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const growthPct = balance > 0 ? ((totalPnl / balance) * 100).toFixed(1) : "0.0";

  const metrics = [
    { label: "Win Rate", value: closedTrades.length > 0 ? `${winRate}%` : "—", icon: Target, trend: "" },
    { label: "Total P/L", value: `$${totalPnl.toFixed(2)}`, icon: BarChart3, trend: "" },
    { label: "Total Trades", value: `${trades.length}`, icon: Award, trend: "" },
    { label: "Growth", value: `${parseFloat(growthPct) >= 0 ? "+" : ""}${growthPct}%`, icon: TrendingUp, trend: "" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Intelligence Vault — Performance Analytics
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <m.icon size={14} className="text-muted-foreground" />
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-xl font-extralight text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Trade History */}
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4 font-bold">
          Trade Audit Log
        </p>
        <div className="space-y-3">
          {trades.length === 0 && (
            <p className="text-[9px] text-muted-foreground italic">No trades recorded yet — bot will log all executions here</p>
          )}
          {trades.map((t) => {
            const isWin = (t.profit_loss || 0) > 0;
            return (
              <div key={t.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${t.status === "open" ? "bg-accent-foreground animate-pulse" : isWin ? "bg-prexfx-profit" : "bg-prexfx-loss"}`} />
                    <span className="text-[10px] font-bold text-foreground">
                      {t.pair} {t.direction.toUpperCase()}
                    </span>
                    <span className="text-[8px] text-muted-foreground">{t.status.toUpperCase()}</span>
                  </div>
                  <span className={`text-xs font-light ${t.status === "open" ? "text-foreground" : isWin ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
                    {t.status === "open" ? "LIVE" : `$${(t.profit_loss || 0).toFixed(2)}`}
                  </span>
                </div>
                {t.signal_reason && (
                  <p className="text-[9px] text-muted-foreground italic leading-relaxed">
                    "{t.signal_reason}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default IntelligenceVault;
