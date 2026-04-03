import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";

const INSTRUMENTS: Record<string, string> = {
  "XAU_USD": "XAU/USD",
  "EUR_USD": "EUR/USD",
  "GBP_USD": "GBP/USD",
  "GBP_JPY": "GBP/JPY",
  "USD_JPY": "USD/JPY",
};

async function oandaFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${OANDA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OANDA ${path} [${res.status}]: ${text}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN");
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OANDA_API_TOKEN) throw new Error("OANDA_API_TOKEN not configured");
    if (!OANDA_ACCOUNT_ID) throw new Error("OANDA_ACCOUNT_ID not configured");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
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

    // 2. SYNC: Get OANDA account summary and update balance
    const accountData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/summary`, OANDA_API_TOKEN);
    const account = accountData.account;
    const realBalance = parseFloat(account.balance);
    const realPnl = parseFloat(account.unrealizedPL || "0") + parseFloat(account.pl || "0");

    await supabase.from("bot_config").update({
      balance: realBalance,
      daily_pnl: realPnl,
      updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    // 3. SCOUT: Get live prices from OANDA
    const instruments = Object.keys(INSTRUMENTS).join(",");
    const pricingData = await oandaFetch(
      `/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`,
      OANDA_API_TOKEN
    );

    const scoutData: Record<string, any> = {};
    for (const price of (pricingData.prices || [])) {
      const bid = parseFloat(price.bids?.[0]?.price || "0");
      const ask = parseFloat(price.asks?.[0]?.price || "0");
      scoutData[price.instrument] = {
        bid,
        ask,
        spread: (ask - bid).toFixed(price.instrument.startsWith("XAU") ? 2 : 5),
        tradeable: price.tradeable,
        display: INSTRUMENTS[price.instrument] || price.instrument,
      };
    }

    // Fetch forex news from Finnhub
    let newsData: any[] = [];
    if (FINNHUB_API_KEY) {
      try {
        const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`);
        const raw = await newsRes.json();
        if (Array.isArray(raw)) newsData = raw.slice(0, 5);
      } catch (e) { console.error("News fetch failed:", e); }
    }

    // 4. BRAIN: Ask Groq for trade decision
    const brainPrompt = `You are PREXI Brain, an autonomous forex trading AI. Analyze this LIVE OANDA data and decide what to trade.

LIVE OANDA PRICES:
${JSON.stringify(scoutData, null, 2)}

ACCOUNT SUMMARY:
- Balance: $${realBalance.toFixed(2)}
- Unrealized P/L: $${account.unrealizedPL}
- Open Trades: ${account.openTradeCount}
- Margin Used: $${account.marginUsed}
- NAV: $${account.NAV}

RECENT NEWS:
${JSON.stringify(newsData.map((n: any) => ({ headline: n.headline, summary: n.summary?.slice(0, 200) })), null, 2)}

RULES:
- Max risk per trade: ${config.max_risk_percent}% of balance = $${(realBalance * config.max_risk_percent / 100).toFixed(2)}
- If news blackout is active (${config.news_blackout_active}), signal HOLD for all
- Only signal BUY or SELL if confidence > 70%
- Calculate appropriate units based on risk amount and stop loss distance
- Set stop_loss and take_profit levels for every trade signal
- IMPORTANT: You already have ${account.openTradeCount} open trades. Be cautious about opening too many positions.

Respond with EXACTLY this JSON (no markdown):
{
  "signals": [
    {
      "pair": "XAU_USD",
      "signal": "buy|sell|hold",
      "confidence": 0-100,
      "reasoning": "brief explanation",
      "entry_target": 0.00,
      "stop_loss": 0.00,
      "take_profit": 0.00,
      "units": 1
    }
  ],
  "market_summary": "1-2 sentence overview"
}`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: brainPrompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`Groq API error [${aiResponse.status}]: ${errText}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || "";

    let brainDecision: any;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      brainDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { signals: [], market_summary: "Parse error" };
    } catch {
      brainDecision = { signals: [], market_summary: "Failed to parse AI response" };
    }

    // 5. Execute trades on OANDA
    const results: any[] = [];
    for (const signal of (brainDecision.signals || [])) {
      // Store signal
      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: INSTRUMENTS[signal.pair] || signal.pair,
        signal: signal.signal,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        oanda_data: scoutData,
        gemini_analysis: aiContent,
        executed: false,
      }).select().single();

      if (signal.signal !== "hold" && signal.confidence > 70) {
        const units = Math.abs(signal.units || 1);
        const signedUnits = signal.signal === "sell" ? -units : units;

        const orderBody: any = {
          order: {
            type: "MARKET",
            instrument: signal.pair,
            units: signedUnits.toString(),
            timeInForce: "FOK",
            positionFill: "DEFAULT",
          },
        };

        if (signal.stop_loss) {
          orderBody.order.stopLossOnFill = {
            price: signal.stop_loss.toString(),
            timeInForce: "GTC",
          };
        }
        if (signal.take_profit) {
          orderBody.order.takeProfitOnFill = {
            price: signal.take_profit.toString(),
          };
        }

        try {
          const orderResult = await oandaFetch(
            `/v3/accounts/${OANDA_ACCOUNT_ID}/orders`,
            OANDA_API_TOKEN,
            { method: "POST", body: JSON.stringify(orderBody) }
          );

          const fill = orderResult.orderFillTransaction;
          const reject = orderResult.orderRejectTransaction;

          if (fill) {
            const { data: trade } = await supabase.from("trades").insert({
              pair: INSTRUMENTS[signal.pair] || signal.pair,
              direction: signal.signal,
              entry_price: parseFloat(fill.price || "0"),
              stake: Math.abs(units) * parseFloat(fill.price || "0"),
              status: "open",
              broker: "oanda",
              broker_order_id: fill.orderID,
              broker_trade_id: fill.tradeOpened?.tradeID || null,
              instrument: signal.pair,
              units: signedUnits,
              stop_loss: signal.stop_loss,
              take_profit: signal.take_profit,
              broker_payload: orderResult,
              signal_reason: signal.reasoning,
            }).select().single();

            if (savedSignal && trade) {
              await supabase.from("trade_signals").update({
                executed: true,
                trade_id: trade.id,
              }).eq("id", savedSignal.id);
            }

            results.push({ pair: signal.pair, signal: signal.signal, executed: true, trade });
          } else if (reject) {
            results.push({ pair: signal.pair, signal: signal.signal, executed: false, reason: reject.rejectReason });
          }
        } catch (e) {
          console.error(`OANDA execution failed for ${signal.pair}:`, e);
          results.push({ pair: signal.pair, signal: signal.signal, executed: false, error: String(e) });
        }
      } else {
        results.push({ pair: signal.pair, signal: signal.signal, executed: false, reason: "hold or low confidence" });
      }
    }

    // Update last scan
    await supabase.from("bot_config").update({
      last_scan_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    return new Response(JSON.stringify({
      status: "scan_complete",
      market_summary: brainDecision.market_summary,
      account: { balance: realBalance, nav: account.NAV, open_trades: account.openTradeCount },
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
