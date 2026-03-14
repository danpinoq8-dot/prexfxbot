interface SentimentGaugeProps {
  /** 0 = VOLATILE, 50 = NEUTRAL, 100 = OPTIMAL */
  value: number;
}

const SentimentGauge = ({ value }: SentimentGaugeProps) => {
  const angle = -90 + (value / 100) * 180;
  const label = value < 33 ? "VOLATILE" : value < 66 ? "NEUTRAL" : "OPTIMAL";
  const labelColor =
    value < 33 ? "text-prexfx-silver-dim" : value < 66 ? "text-foreground" : "text-prexfx-profit profit-glow";

  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col items-center gap-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        AI Sentiment
      </p>
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Arc background */}
        <div className="absolute inset-0 border-[3px] border-prexfx-silver-dim rounded-t-full border-b-0" />
        {/* Needle */}
        <div
          className="absolute bottom-0 left-1/2 w-0.5 h-14 bg-prexfx-silver origin-bottom transition-transform duration-1000 ease-out"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        >
          <div className="w-2 h-2 rounded-full bg-prexfx-silver-bright -translate-x-[3px] -translate-y-0.5 shadow-[0_0_8px_hsl(0_0%_85%)]" />
        </div>
      </div>
      <div className="flex justify-between w-full text-[8px] uppercase tracking-widest text-muted-foreground">
        <span>Volatile</span>
        <span>Neutral</span>
        <span>Optimal</span>
      </div>
      <p className={`text-xs font-bold tracking-widest ${labelColor}`}>{label}</p>
    </div>
  );
};

export default SentimentGauge;
