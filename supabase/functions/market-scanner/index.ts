import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";

const PAIRS = [
  { instrument: "EUR_USD", display: "EUR/USD" },
  { instrument: "GBP_JPY", display: "GBP/JPY" },
  { instrument: "XAU_USD", display: "XAU/USD" },
  { instrument: "USD_JPY", display: "USD/JPY" },
  { instrument: "GBP_USD", display: "GBP/USD" },
  { instrument: "AUD_USD", display: "AUD/USD" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN");
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID");
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

    if (!OANDA_API_TOKEN || !OANDA_ACCOUNT_ID) throw new Error("OANDA credentials not configured");

    // Fetch live prices from OANDA
    const instruments = PAIRS.map(p => p.instrument).join(",");
    const pricingRes = await fetch(
      `${OANDA_API}/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`,
      { headers: { Authorization: `Bearer ${OANDA_API_TOKEN}` } }
    );

    if (!pricingRes.ok) {
      const errText = await pricingRes.text();
      throw new Error(`OANDA pricing error [${pricingRes.status}]: ${errText}`);
    }

    const pricingData = await pricingRes.json();

    // Also fetch candles for daily change calculation
    const quotes = await Promise.all(
      PAIRS.map(async (pair) => {
        const priceEntry = pricingData.prices?.find((p: any) => p.instrument === pair.instrument);
        if (!priceEntry) return { pair: pair.display, price: "—", change: "0.00%" };

        const bid = parseFloat(priceEntry.bids?.[0]?.price || "0");
        const ask = parseFloat(priceEntry.asks?.[0]?.price || "0");
        const mid = (bid + ask) / 2;
        const isLarge = mid > 100;
        const decimals = isLarge ? 2 : (mid < 10 ? 5 : 4);

        // Get daily change from candles
        let change = "0.00%";
        try {
          const candleRes = await fetch(
            `${OANDA_API}/v3/instruments/${pair.instrument}/candles?count=2&granularity=D&price=M`,
            { headers: { Authorization: `Bearer ${OANDA_API_TOKEN}` } }
          );
          if (candleRes.ok) {
            const candleData = await candleRes.json();
            const candles = candleData.candles || [];
            if (candles.length >= 2) {
              const prevClose = parseFloat(candles[candles.length - 2].mid.c);
              const pct = ((mid - prevClose) / prevClose * 100).toFixed(2);
              change = parseFloat(pct) >= 0 ? `+${pct}%` : `${pct}%`;
            }
          }
        } catch { /* skip change calc */ }

        return {
          pair: pair.display,
          price: mid.toFixed(decimals),
          change,
        };
      })
    );

    // Fetch forex news from Finnhub
    let news: any[] = [];
    if (FINNHUB_API_KEY) {
      try {
        const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`);
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
      } catch (e) { console.error("News fetch failed:", e); }
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
