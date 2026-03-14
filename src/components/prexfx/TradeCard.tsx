interface Trade {
  id: number;
  pair: string;
  direction: "BUY" | "SELL";
  entry: string;
  lot: string;
  sl: string;
  pnl: number;
  status: "active" | "closed";
}

const TradeCard = ({ trade }: { trade: Trade }) => {
  const isProfit = trade.pnl >= 0;

  return (
    <div className="group cursor-pointer p-4 glass-panel glass-panel-hover rounded-lg transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-bold text-foreground">
            {trade.pair}{" "}
            <span className="text-[10px] font-normal px-2 py-0.5 bg-accent rounded text-accent-foreground ml-1">
              {trade.direction}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            LOT: {trade.lot} | SL: {trade.sl}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            ENTRY: {trade.entry}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`text-sm font-light ${
              isProfit ? "text-prexfx-profit profit-glow" : "text-prexfx-loss"
            }`}
          >
            {isProfit ? "+" : ""}${trade.pnl.toFixed(2)}
          </p>
          <div className="mt-2 px-2 py-0.5 rounded bg-accent/50 text-[8px] uppercase tracking-widest text-muted-foreground text-center">
            SHIELD: 0.5%
          </div>
        </div>
      </div>
    </div>
  );
};

export type { Trade };
export default TradeCard;
