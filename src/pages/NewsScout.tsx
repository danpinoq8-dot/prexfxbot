import { useState } from "react";
import SentimentGauge from "@/components/prexfx/SentimentGauge";
import { AlertTriangle, Clock, Shield } from "lucide-react";

interface EconomicEvent {
  id: number;
  flag: string;
  currency: string;
  event: string;
  time: string;
  countdown: string;
  impact: "red" | "orange" | "yellow";
}

const upcomingEvents: EconomicEvent[] = [
  { id: 1, flag: "🇺🇸", currency: "USD", event: "Non-Farm Payrolls (NFP)", time: "8:30 AM EST", countdown: "2h 15m", impact: "red" },
  { id: 2, flag: "🇬🇧", currency: "GBP", event: "Bank of England Rate Decision", time: "12:00 PM GMT", countdown: "5h 45m", impact: "red" },
  { id: 3, flag: "🇪🇺", currency: "EUR", event: "CPI Flash Estimate", time: "10:00 AM CET", countdown: "3h 30m", impact: "orange" },
  { id: 4, flag: "🇯🇵", currency: "JPY", event: "Trade Balance", time: "11:50 PM JST", countdown: "14h 20m", impact: "yellow" },
];

const NewsScout = () => {
  const [sentimentValue] = useState(68);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        News Scout — Global Sentiment Monitor
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Sentiment Gauge */}
        <SentimentGauge value={sentimentValue} />

        {/* Blackout Status */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center gap-3">
          <Shield size={24} className="text-prexfx-profit" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            News Blackout Status
          </p>
          <p className="text-sm font-bold text-prexfx-profit tracking-widest">
            CLEAR — TRADING ACTIVE
          </p>
          <p className="text-[9px] text-muted-foreground">
            No red folder events in the next 30 minutes
          </p>
        </div>
      </div>

      {/* Red Folder Events */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={14} className="text-destructive-foreground" />
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
            Red Folder Alerts — Upcoming Events
          </h3>
        </div>

        <div className="space-y-2.5">
          {upcomingEvents.map((evt) => (
            <div
              key={evt.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                evt.impact === "red"
                  ? "bg-destructive/10 border-destructive/20"
                  : evt.impact === "orange"
                  ? "bg-accent/50 border-accent"
                  : "bg-secondary/30 border-border"
              }`}
            >
              <span className="text-lg">{evt.flag}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground font-medium truncate">
                  {evt.currency} — {evt.event}
                </p>
                <p className="text-[9px] text-muted-foreground">{evt.time}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Clock size={10} className="text-muted-foreground" />
                <span className={`text-[10px] font-bold ${evt.impact === "red" ? "text-destructive-foreground" : "text-foreground"}`}>
                  {evt.countdown}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewsScout;
