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

// Fetch multi-timeframe candles for structure analysis
async function fetchStructureCandles(token: string, accountId: string, instrument: string) {
  const timeframes = [
    { gran: "H4", count: 50, label: "H4" },
    { gran: "H1", count: 50, label: "H1" },
    { gran: "M15", count: 50, label: "M15" },
  ];
  const results: Record<string, any[]> = {};
  for (const tf of timeframes) {
    try {
      const data = await oandaFetch(
        `/v3/instruments/${instrument}/candles?granularity=${tf.gran}&count=${tf.count}&price=MBA`,
        token
      );
      results[tf.label] = (data.candles || []).map((c: any) => ({
        time: c.time,
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
        vol: c.volume,
      }));
    } catch (e) {
      console.error(`Candle fetch ${instrument} ${tf.label}:`, e);
      results[tf.label] = [];
    }
  }
  return results;
}

// Fetch OANDA order book for institutional positioning
async function fetchOrderBook(token: string, instrument: string) {
  try {
    const data = await oandaFetch(`/v3/instruments/${instrument}/orderBook`, token);
    const buckets = data.orderBook?.buckets || [];
    const price = parseFloat(data.orderBook?.price || "0");
    // Summarise: find where big clusters of orders sit
    const significant = buckets
      .filter((b: any) => parseFloat(b.longCountPercent) > 2 || parseFloat(b.shortCountPercent) > 2)
      .map((b: any) => ({
        price: parseFloat(b.price),
        longs: parseFloat(b.longCountPercent),
        shorts: parseFloat(b.shortCountPercent),
      }));
    return { price, significant: significant.slice(0, 15) };
  } catch {
    return null;
  }
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

    // 3. SCOUT: Get live prices
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
        bid, ask,
        spread: (ask - bid).toFixed(price.instrument.startsWith("XAU") ? 2 : 5),
        tradeable: price.tradeable,
        display: INSTRUMENTS[price.instrument] || price.instrument,
      };
    }

    // 4. STRUCTURE: Fetch multi-timeframe candles + order book for top 2 pairs
    const topPairs = Object.keys(INSTRUMENTS).slice(0, 3);
    const structureData: Record<string, any> = {};
    const orderBooks: Record<string, any> = {};

    for (const pair of topPairs) {
      structureData[pair] = await fetchStructureCandles(OANDA_API_TOKEN, OANDA_ACCOUNT_ID, pair);
      orderBooks[pair] = await fetchOrderBook(OANDA_API_TOKEN, pair);
    }

    // 5. Fetch forex news from Finnhub
    let newsData: any[] = [];
    if (FINNHUB_API_KEY) {
      try {
        const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`);
        const raw = await newsRes.json();
        if (Array.isArray(raw)) newsData = raw.slice(0, 8);
      } catch (e) { console.error("News fetch failed:", e); }
    }

    // 6. Get recent trades to avoid over-trading
    const { data: recentTrades } = await supabase
      .from("trades")
      .select("pair, direction, status, created_at, profit_loss")
      .order("created_at", { ascending: false })
      .limit(10);

    // 7. BRAIN: Institutional SMC/ICT Strategy via Groq
    const brainPrompt = `You are PREXI Brain — an autonomous institutional-grade forex trading AI using Smart Money Concepts (SMC) and Inner Circle Trader (ICT) methodology.

## YOUR INSTITUTIONAL TRADING FRAMEWORK

### Step 1: Market Structure Analysis (Multi-Timeframe)
Analyze the H4/H1/M15 candle data below. Identify:
- **Higher Timeframe Bias** (H4): Is the market in a bullish or bearish trend? Look for Break of Structure (BOS) and Change of Character (CHoCH).
- **Execution Timeframe** (H1/M15): Where are the Order Blocks (OB), Fair Value Gaps (FVG), and Breaker Blocks?
- **Key Levels**: Previous session highs/lows, equal highs/lows (liquidity targets).

### Step 2: Liquidity Analysis
Using the Order Book data, identify:
- **Liquidity Pools**: Where are clusters of stop losses sitting? (Equal highs = buy-side liquidity, equal lows = sell-side liquidity)
- **Institutional Order Walls**: Large concentrations of limit orders that act as support/resistance.
- **Liquidity Sweeps**: Has price recently swept a liquidity pool? This is the ENTRY signal.

### Step 3: Entry Model (ICT Optimal Trade Entry)
Only enter when ALL conditions align:
1. H4 bias is clear (trending, not ranging)
2. Price has swept a liquidity pool (stop hunt completed)
3. Price returns into an Order Block or Fair Value Gap on M15/H1
4. Displacement candle confirms institutional intent (strong momentum candle)

### Step 4: Risk Management (The SHIELD)
- Max risk: ${config.max_risk_percent}% of balance = $${(realBalance * config.max_risk_percent / 100).toFixed(2)}
- Stop loss MUST be behind the Order Block / liquidity sweep level
- Take profit at the OPPOSITE liquidity pool (buy-side → target sell-side, and vice versa)
- Minimum Risk:Reward = 1:2 (prefer 1:3+)

### Step 5: News Filter
- If news blackout is active (${config.news_blackout_active}), signal HOLD for ALL pairs
- High-impact news within 30 minutes → HOLD
- After major data drop: compare Actual vs Forecast. Strong deviation = trade WITH the data direction

## LIVE DATA

### OANDA PRICES:
${JSON.stringify(scoutData, null, 2)}

### MULTI-TIMEFRAME STRUCTURE (H4/H1/M15 candles):
${JSON.stringify(structureData, null, 2)}

### ORDER BOOK DATA (Institutional Positioning):
${JSON.stringify(orderBooks, null, 2)}

### ACCOUNT:
- Balance: $${realBalance.toFixed(2)}
- Unrealized P/L: $${account.unrealizedPL}
- Open Trades: ${account.openTradeCount}
- Margin Used: $${account.marginUsed}
- NAV: $${account.NAV}

### RECENT TRADES (avoid duplicates):
${JSON.stringify(recentTrades || [], null, 2)}

### NEWS HEADLINES:
${JSON.stringify(newsData.map((n: any) => ({ headline: n.headline, summary: n.summary?.slice(0, 200), datetime: n.datetime })), null, 2)}

## RULES
- ONLY signal BUY or SELL when the full ICT/SMC confluence is present
- Confidence must be > 75% to execute (institutional-grade setups only)
- Calculate units based on: risk_amount / (entry - stop_loss) for proper position sizing
- For XAU_USD: units are in troy ounces. For forex: units are in base currency.
- If no clean setup exists, signal HOLD — patience IS the edge
- Max ${3 - (parseInt(account.openTradeCount) || 0)} new positions allowed (cap at 3 total open)
- Provide ICT/SMC reasoning: mention the specific Order Block, FVG, liquidity sweep, or BOS that triggered the signal

Respond with EXACTLY this JSON (no markdown):
{
  "signals": [
    {
      "pair": "XAU_USD",
      "signal": "buy|sell|hold",
      "confidence": 0-100,
      "reasoning": "ICT/SMC reasoning: [structure] swept [liquidity level], entering at [OB/FVG] on M15, targeting [opposite liquidity]",
      "entry_target": 0.00,
      "stop_loss": 0.00,
      "take_profit": 0.00,
      "units": 1,
      "risk_reward": "1:X"
    }
  ],
  "market_summary": "Institutional overview: [structure bias], [liquidity status], [news impact]"
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
        temperature: 0.2,
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

    // 8. Execute trades on OANDA
    const results: any[] = [];
    for (const signal of (brainDecision.signals || [])) {
      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: INSTRUMENTS[signal.pair] || signal.pair,
        signal: signal.signal,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        oanda_data: scoutData,
        gemini_analysis: aiContent,
        executed: false,
      }).select().single();

      if (signal.signal !== "hold" && signal.confidence > 75) {
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
