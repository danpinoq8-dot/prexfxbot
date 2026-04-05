import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";
const INSTRUMENTS: Record<string, string> = {
  XAU_USD: "XAU/USD", EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", GBP_JPY: "GBP/JPY", USD_JPY: "USD/JPY",
};

async function oandaFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${OANDA_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OANDA ${path} [${res.status}]: ${text}`);
  }
  return res.json();
}

// Groq call with retry on 429
async function groqChat(apiKey: string, messages: any[], retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, temperature: 0.2, max_tokens: 1500 }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }
    if (res.status === 429 && attempt < retries) {
      const errBody = await res.text();
      console.warn(`Groq 429, retry ${attempt + 1}/${retries}...`);
      // Wait before retry (exponential backoff)
      await new Promise(r => setTimeout(r, (attempt + 1) * 15000));
      continue;
    }
    const errText = await res.text();
    throw new Error(`Groq API [${res.status}]: ${errText}`);
  }
  throw new Error("Groq retries exhausted");
}

// Summarize candles into key levels instead of sending raw data
function summarizeCandles(candles: any[]) {
  if (!candles.length) return "No data";
  const highs = candles.map((c: any) => c.h);
  const lows = candles.map((c: any) => c.l);
  const closes = candles.map((c: any) => c.c);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const highest = Math.max(...highs);
  const lowest = Math.min(...lows);
  const trend = last.c > candles[0].o ? "BULLISH" : last.c < candles[0].o ? "BEARISH" : "RANGING";

  // Detect recent swing highs/lows (simple)
  const recentHighs: number[] = [];
  const recentLows: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].h > candles[i-1].h && candles[i].h > candles[i+1].h) recentHighs.push(candles[i].h);
    if (candles[i].l < candles[i-1].l && candles[i].l < candles[i+1].l) recentLows.push(candles[i].l);
  }

  return `Trend: ${trend} | Last: O${last.o} H${last.h} L${last.l} C${last.c} | Range: ${lowest}-${highest} | SwingHighs: ${recentHighs.slice(-3).join(",")} | SwingLows: ${recentLows.slice(-3).join(",")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN")!;
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID")!;
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 14-key Groq rotation pool for the trade engine
    const GROQ_KEYS: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const k = Deno.env.get(`GROQ_API_KEY_${i}`);
      if (k) GROQ_KEYS.push(k);
    }
    // Fallback to original single key if rotation keys not set
    if (GROQ_KEYS.length === 0) {
      const fallback = Deno.env.get("GROQ_API_KEY");
      if (fallback) GROQ_KEYS.push(fallback);
    }

    if (!OANDA_API_TOKEN || !OANDA_ACCOUNT_ID || GROQ_KEYS.length === 0) throw new Error("Missing secrets");

    // Pick a key based on current minute to spread load evenly
    const keyIndex = Math.floor(Date.now() / 60000) % GROQ_KEYS.length;
    const selectedGroqKey = GROQ_KEYS[keyIndex];
    console.log(`Using Groq key ${keyIndex + 1}/${GROQ_KEYS.length}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Bot config
    const { data: config } = await supabase.from("bot_config").select("*").limit(1).single();
    if (!config?.is_active) {
      return new Response(JSON.stringify({ status: "bot_inactive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Sync OANDA account
    const accountData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/summary`, OANDA_API_TOKEN);
    const account = accountData.account;
    const realBalance = parseFloat(account.balance);
    const unrealizedPL = parseFloat(account.unrealizedPL || "0");

    await supabase.from("bot_config").update({
      balance: realBalance,
      daily_pnl: unrealizedPL,
      updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    // 3. Sync open trades P/L from OANDA
    try {
      const openTradesData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/openTrades`, OANDA_API_TOKEN);
      const oandaOpenTrades = openTradesData.trades || [];

      // Update each trade's unrealized P/L in our DB
      for (const ot of oandaOpenTrades) {
        const pl = parseFloat(ot.unrealizedPL || "0");
        const currentPrice = parseFloat(ot.price || "0");
        // Try to match by broker_trade_id
        await supabase.from("trades")
          .update({ profit_loss: pl, exit_price: currentPrice, updated_at: new Date().toISOString() })
          .eq("broker_trade_id", ot.id)
          .eq("status", "open");
      }

      // Close trades in DB that OANDA no longer has open
      const { data: dbOpenTrades } = await supabase.from("trades")
        .select("id, broker_trade_id")
        .eq("status", "open")
        .not("broker_trade_id", "is", null);

      if (dbOpenTrades) {
        const oandaIds = new Set(oandaOpenTrades.map((t: any) => t.id));
        for (const dbt of dbOpenTrades) {
          if (dbt.broker_trade_id && !oandaIds.has(dbt.broker_trade_id)) {
            // This trade was closed on OANDA, mark it closed
            await supabase.from("trades")
              .update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("id", dbt.id);
          }
        }
      }
    } catch (e) {
      console.error("Open trade sync error:", e);
    }

    // 4. Get prices (compact)
    const instruments = Object.keys(INSTRUMENTS).join(",");
    const pricingData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`, OANDA_API_TOKEN);
    const prices: Record<string, { bid: number; ask: number }> = {};
    for (const p of (pricingData.prices || [])) {
      prices[p.instrument] = { bid: parseFloat(p.bids?.[0]?.price || "0"), ask: parseFloat(p.asks?.[0]?.price || "0") };
    }

    // 5. Get H1 candles for top pairs (summarized, not raw)
    const structureSummary: Record<string, string> = {};
    for (const pair of Object.keys(INSTRUMENTS).slice(0, 3)) {
      try {
        const data = await oandaFetch(`/v3/instruments/${pair}/candles?granularity=H1&count=30&price=M`, OANDA_API_TOKEN);
        const candles = (data.candles || []).map((c: any) => ({
          o: parseFloat(c.mid.o), h: parseFloat(c.mid.h), l: parseFloat(c.mid.l), c: parseFloat(c.mid.c),
        }));
        structureSummary[pair] = summarizeCandles(candles);
      } catch { structureSummary[pair] = "No data"; }
    }

    // 6. News headlines (compact)
    let newsHeadlines = "";
    if (FINNHUB_API_KEY) {
      try {
        const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`);
        const raw = await newsRes.json();
        if (Array.isArray(raw)) {
          newsHeadlines = raw.slice(0, 5).map((n: any) => n.headline).join(" | ");
        }
      } catch { /* skip */ }
    }

    // 7. Recent trades
    const { data: recentTrades } = await supabase.from("trades")
      .select("pair, direction, status, created_at").order("created_at", { ascending: false }).limit(5);

    // 8. BRAIN — compact prompt to save tokens
    const brainPrompt = `You are PREXI, an autonomous forex AI using ICT/SMC strategy. Analyze and decide trades.

ACCOUNT: Balance $${realBalance.toFixed(0)} | Open: ${account.openTradeCount} | Unrealized: $${unrealizedPL.toFixed(2)}
RISK: Max ${config.max_risk_percent}% = $${(realBalance * config.max_risk_percent / 100).toFixed(0)} per trade
NEWS BLACKOUT: ${config.news_blackout_active ? "ACTIVE — no trades" : "CLEAR"}
MAX NEW POSITIONS: ${Math.max(0, 3 - (parseInt(account.openTradeCount) || 0))}

PRICES: ${Object.entries(prices).map(([k, v]) => `${k}: ${v.bid}/${v.ask}`).join(" | ")}

STRUCTURE:
${Object.entries(structureSummary).map(([k, v]) => `${k}: ${v}`).join("\n")}

NEWS: ${newsHeadlines || "None"}

RECENT: ${(recentTrades || []).map(t => `${t.pair} ${t.direction} ${t.status}`).join(", ") || "None"}

RULES:
- Signal BUY/SELL only with >75% confidence (ICT confluence: liquidity sweep + OB/FVG entry)
- Calculate units: risk_amount / abs(entry - stop_loss). XAU=ounces, forex=base currency units
- If no setup: HOLD. Patience is the edge.
- Never duplicate an existing open position

Respond ONLY with this JSON:
{"signals":[{"pair":"XAU_USD","signal":"buy|sell|hold","confidence":0-100,"reasoning":"brief ICT logic","entry_target":0,"stop_loss":0,"take_profit":0,"units":1}],"market_summary":"one line overview"}`;

    const aiContent = await groqChat(selectedGroqKey, [{ role: "user", content: brainPrompt }]);

    let brainDecision: any;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      brainDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { signals: [], market_summary: "Parse error" };
    } catch {
      brainDecision = { signals: [], market_summary: "Failed to parse AI response" };
    }

    // 9. Execute trades
    const results: any[] = [];
    for (const signal of (brainDecision.signals || [])) {
      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: INSTRUMENTS[signal.pair] || signal.pair,
        signal: signal.signal,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        oanda_data: prices,
        gemini_analysis: aiContent,
        executed: false,
      }).select().single();

      if (signal.signal !== "hold" && signal.confidence > 75) {
        const units = Math.abs(signal.units || 1);
        const signedUnits = signal.signal === "sell" ? -units : units;

        const orderBody: any = {
          order: {
            type: "MARKET", instrument: signal.pair, units: signedUnits.toString(),
            timeInForce: "FOK", positionFill: "DEFAULT",
          },
        };
        if (signal.stop_loss) orderBody.order.stopLossOnFill = { price: signal.stop_loss.toString(), timeInForce: "GTC" };
        if (signal.take_profit) orderBody.order.takeProfitOnFill = { price: signal.take_profit.toString() };

        try {
          const orderResult = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/orders`, OANDA_API_TOKEN, {
            method: "POST", body: JSON.stringify(orderBody),
          });

          const fill = orderResult.orderFillTransaction;
          if (fill) {
            const { data: trade } = await supabase.from("trades").insert({
              pair: INSTRUMENTS[signal.pair] || signal.pair,
              direction: signal.signal, entry_price: parseFloat(fill.price || "0"),
              stake: Math.abs(units) * parseFloat(fill.price || "0"),
              status: "open", broker: "oanda",
              broker_order_id: fill.orderID, broker_trade_id: fill.tradeOpened?.tradeID || null,
              instrument: signal.pair, units: signedUnits,
              stop_loss: signal.stop_loss, take_profit: signal.take_profit,
              broker_payload: orderResult, signal_reason: signal.reasoning,
            }).select().single();

            if (savedSignal && trade) {
              await supabase.from("trade_signals").update({ executed: true, trade_id: trade.id }).eq("id", savedSignal.id);
            }
            results.push({ pair: signal.pair, executed: true });
          } else {
            results.push({ pair: signal.pair, executed: false, reason: orderResult.orderRejectTransaction?.rejectReason || "no fill" });
          }
        } catch (e) {
          console.error(`Execution failed ${signal.pair}:`, e);
          results.push({ pair: signal.pair, executed: false, error: String(e) });
        }
      } else {
        results.push({ pair: signal.pair, executed: false, reason: "hold/low confidence" });
      }
    }

    await supabase.from("bot_config").update({ last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", config.id);

    return new Response(JSON.stringify({
      status: "scan_complete", market_summary: brainDecision.market_summary,
      account: { balance: realBalance, open_trades: account.openTradeCount, unrealized_pl: unrealizedPL },
      results, scanned_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("trade-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
