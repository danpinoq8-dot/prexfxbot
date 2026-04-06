import { useState, useEffect } from "react";
import SentimentGauge from "@/components/prexfx/SentimentGauge";
import { AlertTriangle, Clock, Shield, RefreshCw, ExternalLink } from "lucide-react";

const SCANNER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`;

const NewsScout = () => {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch(SCANNER_URL, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const data = await res.json();
      if (data.news && Array.isArray(data.news)) setNews(data.news);
      setLastFetch(data.fetched_at || new Date().toISOString());
    } catch (e) {
      console.error("News fetch failed:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 120000);
    return () => clearInterval(interval);
  }, []);

  const timeSince = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const bullishWords = ["rally", "surge", "gain", "rise", "bullish", "growth", "strong", "high", "up"];
  const bearishWords = ["fall", "drop", "crash", "decline", "bearish", "weak", "low", "down", "loss"];
  let bullCount = 0, bearCount = 0;
  news.forEach(n => {
    const h = (n.headline || "").toLowerCase();
    bullishWords.forEach(w => { if (h.includes(w)) bullCount++; });
    bearishWords.forEach(w => { if (h.includes(w)) bearCount++; });
  });
  const total = bullCount + bearCount || 1;
  const sentimentValue = Math.round((bullCount / total) * 100);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">News Scout — Live Forex News</h2>
        <button onClick={fetchNews} disabled={loading} className="flex items-center gap-1.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          {lastFetch ? `Updated ${new Date(lastFetch).toLocaleTimeString()}` : "Refresh"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <SentimentGauge value={sentimentValue} />
        <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center gap-3">
          <Shield size={24} className={sentimentValue > 30 && sentimentValue < 70 ? "text-prexfx-profit" : "text-destructive-foreground"} />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Market Sentiment</p>
          <p className={`text-sm font-bold tracking-widest ${sentimentValue >= 50 ? "text-prexfx-profit" : "text-prexfx-loss"}`}>
            {sentimentValue >= 60 ? "BULLISH" : sentimentValue <= 40 ? "BEARISH" : "NEUTRAL"}
          </p>
          <p className="text-[9px] text-muted-foreground text-center">Based on {news.length} live Finnhub headlines</p>
        </div>
      </div>
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={14} className="text-muted-foreground" />
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Live News Feed — Finnhub</h3>
        </div>
        <div className="space-y-2.5">
          {loading && news.length === 0 && <p className="text-[9px] text-muted-foreground animate-pulse">Fetching live news from Finnhub...</p>}
          {!loading && news.length === 0 && <p className="text-[9px] text-muted-foreground italic">No news available</p>}
          {news.map((n, i) => (
            <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border hover:bg-secondary/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground font-medium leading-relaxed">{n.headline}</p>
                {n.summary && <p className="text-[9px] text-muted-foreground mt-1 line-clamp-2">{n.summary}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[8px] text-muted-foreground">{n.source}</span>
                  {n.datetime && (
                    <span className="text-[8px] text-muted-foreground flex items-center gap-1">
                      <Clock size={8} />{timeSince(n.datetime)}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink size={10} className="text-muted-foreground shrink-0 mt-1" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewsScout;
