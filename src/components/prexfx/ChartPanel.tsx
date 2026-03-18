import { useState, useEffect } from "react";

const OANDA_INSTRUMENTS = ["XAU_USD", "EUR_USD", "GBP_USD", "GBP_JPY", "USD_JPY"];
const DISPLAY_MAP: Record<string, string> = {
  XAU_USD: "XAU/USD", EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", GBP_JPY: "GBP/JPY", USD_JPY: "USD/JPY",
};

interface Candle {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

const SCANNER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-candles`;

const ChartPanel = () => {
  const [selectedPair, setSelectedPair] = useState("XAU_USD");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCandles = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${SCANNER_URL}?instrument=${selectedPair}&granularity=H1&count=48`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const data = await res.json();
        if (data.candles) setCandles(data.candles);
      } catch (e) {
        console.error("Candle fetch failed:", e);
      }
      setLoading(false);
    };
    fetchCandles();
    const interval = setInterval(fetchCandles, 60000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  // Simple candlestick rendering
  const renderChart = () => {
    if (candles.length === 0) return null;
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const range = maxPrice - minPrice || 1;
    const chartH = 260;
    const barW = Math.max(2, Math.floor(320 / candles.length) - 1);

    const toY = (price: number) => chartH - ((price - minPrice) / range) * chartH;

    return (
      <svg viewBox={`0 0 ${candles.length * (barW + 1)} ${chartH}`} className="w-full h-full" preserveAspectRatio="none">
        {candles.map((c, i) => {
          const x = i * (barW + 1);
          const isBull = c.c >= c.o;
          const bodyTop = toY(Math.max(c.o, c.c));
          const bodyBot = toY(Math.min(c.o, c.c));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i}>
              <line
                x1={x + barW / 2} x2={x + barW / 2}
                y1={toY(c.h)} y2={toY(c.l)}
                stroke={isBull ? "hsl(0 0% 85%)" : "hsl(0 0% 30%)"}
                strokeWidth={1}
              />
              <rect
                x={x} y={bodyTop}
                width={barW} height={bodyH}
                fill={isBull ? "hsl(0 0% 85%)" : "hsl(0 0% 30%)"}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  const lastCandle = candles[candles.length - 1];

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-prexfx-silver font-mono"
          >
            {OANDA_INSTRUMENTS.map((p) => (
              <option key={p} value={p}>{DISPLAY_MAP[p]}</option>
            ))}
          </select>
          {lastCandle && (
            <span className="text-xs text-foreground font-semibold">
              {lastCandle.c.toFixed(lastCandle.c > 100 ? 2 : 5)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[200px] md:min-h-[300px] bg-secondary/20 rounded-lg border border-border flex items-center justify-center p-2">
        {loading ? (
          <p className="text-[10px] text-muted-foreground animate-pulse">Loading OANDA candles...</p>
        ) : candles.length > 0 ? (
          renderChart()
        ) : (
          <p className="text-[10px] text-muted-foreground italic">No candle data available — market may be closed</p>
        )}
      </div>
    </div>
  );
};

export default ChartPanel;
