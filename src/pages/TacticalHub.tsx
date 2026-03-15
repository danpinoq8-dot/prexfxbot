import PriceTicker from "@/components/prexfx/PriceTicker";
import StatCards from "@/components/prexfx/StatCards";
import ChartPanel from "@/components/prexfx/ChartPanel";
import MarketScoutPanel from "@/components/prexfx/MarketScoutPanel";
import TradeVaultPanel from "@/components/prexfx/TradeVaultPanel";
import HeartbeatLine from "@/components/prexfx/HeartbeatLine";

const TacticalHub = () => {
  return (
    <div className="flex flex-col">
      <PriceTicker />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto w-full">
        {/* Connection Pulse */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          <HeartbeatLine active={true} />
          <span>Deriv Connected</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-prexfx-profit animate-pulse-glow" />
            Live
          </span>
        </div>

        {/* Stat Cards */}
        <StatCards balance="$1,250.00" activeTrades={2} dailyROI="+1.2%" />

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
