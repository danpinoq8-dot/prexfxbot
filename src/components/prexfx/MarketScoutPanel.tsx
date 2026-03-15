import { AlertTriangle, Zap } from "lucide-react";

interface NewsItem {
  id: number;
  flag: string;
  currency: string;
  event: string;
  time: string;
  impact: "high" | "medium" | "low";
}

const mockNews: NewsItem[] = [
  { id: 1, flag: "🇺🇸", currency: "USD", event: "CPI Data", time: "8:30 AM EST", impact: "high" },
  { id: 2, flag: "🇬🇧", currency: "GBP", event: "BoE Interest Rate", time: "11:00 AM GMT", impact: "high" },
  { id: 3, flag: "🇪🇺", currency: "EUR", event: "ECB Press Conference", time: "1:45 PM CET", impact: "medium" },
  { id: 4, flag: "🇯🇵", currency: "JPY", event: "GDP Preliminary", time: "11:50 PM JST", impact: "low" },
];

const MarketScoutPanel = () => {
  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
          Market Scout
        </h3>
        <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded bg-accent text-accent-foreground">
          <Zap size={8} className="inline mr-1" />
          High Impact
        </span>
      </div>

      <div className="space-y-2.5">
        {mockNews.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
              item.impact === "high"
                ? "bg-destructive/10 border border-destructive/20"
                : "bg-secondary/30"
            }`}
          >
            {item.impact === "high" && (
              <AlertTriangle size={12} className="text-destructive-foreground shrink-0" />
            )}
            <span className="text-sm">{item.flag}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-foreground font-medium truncate">
                {item.currency} – {item.event}
              </p>
              <p className="text-[9px] text-muted-foreground">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketScoutPanel;
