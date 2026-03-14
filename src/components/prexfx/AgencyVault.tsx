const AgencyVault = () => {
  const months = [
    { label: "Month 1", balance: "$1,000", growth: "—" },
    { label: "Month 2", balance: "$1,105", growth: "+10.5%" },
    { label: "Month 3", balance: "$1,221", growth: "+10.5%" },
    { label: "Month 6", balance: "$1,648", growth: "+34.9%" },
    { label: "Month 12", balance: "$2,716", growth: "+64.8%" },
  ];

  return (
    <div className="glass-panel rounded-2xl p-6">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Agency Vault — 0.5% Compounding Projection
      </p>
      <div className="space-y-2">
        {months.map((m) => (
          <div key={m.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-[10px] text-muted-foreground">{m.label}</span>
            <span className="text-sm font-light text-foreground">{m.balance}</span>
            <span className="text-[10px] text-prexfx-profit">{m.growth}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgencyVault;
