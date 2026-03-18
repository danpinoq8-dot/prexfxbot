import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN");
    if (!OANDA_API_TOKEN) throw new Error("OANDA_API_TOKEN not configured");

    const url = new URL(req.url);
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
  } catch (e) {
    console.error("oanda-candles error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
