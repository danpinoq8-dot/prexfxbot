import { useState, useEffect } from "react";
import { Shield, TrendingUp, TrendingDown, Target, Activity, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const StatCards = () => {
  const [balance, setBalance] = useState(0);
  const [activeTrades, setActiveTrades] = useState(0);
  const [dailyPnl, setDailyPnl] = useState(0);
  const [winRate, setWinRate] = useState("—");
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [dailyLossR, setDailyLossR] = useState(0);
  const [strategy, setStrategy] = useState("trend_pullback");

  useEffect(() => {
    const fetchData = async () => {
      const [configRes, tradesRes] = await Promise.all([
        supabase.from("bot_config").select("*").limit(1).single(),
        supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(500),
      ]);

      if (configRes.data) {
        setBalance(Number(configRes.data.balance));
        setDailyPnl(Number(configRes.data.daily_pnl));
        setConsecutiveLosses(Number((configRes.data as any).consecutive_losses || 0));
        setDailyLossR(Number((configRes.data as any).daily_loss_r || 0));
        setStrategy((configRes.data as any).strategy || "trend_pullback");
      }

      if (tradesRes.data) {
        const open = tradesRes.data.filter(t => t.status === "open");
        const closed = tradesRes.data.filter(t => t.status === "closed");
        const w = closed.filter(t => (t.profit_loss || 0) > 0).length;
        const l = closed.filter(t => (t.profit_loss || 0) < 0).length;
        setActiveTrades(open.length);
        setWins(w);
        setLosses(l);
        setWinRate(closed.length > 0 ? `${((w / closed.length) * 100).toFixed(1)}%` : "—");
        setTotalPnl(tradesRes.data.reduce((s, t) => s + (t.profit_loss || 0), 0));
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const isProfit = dailyPnl >= 0;
  const isCircuitBreaker = dailyLossR >= 2 || consecutiveLosses >= 3;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Balance</p>
        <p className="text-lg md:text-xl font-extralight tracking-tight text-foreground">
          ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[8px] text-muted-foreground mt-1">0.1% risk/trade</p>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Open Trades</p>
        <p className="text-lg md:text-xl font-extralight tracking-tight text-foreground">{activeTrades}/7</p>
        <p className="text-[8px] text-muted-foreground mt-1">max concurrent</p>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Unrealized P/L</p>
        <div className="flex items-center gap-2">
          {isProfit ? <TrendingUp size={14} className="text-prexfx-profit" /> : <TrendingDown size={14} className="text-prexfx-loss" />}
          <p className={`text-lg md:text-xl font-extralight tracking-tight ${isProfit ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
            {isProfit ? "+" : ""}${dailyPnl.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center gap-1 mb-1">
          <Target size={10} className="text-muted-foreground" />
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Win Rate</p>
        </div>
        <p className="text-lg md:text-xl font-extralight tracking-tight text-foreground">{winRate}</p>
        <p className="text-[8px] text-muted-foreground">{wins}W / {losses}L</p>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center gap-1 mb-1">
          <Shield size={10} className="text-muted-foreground" />
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Total P/L</p>
        </div>
        <p className={`text-lg md:text-xl font-extralight tracking-tight ${totalPnl >= 0 ? "text-prexfx-profit" : "text-prexfx-loss"}`}>
          {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
        </p>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center gap-1 mb-1">
          {isCircuitBreaker ? <AlertTriangle size={10} className="text-prexfx-loss" /> : <Activity size={10} className="text-muted-foreground" />}
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Circuit</p>
        </div>
        <p className={`text-sm font-extralight ${isCircuitBreaker ? "text-prexfx-loss" : "text-prexfx-profit"}`}>
          {isCircuitBreaker ? "HALTED" : "ACTIVE"}
        </p>
        <p className="text-[8px] text-muted-foreground">{dailyLossR.toFixed(1)}R loss / {consecutiveLosses} streak</p>
      </div>
    </div>
  );
};

export default StatCards;
