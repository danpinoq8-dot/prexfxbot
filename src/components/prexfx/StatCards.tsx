import { Shield, TrendingUp, Activity } from "lucide-react";
import HeartbeatLine from "./HeartbeatLine";

interface StatCardsProps {
  balance: string;
  activeTrades: number;
  dailyROI: string;
}

const StatCards = ({ balance, activeTrades, dailyROI }: StatCardsProps) => {
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
          <TrendingUp size={14} className="text-prexfx-profit" />
          <p className="text-xl md:text-2xl font-extralight tracking-tight text-prexfx-profit profit-glow">{dailyROI}</p>
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
