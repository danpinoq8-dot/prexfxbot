const EquityPanel = () => {
  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Portfolio Equity
      </p>
      <div className="flex items-baseline gap-4 flex-wrap">
        <h2 className="text-4xl md:text-5xl font-extralight tracking-tighter text-foreground">
          $1,000.00
        </h2>
        <span className="text-xs text-muted-foreground">+0.50% (SAFE)</span>
      </div>
      <div className="mt-6 md:mt-8 h-40 md:h-48 w-full bg-secondary/30 rounded-lg border border-border flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground italic">
          REAL-TIME ARCHITECTURAL CHART FEED...
        </span>
      </div>
    </div>
  );
};

export default EquityPanel;
