import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAIRS = [
  { deriv: "frxEURUSD", display: "EUR/USD" },
  { deriv: "frxGBPJPY", display: "GBP/JPY" },
  { deriv: "frxXAUUSD", display: "XAU/USD" },
  { deriv: "frxUSDJPY", display: "USD/JPY" },
  { deriv: "frxGBPUSD", display: "GBP/USD" },
  { deriv: "frxAUDUSD", display: "AUD/USD" },
];

// Get a single tick from Deriv WebSocket
function getDerivTick(appId: string, symbol: string): Promise<{ price: number; change: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ ticks: symbol }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      clearTimeout(timeout);
      ws.close();

      if (data.error) {
        reject(new Error(data.error.message));
        return;
      }

      if (data.tick) {
        resolve({
          price: data.tick.quote,
          change: "+0.00%", // single tick, no previous close available
        });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("ws error"));
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const DERIV_APP_ID = Deno.env.get("DERIV_APP_ID");
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    if (!DERIV_APP_ID) throw new Error("DERIV_APP_ID not configured");

    // Fetch live prices from Deriv
    const quotes = await Promise.all(
      PAIRS.map(async (pair) => {
        try {
          const tick = await getDerivTick(DERIV_APP_ID, pair.deriv);
          const isLarge = tick.price > 100;
          return {
            pair: pair.display,
            price: isLarge ? tick.price.toFixed(2) : tick.price.toFixed(tick.price < 10 ? 5 : 4),
            change: tick.change,
          };
        } catch (e) {
          console.error(`Failed ${pair.display}:`, e);
          return { pair: pair.display, price: "—", change: "0.00%" };
        }
      })
    );

    // Fetch forex news from Finnhub (this works on free tier)
    let news: any[] = [];
    if (FINNHUB_API_KEY) {
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
          }));
        }
      } catch (e) {
        console.error("News fetch failed:", e);
      }
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
