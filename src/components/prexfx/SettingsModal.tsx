import { useState, useEffect } from "react";
import { X, Shield, Eye, EyeOff } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const KEY_STORAGE = "prexfx_api_keys";

interface ApiKeys {
  deriv: string;
  finnhub: string;
  gemini: string;
}

const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const [keys, setKeys] = useState<ApiKeys>({ deriv: "", finnhub: "", gemini: "" });
  const [showKeys, setShowKeys] = useState({ deriv: false, finnhub: false, gemini: false });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (stored) {
      try {
        setKeys(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(KEY_STORAGE, JSON.stringify(keys));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!open) return null;

  const fields: { key: keyof ApiKeys; label: string; placeholder: string }[] = [
    { key: "deriv", label: "Deriv App ID / API Token", placeholder: "Enter your Deriv API token..." },
    { key: "finnhub", label: "Finnhub API Key", placeholder: "Enter your Finnhub API key..." },
    { key: "gemini", label: "Gemini API Key", placeholder: "Enter your Gemini API key..." },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-foreground" />
            <h2 className="text-sm font-bold tracking-widest uppercase text-foreground">
              API Configuration
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground mb-6 leading-relaxed">
          Keys are stored locally on your device. They are used to connect PrexFx to your trading infrastructure.
        </p>

        <div className="space-y-4">
          {fields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                {label}
              </label>
              <div className="relative">
                <input
                  type={showKeys[key] ? "text" : "password"}
                  value={keys[key]}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-prexfx-silver transition-colors font-mono"
                />
                <button
                  onClick={() => setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKeys[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          className="w-full mt-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:bg-prexfx-silver-bright transition-colors"
        >
          {saved ? "✓ Saved" : "Save Configuration"}
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
