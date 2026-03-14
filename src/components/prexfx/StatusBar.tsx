import HeartbeatLine from "./HeartbeatLine";
import { Settings } from "lucide-react";

interface StatusBarProps {
  scoutActive: boolean;
  brainActive: boolean;
  onSettingsClick: () => void;
}

const StatusBar = ({ scoutActive, brainActive, onSettingsClick }: StatusBarProps) => {
  return (
    <nav className="p-4 md:p-6 border-b border-border flex justify-between items-center glass-panel sticky top-0 z-50">
      <div className="tracking-[0.3em] text-lg md:text-xl font-black italic text-primary">
        PREXFX
      </div>
      <div className="flex items-center gap-4 md:gap-6">
        <div className="flex gap-4 text-[10px] uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <HeartbeatLine active={scoutActive} />
            <span className="hidden sm:inline">SCOUT</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full transition-all duration-700 ${
                brainActive
                  ? "bg-prexfx-silver shadow-[0_0_8px_hsl(0_0%_75%)] animate-pulse-glow"
                  : "bg-prexfx-silver-dim"
              }`}
            />
            <span className="hidden sm:inline">BRAIN</span>
          </div>
        </div>
        <button
          onClick={onSettingsClick}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </nav>
  );
};

export default StatusBar;
