import { useState, useEffect } from "react";
import { Power, PowerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PriceTicker from "@/components/prexfx/PriceTicker";
import StatCards from "@/components/prexfx/StatCards";
import ChartPanel from "@/components/prexfx/ChartPanel";
import MarketScoutPanel from "@/components/prexfx/MarketScoutPanel";
import TradeVaultPanel from "@/components/prexfx/TradeVaultPanel";
import HeartbeatLine from "@/components/prexfx/HeartbeatLine";
import { toast } from "@/hooks/use-toast";

const TacticalHub = () => {
  const [botActive, setBotActive] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("bot_config")
        .select("is_active, last_scan_at")
        .limit(1)
        .single();
      if (data) {
        setBotActive(data.is_active);
        setLastScan(data.last_scan_at);
      }
    };
    fetchConfig();

    const channel = supabase
      .channel("bot-config-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_config" }, () => fetchConfig())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggleBot = async () => {
    const newState = !botActive;
    const { error } = await supabase
      .from("bot_config")
      .update({ is_active: newState, updated_at: new Date().toISOString() })
      .not("id", "is", null);

    if (error) {
      toast({ title: "Error", description: "Failed to toggle bot", variant: "destructive" });
      return;
    }

    setBotActive(newState);
    toast({
      title: newState ? "🟢 Bot Activated" : "🔴 Bot Deactivated",
      description: newState ? "PREXI will start scanning and trading autonomously." : "Bot has been stopped. No new trades will be placed.",
    });

    // If activating, trigger an immediate scan
    if (newState) {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trade-engine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        const result = await res.json();
        if (result.market_summary) {
          toast({ title: "Market Scan Complete", description: result.market_summary });
        }
      } catch (e) {
        console.error("Scan trigger failed:", e);
      }
    }
  };

  return (
    <div className="flex flex-col">
      <PriceTicker />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto w-full">
        {/* Connection Pulse + Bot Toggle */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          <HeartbeatLine active={botActive} />
          <span>{botActive ? "Bot Active" : "Bot Inactive"}</span>
          {lastScan && (
            <span className="text-[8px] normal-case">
              Last scan: {new Date(lastScan).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={toggleBot}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
              botActive
                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                : "bg-primary text-primary-foreground hover:bg-prexfx-silver-bright"
            }`}
          >
            {botActive ? <PowerOff size={12} /> : <Power size={12} />}
            {botActive ? "Stop" : "Activate"}
          </button>
        </div>

        {/* Stat Cards */}
        <StatCards />

        {/* Chart + Right Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <ChartPanel />
          </div>
          <div className="space-y-4">
            <MarketScoutPanel />
            <TradeVaultPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TacticalHub;
