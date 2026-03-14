const tickerData = [
  { pair: "EUR/USD", price: "1.0842", change: "+0.12%" },
  { pair: "GBP/JPY", price: "191.340", change: "-0.08%" },
  { pair: "XAU/USD", price: "2,341.50", change: "+0.34%" },
  { pair: "USD/JPY", price: "157.220", change: "+0.05%" },
  { pair: "GBP/USD", price: "1.2714", change: "-0.03%" },
  { pair: "AUD/USD", price: "0.6621", change: "+0.11%" },
];

const PriceTicker = () => {
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
