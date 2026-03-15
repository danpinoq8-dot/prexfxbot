import { BarChart3, TrendingUp, Target, Award } from "lucide-react";

const metrics = [
  { label: "Win Rate", value: "68.4%", icon: Target, trend: "+2.1%" },
  { label: "Sharpe Ratio", value: "1.82", icon: BarChart3, trend: "+0.12" },
  { label: "Total Trades", value: "47", icon: Award, trend: "" },
  { label: "Growth (MTD)", value: "+12.3%", icon: TrendingUp, trend: "" },
];

const tradeHistory = [
  { id: 108, pair: "XAU/USD", dir: "BUY", pnl: "+$12.40", result: "win", postMortem: "Clean breakout above $2340 resistance. Momentum confirmed by volume spike." },
  { id: 107, pair: "EUR/USD", dir: "SELL", pnl: "-$3.20", result: "loss", postMortem: "Trade failed due to high-impact NFP news. Entry was 15 min before blackout window." },
  { id: 106, pair: "GBP/USD", dir: "BUY", pnl: "+$8.65", result: "win", postMortem: "Demand zone bounce on H1. Gemini confirmed low volatility risk." },
  { id: 105, pair: "USD/JPY", dir: "SELL", pnl: "+$5.10", result: "win", postMortem: "BoJ intervention rumors created clean short setup. Risk managed at 0.5%." },
];

const IntelligenceVault = () => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Intelligence Vault — Performance Analytics
      </h2>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <m.icon size={14} className="text-muted-foreground" />
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-xl font-extralight text-foreground">{m.value}</p>
            {m.trend && (
              <p className="text-[9px] text-prexfx-profit mt-1">{m.trend}</p>
            )}
          </div>
        ))}
      </div>

      {/* Growth Curve Placeholder */}
      <div className="glass-panel rounded-xl p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Equity Growth Curve
        </p>
        <div className="h-48 bg-secondary/20 rounded-lg border border-border flex items-center justify-center">
          <span className="text-[10px] text-muted-foreground italic">
            Performance chart — coming soon
          </span>
        </div>
      </div>

      {/* Trade History with Post-Mortems */}
      <div className="glass-panel rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4 font-bold">
          Trade Audit Log
        </p>
        <div className="space-y-3">
          {tradeHistory.map((t) => (
            <div key={t.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.result === "win" ? "bg-prexfx-profit" : "bg-prexfx-loss"}`} />
                  <span className="text-[10px] font-bold text-foreground">
                    #{t.id} {t.pair} {t.dir}
                  </span>
                </div>
                <span className={`text-xs font-light ${t.result === "win" ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"}`}>
                  {t.pnl}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground italic leading-relaxed">
                Post-Mortem: "{t.postMortem}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntelligenceVault;
