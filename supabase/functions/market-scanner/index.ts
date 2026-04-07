import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";

const PAIRS = [
  { instrument: "XAU_USD", display: "XAU/USD" },
  { instrument: "EUR_USD", display: "EUR/USD" },
  { instrument: "GBP_USD", display: "GBP/USD" },
  { instrument: "GBP_JPY", display: "GBP/JPY" },
  { instrument: "USD_JPY", display: "USD/JPY" },
  { instrument: "AUD_USD", display: "AUD/USD" },
  { instrument: "NZD_USD", display: "NZD/USD" },
  { instrument: "USD_CAD", display: "USD/CAD" },
  { instrument: "USD_CHF", display: "USD/CHF" },
  { instrument: "EUR_GBP", display: "EUR/GBP" },
  { instrument: "EUR_JPY", display: "EUR/JPY" },
  { instrument: "EUR_AUD", display: "EUR/AUD" },
  { instrument: "GBP_AUD", display: "GBP/AUD" },
  { instrument: "AUD_JPY", display: "AUD/JPY" },
  { instrument: "CAD_JPY", display: "CAD/JPY" },
  { instrument: "NZD_JPY", display: "NZD/JPY" },
  { instrument: "GBP_CAD", display: "GBP/CAD" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN");
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID");
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

    if (!OANDA_API_TOKEN || !OANDA_ACCOUNT_ID) throw new Error("OANDA credentials not configured");

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode"); // "candles" or default (prices)

    // CANDLES MODE
    if (mode === "candles") {
      const instrument = url.searchParams.get("instrument") || "XAU_USD";
      const granularity = url.searchParams.get("granularity") || "H1";
      const count = url.searchParams.get("count") || "48";

      const candleRes = await fetch(
        `${OANDA_API}/v3/instruments/${instrument}/candles?count=${count}&granularity=${granularity}&price=M`,
        { headers: { Authorization: `Bearer ${OANDA_API_TOKEN}` } }
      );

      if (!candleRes.ok) {
        const errText = await candleRes.text();
        throw new Error(`OANDA candle error [${candleRes.status}]: ${errText}`);
      }

      const data = await candleRes.json();
      const candles = (data.candles || []).map((c: any) => ({
        time: c.time,
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
        volume: c.volume,
        complete: c.complete,
      }));

      return new Response(JSON.stringify({ candles, instrument, granularity }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DEFAULT: PRICES MODE
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

    const quotes = await Promise.all(
      PAIRS.map(async (pair) => {
        const priceEntry = pricingData.prices?.find((p: any) => p.instrument === pair.instrument);
        if (!priceEntry) return { pair: pair.display, price: "—", change: "0.00%" };

        const bid = parseFloat(priceEntry.bids?.[0]?.price || "0");
        const ask = parseFloat(priceEntry.asks?.[0]?.price || "0");
        const mid = (bid + ask) / 2;
        const isLarge = mid > 100;
        const decimals = isLarge ? 2 : (mid < 10 ? 5 : 4);

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
        } catch { /* skip */ }

        return { pair: pair.display, price: mid.toFixed(decimals), change };
      })
    );

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
