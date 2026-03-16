import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Forex pairs mapped to Finnhub symbols
const PAIR_MAP: Record<string, { finnhub: string; deriv: string; display: string }> = {
  "XAUUSD": { finnhub: "OANDA:XAU_USD", deriv: "frxXAUUSD", display: "XAU/USD" },
  "EURUSD": { finnhub: "OANDA:EUR_USD", deriv: "frxEURUSD", display: "EUR/USD" },
  "GBPUSD": { finnhub: "OANDA:GBP_USD", deriv: "frxGBPUSD", display: "GBP/USD" },
  "GBPJPY": { finnhub: "OANDA:GBP_JPY", deriv: "frxGBPJPY", display: "GBP/JPY" },
  "USDJPY": { finnhub: "OANDA:USD_JPY", deriv: "frxUSDJPY", display: "USD/JPY" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const DERIV_APP_ID = Deno.env.get("DERIV_APP_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!DERIV_APP_ID) throw new Error("DERIV_APP_ID not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check if bot is active
    const { data: config } = await supabase
      .from("bot_config")
      .select("*")
      .limit(1)
      .single();

    if (!config?.is_active) {
      return new Response(JSON.stringify({ status: "bot_inactive", message: "Bot is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. SCOUT: Fetch market data from Finnhub
    const scoutData: Record<string, any> = {};
    for (const [key, pair] of Object.entries(PAIR_MAP)) {
      try {
        const quoteRes = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${pair.finnhub}&token=${FINNHUB_API_KEY}`
        );
        const quote = await quoteRes.json();
        scoutData[key] = { ...quote, display: pair.display };
      } catch (e) {
        console.error(`Failed to fetch ${key}:`, e);
        scoutData[key] = { error: true, display: pair.display };
      }
    }

    // Fetch general market news
    let newsData: any[] = [];
    try {
      const newsRes = await fetch(
        `https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`
      );
      newsData = await newsRes.json();
      if (Array.isArray(newsData)) newsData = newsData.slice(0, 5);
    } catch (e) {
      console.error("Failed to fetch news:", e);
    }

    // 3. BRAIN: Ask Gemini for trade decision
    const brainPrompt = `You are PREXI Brain, an autonomous forex trading AI. Analyze this data and decide what to trade.

CURRENT MARKET DATA:
${JSON.stringify(scoutData, null, 2)}

RECENT NEWS:
${JSON.stringify(newsData.map((n: any) => ({ headline: n.headline, summary: n.summary })), null, 2)}

ACCOUNT:
- Balance: $${config.balance}
- Max risk per trade: ${config.max_risk_percent}%
- Max stake: $${(config.balance * config.max_risk_percent / 100).toFixed(2)}
- News blackout active: ${config.news_blackout_active}

RULES:
- Never risk more than ${config.max_risk_percent}% per trade
- If news blackout is active, signal HOLD for all pairs
- Only signal BUY or SELL if confidence > 70%

Respond with EXACTLY this JSON format (no markdown, no extra text):
{
  "signals": [
    {
      "pair": "XAU/USD",
      "signal": "buy|sell|hold",
      "confidence": 0-100,
      "reasoning": "brief explanation",
      "entry_target": 0.00,
      "stop_loss": 0.00,
      "take_profit": 0.00
    }
  ],
  "market_summary": "1-2 sentence overview"
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: brainPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway error [${aiResponse.status}]: ${errText}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || "";

    // Parse AI response
    let brainDecision: any;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      brainDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { signals: [], market_summary: "Parse error" };
    } catch {
      brainDecision = { signals: [], market_summary: "Failed to parse AI response" };
    }

    // 4. Store signals and execute trades
    const results: any[] = [];
    for (const signal of (brainDecision.signals || [])) {
      // Store signal
      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: signal.pair,
        signal: signal.signal,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        finnhub_data: scoutData,
        gemini_analysis: aiContent,
        executed: false,
      }).select().single();

      // 5. MATH: Execute via Deriv if signal is actionable
      if (signal.signal !== "hold" && signal.confidence > 70) {
        const stake = Math.min(
          config.balance * config.max_risk_percent / 100,
          config.balance * 0.005 // hard cap at 0.5%
        ).toFixed(2);

        const pairKey = signal.pair.replace("/", "");
        const derivSymbol = PAIR_MAP[pairKey]?.deriv || `frx${pairKey}`;

        // Execute trade via Deriv WebSocket API
        try {
          const tradeResult = await executeDeriv(DERIV_APP_ID, derivSymbol, signal.signal, parseFloat(stake));

          const { data: trade } = await supabase.from("trades").insert({
            pair: signal.pair,
            direction: signal.signal,
            entry_price: tradeResult.entry_price,
            stake: parseFloat(stake),
            status: tradeResult.success ? "open" : "cancelled",
            deriv_contract_id: tradeResult.contract_id,
            signal_reason: signal.reasoning,
          }).select().single();

          // Link signal to trade
          if (savedSignal && trade) {
            await supabase.from("trade_signals").update({
              executed: true,
              trade_id: trade.id,
            }).eq("id", savedSignal.id);
          }

          results.push({ pair: signal.pair, signal: signal.signal, executed: true, trade });
        } catch (e) {
          console.error(`Deriv execution failed for ${signal.pair}:`, e);
          results.push({ pair: signal.pair, signal: signal.signal, executed: false, error: String(e) });
        }
      } else {
        results.push({ pair: signal.pair, signal: signal.signal, executed: false, reason: "hold or low confidence" });
      }
    }

    // Update last scan timestamp
    await supabase.from("bot_config").update({
      last_scan_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    return new Response(JSON.stringify({
      status: "scan_complete",
      market_summary: brainDecision.market_summary,
      results,
      scanned_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("trade-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Execute trade on Deriv demo account via WebSocket
async function executeDeriv(appId: string, symbol: string, direction: string, stake: number): Promise<{
  success: boolean;
  contract_id?: string;
  entry_price?: number;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
    let timeout: ReturnType<typeof setTimeout>;

    ws.onopen = () => {
      // Buy a contract
      ws.send(JSON.stringify({
        buy: 1,
        subscribe: 0,
        price: stake,
        parameters: {
          amount: stake,
          basis: "stake",
          contract_type: direction === "buy" ? "CALL" : "PUT",
          currency: "USD",
          duration: 5,
          duration_unit: "m",
          symbol: symbol,
        },
      }));

      timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Deriv timeout"));
      }, 15000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      clearTimeout(timeout);

      if (data.error) {
        ws.close();
        reject(new Error(`Deriv error: ${data.error.message}`));
        return;
      }

      if (data.buy) {
        ws.close();
        resolve({
          success: true,
          contract_id: data.buy.contract_id?.toString(),
          entry_price: data.buy.buy_price,
        });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err}`));
    };
  });
}
