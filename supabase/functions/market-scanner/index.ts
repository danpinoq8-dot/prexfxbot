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
    // Fetch forex rates using Finnhub forex/rates endpoint
    let forexRates: Record<string, number> = {};
    try {
      const ratesRes = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_API_KEY}`);
      const ratesData = await ratesRes.json();
      if (ratesData.quote) forexRates = ratesData.quote;
    } catch (e) {
      console.error("Forex rates fetch failed:", e);
    }

    const quotes = PAIRS.map((pair) => {
      const [base, quote] = pair.display.split("/");
      let price = "—";
      let change = "0.00";

      if (base === "XAU" && forexRates["XAU"]) {
        // Gold: XAU rate is per oz in USD
        const rate = 1 / forexRates["XAU"];
        price = rate.toFixed(2);
      } else if (base === "USD" && forexRates[quote]) {
        price = forexRates[quote].toFixed(4);
      } else if (forexRates[base] && forexRates[quote]) {
        const cross = forexRates[quote] / forexRates[base];
        price = cross > 100 ? cross.toFixed(3) : cross.toFixed(4);
      }

      return {
        pair: pair.display,
        price,
        change: `+${change}%`, // Finnhub free tier doesn't provide change data on forex
      };
    });

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
