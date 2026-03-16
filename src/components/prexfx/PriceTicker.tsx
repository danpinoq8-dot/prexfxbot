import { useState, useEffect } from "react";

interface TickerItem {
  pair: string;
  price: string;
  change: string;
}

const SCANNER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`;

const PriceTicker = () => {
  const [tickerData, setTickerData] = useState<TickerItem[]>([
    { pair: "EUR/USD", price: "—", change: "0.00%" },
    { pair: "GBP/JPY", price: "—", change: "0.00%" },
    { pair: "XAU/USD", price: "—", change: "0.00%" },
    { pair: "USD/JPY", price: "—", change: "0.00%" },
    { pair: "GBP/USD", price: "—", change: "0.00%" },
    { pair: "AUD/USD", price: "—", change: "0.00%" },
  ]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(SCANNER_URL, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const data = await res.json();
        if (data.quotes) setTickerData(data.quotes);
      } catch (e) {
        console.error("Ticker fetch failed:", e);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const items = [...tickerData, ...tickerData];

  return (
    <div className="w-full overflow-hidden border-b border-border bg-secondary/50">
      <div className="animate-ticker flex whitespace-nowrap py-2">
        {items.map((item, i) => (
          <span key={i} className="mx-6 text-[10px] uppercase tracking-wider">
            <span className="text-muted-foreground">{item.pair}</span>
            <span className="text-foreground ml-2 font-semibold">{item.price}</span>
            <span
              className={`ml-2 ${
                item.change.startsWith("+") ? "text-prexfx-profit" : "text-prexfx-loss"
              }`}
            >
              {item.change}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default PriceTicker;
