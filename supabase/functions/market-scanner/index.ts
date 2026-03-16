import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAIRS = [
  { symbol: "EUR/USD", forex: true, display: "EUR/USD" },
  { symbol: "GBP/JPY", forex: true, display: "GBP/JPY" },
  { symbol: "XAU/USD", forex: true, display: "XAU/USD" },
  { symbol: "USD/JPY", forex: true, display: "USD/JPY" },
  { symbol: "GBP/USD", forex: true, display: "GBP/USD" },
  { symbol: "AUD/USD", forex: true, display: "AUD/USD" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    if (!FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY not configured");

    // Fetch quotes for all pairs
    const quotes = await Promise.all(
      PAIRS.map(async (pair) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${pair.symbol}&token=${FINNHUB_API_KEY}`
          );
          const data = await res.json();
          const change = data.c && data.pc ? ((data.c - data.pc) / data.pc * 100).toFixed(2) : "0.00";
          return {
            pair: pair.display,
            price: data.c?.toFixed(data.c > 100 ? 2 : 4) || "—",
            change: parseFloat(change) >= 0 ? `+${change}%` : `${change}%`,
            raw: data,
          };
        } catch {
          return { pair: pair.display, price: "—", change: "0.00%", raw: null };
        }
      })
    );

    // Fetch forex news
    let news: any[] = [];
    try {
      const newsRes = await fetch(
        `https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`
      );
      const newsData = await newsRes.json();
      if (Array.isArray(newsData)) {
        news = newsData.slice(0, 10).map((n: any) => ({
          headline: n.headline,
          summary: n.summary,
          source: n.source,
          url: n.url,
          datetime: n.datetime,
          image: n.image,
        }));
      }
    } catch (e) {
      console.error("News fetch failed:", e);
    }

    return new Response(JSON.stringify({ quotes, news, fetched_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-scanner error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
