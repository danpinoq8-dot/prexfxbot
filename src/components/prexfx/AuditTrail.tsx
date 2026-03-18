import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const AuditTrail = () => {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("trade_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setSignals(data);
    };
    fetch();

    const channel = supabase
      .channel("audit-signals")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_signals" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Audit Trail — AI Logic</span>
        <ChevronRight
          size={14}
          className={`transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 max-h-64 overflow-y-auto">
          {signals.length === 0 && (
            <p className="text-[9px] text-muted-foreground italic">No audit entries yet</p>
          )}
          {signals.map((s) => (
            <div key={s.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-foreground">
                  {s.pair} {s.signal.toUpperCase()}
                </span>
                <span
                  className={`text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    s.executed
                      ? "bg-prexfx-profit/10 text-prexfx-profit"
                      : "bg-prexfx-loss/20 text-prexfx-loss"
                  }`}
                >
                  {s.executed ? "Executed" : s.signal === "hold" ? "Hold" : "Skipped"}
                </span>
                <span className="text-[8px] text-muted-foreground">{s.confidence}%</span>
                <span className="text-[9px] text-muted-foreground ml-auto">
                  {new Date(s.created_at).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                "{s.reasoning || "No reasoning provided"}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
