import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, Target, Award, Filter } from "lucide-react";
import { appwrite } from "@/lib/appwrite";

type TradeFilter = "all" | "open" | "closed";

const IntelligenceVault = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [filter, setFilter] = useState<TradeFilter>("all");

  useEffect(() => {
    const fetchData = async () => {
      const [tradesRes, configRes] = await Promise.all([
        supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(100),
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

  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");
  const wins = closedTrades.filter(t => (t.profit_loss || 0) > 0).length;
  const losses = closedTrades.filter(t => (t.profit_loss || 0) < 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "—";
  const totalPnl = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const openPnl = openTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const closedPnl = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);

  const filteredTrades = filter === "all" ? trades : filter === "open" ? openTrades : closedTrades;

  const metrics = [
    { label: "Win Rate", value: closedTrades.length > 0 ? `${winRate}%` : "—", sub: `${wins}W / ${losses}L`, icon: Target, color: "" },
    { label: "Open P/L", value: `$${openPnl.toFixed(2)}`, sub: `${openTrades.length} positions`, icon: BarChart3, color: openPnl >= 0 ? "text-prexfx-profit" : "text-prexfx-loss" },
    { label: "Closed P/L", value: `$${closedPnl.toFixed(2)}`, sub: `${closedTrades.length} trades`, icon: Award, color: closedPnl >= 0 ? "text-prexfx-profit" : "text-prexfx-loss" },
    { label: "Total Trades", value: `${trades.length}`, sub: `${openTrades.length} open`, icon: TrendingUp, color: "" },
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
            <p className={`text-xl font-extralight ${m.color || "text-foreground"}`}>{m.value}</p>
            <p className="text-[8px] text-muted-foreground mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter size={12} className="text-muted-foreground" />
        {(["all", "open", "closed"] as TradeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest transition-colors ${
              filter === f ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f} ({f === "all" ? trades.length : f === "open" ? openTrades.length : closedTrades.length})
          </button>
        ))}
      </div>

      {/* Trade History */}
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4 font-bold">
          Trade Log
        </p>
        <div className="space-y-3">
          {filteredTrades.length === 0 && (
            <p className="text-[9px] text-muted-foreground italic">No trades in this category</p>
          )}
          {filteredTrades.map((t) => {
            const pl = t.profit_loss || 0;
            const isWin = pl > 0;
            const isOpen = t.status === "open";
            return (
              <div key={t.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-accent-foreground animate-pulse" : isWin ? "bg-prexfx-profit" : "bg-prexfx-loss"}`} />
                    <span className="text-[10px] font-bold text-foreground">
                      {t.pair} {t.direction?.toUpperCase()}
                    </span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded ${isOpen ? "bg-accent/50 text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {t.status?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-light ${isOpen ? (pl >= 0 ? "text-prexfx-profit profit-glow" : "text-prexfx-loss") : isWin ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
                      {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                  {t.entry_price && <span>Entry: {t.entry_price}</span>}
                  {t.units && <span>Units: {Math.abs(t.units)}</span>}
                  {t.stop_loss && <span>SL: {t.stop_loss}</span>}
                  {t.take_profit && <span>TP: {t.take_profit}</span>}
                </div>
                {t.signal_reason && (
                  <p className="text-[9px] text-muted-foreground italic leading-relaxed mt-1">
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
