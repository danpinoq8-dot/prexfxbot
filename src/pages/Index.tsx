import { useState } from "react";
import StatusBar from "@/components/prexfx/StatusBar";
import PriceTicker from "@/components/prexfx/PriceTicker";
import EquityPanel from "@/components/prexfx/EquityPanel";
import SentimentGauge from "@/components/prexfx/SentimentGauge";
import TradeCard from "@/components/prexfx/TradeCard";
import AuditTrail from "@/components/prexfx/AuditTrail";
import AgencyVault from "@/components/prexfx/AgencyVault";
import SettingsModal from "@/components/prexfx/SettingsModal";
import type { Trade } from "@/components/prexfx/TradeCard";

const mockTrades: Trade[] = [
  { id: 1, pair: "GBPUSD", direction: "BUY", entry: "1.2714", lot: "0.03", sl: "20 PIPS", pnl: 4.12, status: "active" },
  { id: 2, pair: "EURUSD", direction: "SELL", entry: "1.0842", lot: "0.02", sl: "15 PIPS", pnl: -1.35, status: "active" },
  { id: 3, pair: "XAUUSD", direction: "BUY", entry: "2341.50", lot: "0.01", sl: "30 PIPS", pnl: 8.60, status: "closed" },
];

const Index = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background prexfx-grid">
      <StatusBar
        scoutActive={true}
        brainActive={false}
        onSettingsClick={() => setSettingsOpen(true)}
      />
      <PriceTicker />

      <section className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-[1400px] mx-auto">
        {/* Left: Equity Panel */}
        <div className="md:col-span-2">
          <EquityPanel />
        </div>

        {/* Right: Sentiment */}
        <div>
          <SentimentGauge value={68} />
        </div>

        {/* Active Trades */}
        <div className="md:col-span-2 glass-panel rounded-2xl p-6">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Active Deployments
          </h3>
          <div className="space-y-3">
            {mockTrades
              .filter((t) => t.status === "active")
              .map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
          </div>

          <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4 mt-8">
            Closed Positions
          </h3>
          <div className="space-y-3">
            {mockTrades
              .filter((t) => t.status === "closed")
              .map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
          </div>
        </div>

        {/* Right column: Vault + Audit */}
        <div className="space-y-4 md:space-y-6">
          <AgencyVault />
          <AuditTrail />
        </div>
      </section>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default Index;
