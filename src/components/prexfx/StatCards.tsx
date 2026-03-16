import { useState, useEffect } from "react";
import { Shield, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const StatCards = () => {
  const [balance, setBalance] = useState("$1,000.00");
  const [activeTrades, setActiveTrades] = useState(0);
  const [dailyROI, setDailyROI] = useState("+0.00%");
  const [isProfit, setIsProfit] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Get bot config for balance
      const { data: config } = await supabase
        .from("bot_config")
        .select("*")
        .limit(1)
        .single();

      if (config) {
        setBalance(`$${Number(config.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
        const pnl = Number(config.daily_pnl);
        const roi = config.balance > 0 ? (pnl / Number(config.balance) * 100).toFixed(2) : "0.00";
        setDailyROI(pnl >= 0 ? `+${roi}%` : `${roi}%`);
        setIsProfit(pnl >= 0);
      }

      // Get active trades count
      const { count } = await supabase
        .from("trades")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");

      setActiveTrades(count || 0);
    };

    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel("stats-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_config" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Balance</p>
        <p className="text-xl md:text-2xl font-extralight tracking-tight text-foreground">{balance}</p>
      </div>

      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Active Trades</p>
        <p className="text-xl md:text-2xl font-extralight tracking-tight text-foreground">{activeTrades}</p>
      </div>

      <div className="glass-panel rounded-xl p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Daily ROI</p>
        <div className="flex items-center gap-2">
          {isProfit ? (
            <TrendingUp size={14} className="text-prexfx-profit" />
          ) : (
            <TrendingDown size={14} className="text-prexfx-loss" />
          )}
          <p className={`text-xl md:text-2xl font-extralight tracking-tight ${isProfit ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
            {dailyROI}
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 border-prexfx-silver/20">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Risk Status</p>
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-foreground" />
          <p className="text-sm font-bold tracking-widest text-foreground">[SHIELD: 0.5%]</p>
        </div>
      </div>
    </div>
  );
};

export default StatCards;
