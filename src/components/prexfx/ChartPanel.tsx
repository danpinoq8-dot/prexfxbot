import { useState, useEffect } from "react";

const OANDA_INSTRUMENTS = [
  "XAU_USD", "EUR_USD", "GBP_USD", "GBP_JPY", "USD_JPY",
  "AUD_USD", "NZD_USD", "USD_CAD", "USD_CHF",
  "EUR_GBP", "EUR_JPY", "EUR_AUD", "GBP_AUD",
  "AUD_JPY", "CAD_JPY", "NZD_JPY", "GBP_CAD",
];
const DISPLAY_MAP: Record<string, string> = {
  XAU_USD: "XAU/USD", EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", GBP_JPY: "GBP/JPY", USD_JPY: "USD/JPY",
  AUD_USD: "AUD/USD", NZD_USD: "NZD/USD", USD_CAD: "USD/CAD", USD_CHF: "USD/CHF",
  EUR_GBP: "EUR/GBP", EUR_JPY: "EUR/JPY", EUR_AUD: "EUR/AUD", GBP_AUD: "GBP/AUD",
  AUD_JPY: "AUD/JPY", CAD_JPY: "CAD/JPY", NZD_JPY: "NZD/JPY", GBP_CAD: "GBP/CAD",
};

interface Candle { time: string; o: number; h: number; l: number; c: number; }

const SCANNER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`;

const ChartPanel = () => {
  const [selectedPair, setSelectedPair] = useState("XAU_USD");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevClose, setPrevClose] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState("H1");

  useEffect(() => {
    let active = true;
    const fetchCandles = async () => {
      try {
        const res = await fetch(
          `${SCANNER_URL}?mode=candles&instrument=${selectedPair}&granularity=${timeframe}&count=60`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        const data = await res.json();
        if (active && data.candles) {
          setCandles(data.candles);
          if (data.candles.length >= 2) setPrevClose(data.candles[data.candles.length - 2].c);
          setLoading(false);
        }
      } catch (e) {
        console.error("Candle fetch failed:", e);
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    fetchCandles();
    const interval = setInterval(fetchCandles, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [selectedPair, timeframe]);

  const lastCandle = candles[candles.length - 1];
  const priceChange = lastCandle && prevClose ? lastCandle.c - prevClose : 0;
  const pricePct = prevClose ? ((priceChange / prevClose) * 100).toFixed(3) : "0.000";
  const isUp = priceChange >= 0;

  const renderChart = () => {
    if (candles.length === 0) return null;
    const highs = candles.map(c => c.h);
    const lows = candles.map(c => c.l);
    const maxPrice = Math.max(...highs);
    const minPrice = Math.min(...lows);
    const range = maxPrice - minPrice || 1;
    const chartH = 280;
    const chartW = candles.length * 6;
    const barW = 4;
    const toY = (price: number) => chartH - ((price - minPrice) / range) * (chartH - 20) - 10;
    const levels = 5;
    const step = range / levels;
    const decimals = maxPrice > 100 ? 2 : maxPrice > 10 ? 4 : 5;

    return (
      <svg viewBox={`0 0 ${chartW} ${chartH + 20}`} className="w-full h-full" preserveAspectRatio="none">
        {Array.from({ length: levels + 1 }, (_, i) => {
          const price = minPrice + step * i;
          const y = toY(price);
          return (
            <g key={`grid-${i}`}>
              <line x1={0} x2={chartW} y1={y} y2={y} stroke="hsl(0 0% 20%)" strokeWidth={0.5} strokeDasharray="4 4" />
              <text x={2} y={y - 3} fill="hsl(0 0% 40%)" fontSize={8} fontFamily="monospace">{price.toFixed(decimals)}</text>
            </g>
          );
        })}
        {candles.map((c, i) => {
          const x = i * 6;
          const isBull = c.c >= c.o;
          const bodyTop = toY(Math.max(c.o, c.c));
          const bodyBot = toY(Math.min(c.o, c.c));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i}>
              <line x1={x + barW / 2} x2={x + barW / 2} y1={toY(c.h)} y2={toY(c.l)}
                stroke={isBull ? "hsl(145 60% 50%)" : "hsl(0 70% 55%)"} strokeWidth={1} />
              <rect x={x} y={bodyTop} width={barW} height={bodyH}
                fill={isBull ? "hsl(145 60% 50%)" : "hsl(0 70% 55%)"} rx={0.5} />
            </g>
          );
        })}
        {lastCandle && (
          <>
            <line x1={0} x2={chartW} y1={toY(lastCandle.c)} y2={toY(lastCandle.c)}
              stroke={isUp ? "hsl(145 70% 55%)" : "hsl(0 70% 55%)"} strokeWidth={0.8} strokeDasharray="3 2" />
            <rect x={chartW - 55} y={toY(lastCandle.c) - 8} width={55} height={16} rx={3}
              fill={isUp ? "hsl(145 70% 40%)" : "hsl(0 70% 40%)"} />
            <text x={chartW - 52} y={toY(lastCandle.c) + 4} fill="white" fontSize={9} fontFamily="monospace" fontWeight="bold">
              {lastCandle.c.toFixed(decimals)}
            </text>
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <select value={selectedPair} onChange={(e) => setSelectedPair(e.target.value)}
            className="bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-prexfx-silver font-mono">
            {OANDA_INSTRUMENTS.map((p) => <option key={p} value={p}>{DISPLAY_MAP[p]}</option>)}
          </select>
          {lastCandle && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground font-bold font-mono">{lastCandle.c.toFixed(lastCandle.c > 100 ? 2 : 5)}</span>
              <span className={`text-[10px] font-mono ${isUp ? "text-prexfx-profit" : "text-prexfx-loss"}`}>
                {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{pricePct}%
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {["M15", "H1", "H4", "D"].map((tf) => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-2 py-1 rounded text-[9px] font-mono transition-colors ${timeframe === tf ? "bg-accent text-accent-foreground" : "bg-secondary/30 text-muted-foreground hover:text-foreground"}`}>
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-[220px] md:min-h-[320px] bg-secondary/20 rounded-lg border border-border flex items-center justify-center p-1 overflow-hidden">
        {loading ? (
          <p className="text-[10px] text-muted-foreground animate-pulse">Loading OANDA candles...</p>
        ) : candles.length > 0 ? renderChart() : (
          <p className="text-[10px] text-muted-foreground italic">No candle data — market may be closed</p>
        )}
      </div>
    </div>
  );
};

export default ChartPanel;
