import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface AuditEntry {
  id: number;
  timestamp: string;
  reasoning: string;
  approved: boolean;
}

const mockAudit: AuditEntry[] = [
  { id: 104, timestamp: "14:32 UTC", reasoning: "US NFP data was priced in; low risk of stop-hunt.", approved: true },
  { id: 103, timestamp: "11:15 UTC", reasoning: "ECB rate decision pending. DANGER — hibernating 30 min.", approved: false },
  { id: 102, timestamp: "09:42 UTC", reasoning: "GBP CPI below expectations. Clean architectural setup on GBPUSD.", approved: true },
  { id: 101, timestamp: "06:20 UTC", reasoning: "Asian session low volatility. No clear structure.", approved: false },
];

const AuditTrail = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Audit Trail — Gemini Logic</span>
        <ChevronRight
          size={14}
          className={`transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 max-h-64 overflow-y-auto">
          {mockAudit.map((entry) => (
            <div key={entry.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-foreground">Trade #{entry.id}</span>
                <span
                  className={`text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    entry.approved
                      ? "bg-prexfx-profit/10 text-prexfx-profit"
                      : "bg-prexfx-loss/20 text-prexfx-loss"
                  }`}
                >
                  {entry.approved ? "Approved" : "Blocked"}
                </span>
                <span className="text-[9px] text-muted-foreground ml-auto">{entry.timestamp}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                "{entry.reasoning}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
