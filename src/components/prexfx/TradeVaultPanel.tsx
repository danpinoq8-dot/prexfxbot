import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface VaultEntry {
  id: number;
  pair: string;
  direction: string;
  entry: string;
  shield: string;
  logic: string;
  status: "passed" | "failed";
}

const mockVault: VaultEntry[] = [
  {
    id: 104,
    pair: "XAU/USD",
    direction: "SELL",
    entry: "$1985",
    shield: "0.5%",
    logic: "H1 supply zone confirmation. Audit Passed.",
    status: "passed",
  },
  {
    id: 103,
    pair: "EUR/USD",
    direction: "BUY",
    entry: "1.0842",
    shield: "0.5%",
    logic: "M15 bullish engulfing at demand zone.",
    status: "passed",
  },
  {
    id: 102,
    pair: "GBP/JPY",
    direction: "SELL",
    entry: "191.34",
    shield: "0.5%",
    logic: "Rejected due to NFP proximity. News blackout active.",
    status: "failed",
  },
];

const TradeVaultPanel = () => {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Trade Vault (AI Audit)
        </h3>
        <span className="text-[8px] uppercase tracking-widest text-muted-foreground">
          Journal Entry
        </span>
      </div>

      <div className="space-y-2">
        {mockVault.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
            className="w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  entry.status === "passed" ? "bg-prexfx-profit" : "bg-prexfx-loss"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground font-medium">
                  {entry.pair} – {entry.direction} @ {entry.entry}. SHIELD: {entry.shield}.
                </p>
                {expanded === entry.id && (
                  <p className="text-[9px] text-muted-foreground mt-1.5 italic leading-relaxed">
                    AI Logic: {entry.logic}
                  </p>
                )}
              </div>
              <ChevronRight
                size={12}
                className={`text-muted-foreground transition-transform shrink-0 ${
                  expanded === entry.id ? "rotate-90" : ""
                }`}
              />
            </div>
          </button>
        ))}
      </div>

      <button className="w-full mt-3 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors py-1">
        View Full History →
      </button>
    </div>
  );
};

export default TradeVaultPanel;
