import { useState } from "react";

const pairs = ["XAU/USD", "EUR/USD", "GBP/USD", "GBP/JPY", "USD/JPY"];

const ChartPanel = () => {
  const [selectedPair, setSelectedPair] = useState("XAU/USD");

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col">
      {/* Pair selector + Buy/Sell */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-prexfx-silver font-mono"
          >
            {pairs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-1.5 rounded-lg bg-accent text-accent-foreground text-[10px] uppercase tracking-widest font-bold hover:bg-accent/80 transition-colors">
            Buy
          </button>
          <button className="px-4 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] uppercase tracking-widest font-bold hover:bg-secondary/80 transition-colors">
            Sell
          </button>
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="flex-1 min-h-[200px] md:min-h-[300px] bg-secondary/20 rounded-lg border border-border flex items-center justify-center">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground italic mb-1">
            {selectedPair} — LIVE CHART FEED
          </p>
          <p className="text-[8px] text-muted-foreground">
            TradingView widget will be integrated here
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChartPanel;
