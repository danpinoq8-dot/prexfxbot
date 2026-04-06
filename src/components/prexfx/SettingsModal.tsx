import { useState, useEffect } from "react";
import { X, Shield, Wifi, WifiOff } from "lucide-react";
import { appwrite } from "@/lib/appwrite";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const [config, setConfig] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "error">("checking");

  useEffect(() => {
    if (!open) return;
    const fetchConfig = async () => {
      const data = await appwrite.getDocument("bot_config", "default");
      if (data) setConfig(data);
    };
    fetchConfig();

    // Test OANDA connection via market-scanner
    setConnectionStatus("checking");
    fetch("/api/scanner", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({mode: "prices"}),    })
      .then(res => {
        if (res.ok) setConnectionStatus("connected");
        else setConnectionStatus("error");
      })
      .catch(() => setConnectionStatus("error"));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-foreground" />
            <h2 className="text-sm font-bold tracking-widest uppercase text-foreground">
              System Status
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* OANDA Connection */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              {connectionStatus === "connected" ? (
                <Wifi size={14} className="text-prexfx-profit" />
              ) : connectionStatus === "error" ? (
                <WifiOff size={14} className="text-prexfx-loss" />
              ) : (
                <Wifi size={14} className="text-muted-foreground animate-pulse" />
              )}
              <span className="text-[10px] uppercase tracking-widest text-foreground font-bold">
                OANDA Broker
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {connectionStatus === "connected"
                ? "Connected — Live pricing and execution active"
                : connectionStatus === "error"
                ? "Connection failed — Check OANDA credentials"
                : "Checking connection..."}
            </p>
          </div>

          {config && (
            <>
              <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Account</p>
                <p className="text-lg font-extralight text-foreground">
                  ${Number(config.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Risk Settings</p>
                <p className="text-xs text-foreground">Max risk per trade: {config.max_risk_percent}%</p>
                <p className="text-xs text-foreground mt-1">Bot: {config.is_active ? "🟢 Active" : "🔴 Inactive"}</p>
                <p className="text-xs text-foreground mt-1">News Blackout: {config.news_blackout_active ? "Active" : "Clear"}</p>
              </div>

              <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Watched Pairs</p>
                <div className="flex flex-wrap gap-1.5">
                  {(config.pairs_watched || []).map((p: string) => (
                    <span key={p} className="text-[9px] px-2 py-1 rounded bg-accent text-accent-foreground">
                      {p.replace("_", "/")}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-[9px] text-muted-foreground mt-4 text-center">
          API keys are securely stored on the server — not in your browser
        </p>
      </div>
    </div>
  );
};

export default SettingsModal;
