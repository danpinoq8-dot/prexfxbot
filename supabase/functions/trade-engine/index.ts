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

// ── FIXED RISK: exactly 0.5% per trade, no more, no less ──
const FIXED_RISK_PERCENT = 0.5;

// ── CONFIDENCE: only execute signals with >= 80% confidence ──
const MIN_CONFIDENCE = 80;

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

async function cerebrasChat(apiKey: string, messages: any[], retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "qwen-3-235b-a22b-instruct-2507", messages, temperature: 0.2, max_tokens: 2000 }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }
      if (res.status === 429) {
        console.warn(`Cerebras rate limited, retry ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const errText = await res.text();
      throw new Error(`Cerebras [${res.status}]: ${errText}`);
    } catch (e) {
      if (attempt === retries) throw e;
      console.warn(`Cerebras attempt ${attempt + 1} failed:`, e);
    }
  }
  throw new Error("Cerebras retries exhausted");
}

function analyzeStructure(candles: any[]): string {
  if (candles.length < 10) return "Insufficient data";
  const last = candles[candles.length - 1];
  const trend = last.c > candles[0].o ? "BULLISH" : last.c < candles[0].o ? "BEARISH" : "RANGING";

  const swingHighs: { price: number; idx: number }[] = [];
  const swingLows: { price: number; idx: number }[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i + 1].h)
      swingHighs.push({ price: candles[i].h, idx: i });
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i + 1].l)
      swingLows.push({ price: candles[i].l, idx: i });
  }

  let bos = "NONE";
  if (swingHighs.length >= 2 && last.c > swingHighs[swingHighs.length - 2].price) bos = "BULLISH_BOS";
  if (swingLows.length >= 2 && last.c < swingLows[swingLows.length - 2].price) bos = "BEARISH_BOS";

  const fvgs: string[] = [];
  for (let i = 2; i < candles.length; i++) {
    if (candles[i].l > candles[i - 2].h) fvgs.push(`BULL_FVG@${candles[i].l.toFixed(5)}`);
    if (candles[i].h < candles[i - 2].l) fvgs.push(`BEAR_FVG@${candles[i].h.toFixed(5)}`);
  }

  const orderBlocks: string[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].c < candles[i].o && candles[i + 1].c > candles[i + 1].o && candles[i + 1].c > candles[i].h)
      orderBlocks.push(`BULL_OB@${candles[i].l.toFixed(5)}-${candles[i].h.toFixed(5)}`);
    if (candles[i].c > candles[i].o && candles[i + 1].c < candles[i + 1].o && candles[i + 1].c < candles[i].l)
      orderBlocks.push(`BEAR_OB@${candles[i].l.toFixed(5)}-${candles[i].h.toFixed(5)}`);
  }

  const highest = Math.max(...candles.map((c: any) => c.h));
  const lowest = Math.min(...candles.map((c: any) => c.l));

  return `Trend:${trend} | BOS:${bos} | Last:O${last.o} H${last.h} L${last.l} C${last.c} | Range:${lowest}-${highest} | SwingH:${swingHighs.slice(-3).map(s => s.price).join(",")} | SwingL:${swingLows.slice(-3).map(s => s.price).join(",")} | FVG:${fvgs.slice(-3).join(",") || "NONE"} | OB:${orderBlocks.slice(-2).join(",") || "NONE"}`;
}

async function getCandles(pair: string, granularity: string, count: number, token: string) {
  try {
    const data = await oandaFetch(`/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}&price=M`, token);
    return (data.candles || []).map((c: any) => ({
      o: parseFloat(c.mid.o), h: parseFloat(c.mid.h), l: parseFloat(c.mid.l), c: parseFloat(c.mid.c),
    }));
  } catch { return []; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN")!;
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID")!;
    const CEREBRAS_API_KEY = Deno.env.get("CEREBRAS_API_KEY")!;
    const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!OANDA_API_TOKEN || !OANDA_ACCOUNT_ID || !CEREBRAS_API_KEY) throw new Error("Missing secrets");

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
      balance: realBalance, daily_pnl: unrealizedPL, updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    // 3. Sync open trades P/L from OANDA (in dollars, not points)
    try {
      const openTradesData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/openTrades`, OANDA_API_TOKEN);
      const oandaOpenTrades = openTradesData.trades || [];

      for (const ot of oandaOpenTrades) {
        const pl = parseFloat(ot.unrealizedPL || "0");
        const currentPrice = parseFloat(ot.price || "0");
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
            let finalPL = 0;
            try {
              const txData = await oandaFetch(
                `/v3/accounts/${OANDA_ACCOUNT_ID}/trades/${dbt.broker_trade_id}`,
                OANDA_API_TOKEN
              );
              finalPL = parseFloat(txData.trade?.realizedPL || "0");
            } catch { /* use 0 */ }

            await supabase.from("trades")
              .update({ status: "closed", profit_loss: finalPL, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("id", dbt.id);
          }
        }
      }
    } catch (e) {
      console.error("Trade sync error:", e);
    }

    // 4. Get prices
    const instruments = Object.keys(INSTRUMENTS).join(",");
    const pricingData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`, OANDA_API_TOKEN);
    const prices: Record<string, { bid: number; ask: number; spread: number }> = {};
    for (const p of (pricingData.prices || [])) {
      const bid = parseFloat(p.bids?.[0]?.price || "0");
      const ask = parseFloat(p.asks?.[0]?.price || "0");
      prices[p.instrument] = { bid, ask, spread: ask - bid };
    }

    // 5. Multi-timeframe structure (H4 + H1 + M15)
    const mtfAnalysis: Record<string, string> = {};
    for (const pair of Object.keys(INSTRUMENTS)) {
      const [h4, h1, m15] = await Promise.all([
        getCandles(pair, "H4", 20, OANDA_API_TOKEN),
        getCandles(pair, "H1", 30, OANDA_API_TOKEN),
        getCandles(pair, "M15", 20, OANDA_API_TOKEN),
      ]);
      mtfAnalysis[pair] = [`H4: ${analyzeStructure(h4)}`, `H1: ${analyzeStructure(h1)}`, `M15: ${analyzeStructure(m15)}`].join("\n");
    }

    // 6. Order Book
    let orderBookInfo = "";
    try {
      const obData = await oandaFetch(`/v3/instruments/XAU_USD/orderBook`, OANDA_API_TOKEN);
      if (obData.orderBook) {
        const buckets = obData.orderBook.buckets || [];
        const sorted = [...buckets].sort((a: any, b: any) =>
          (parseFloat(b.longCountPercent) + parseFloat(b.shortCountPercent)) -
          (parseFloat(a.longCountPercent) + parseFloat(a.shortCountPercent))
        );
        orderBookInfo = `XAU_USD ORDER BOOK:\n${sorted.slice(0, 5).map((b: any) =>
          `  Price ${b.price}: Longs ${b.longCountPercent}% | Shorts ${b.shortCountPercent}%`
        ).join("\n")}`;
      }
    } catch { orderBookInfo = "Order book unavailable"; }

    // 7. News
    let newsHeadlines = "";
    if (FINNHUB_API_KEY) {
      try {
        const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`);
        const raw = await newsRes.json();
        if (Array.isArray(raw)) newsHeadlines = raw.slice(0, 5).map((n: any) => n.headline).join(" | ");
      } catch { /* skip */ }
    }

    // 8. Recent trades + build list of pairs with open positions
    const { data: recentTrades } = await supabase.from("trades")
      .select("pair, direction, status, profit_loss, created_at, instrument")
      .order("created_at", { ascending: false }).limit(20);

    const openPositions = (recentTrades || []).filter(t => t.status === "open");

    // ── NEW: Build a set of pairs that already have open trades (any direction) ──
    const pairsWithOpenTrades = new Set<string>();
    for (const t of openPositions) {
      // Add both the OANDA instrument key and the display pair
      if (t.instrument) pairsWithOpenTrades.add(t.instrument);
      if (t.pair) pairsWithOpenTrades.add(t.pair);
    }

    // 9. BRAIN — Cerebras with SMC/ICT + UPDATED RULES
    const riskAmount = realBalance * FIXED_RISK_PERCENT / 100;
    const brainPrompt = `You are PREXI, an autonomous institutional forex AI using Smart Money Concepts (SMC) and ICT methodology.

ACCOUNT: Balance $${realBalance.toFixed(0)} | Open: ${account.openTradeCount} | NAV: $${parseFloat(account.NAV || account.balance).toFixed(0)} | Unrealized: $${unrealizedPL.toFixed(2)}
RISK: EXACTLY ${FIXED_RISK_PERCENT}% per trade = $${riskAmount.toFixed(2)} risk — NO MORE, NO LESS. Adjust lot/units to match.
NEWS BLACKOUT: ${config.news_blackout_active ? "ACTIVE — NO TRADES" : "CLEAR"}
MAX NEW POSITIONS: ${Math.max(0, 3 - (parseInt(account.openTradeCount) || 0))}
PAIRS WITH OPEN TRADES (DO NOT OPEN NEW TRADES ON THESE): ${pairsWithOpenTrades.size > 0 ? Array.from(pairsWithOpenTrades).join(", ") : "None"}

PRICES: ${Object.entries(prices).map(([k, v]) => `${k}: Bid ${v.bid} Ask ${v.ask} Spread ${v.spread.toFixed(5)}`).join(" | ")}

MULTI-TIMEFRAME STRUCTURE (H4 > H1 > M15):
${Object.entries(mtfAnalysis).map(([k, v]) => `--- ${k} ---\n${v}`).join("\n")}

${orderBookInfo}

NEWS: ${newsHeadlines || "None"}

OPEN POSITIONS: ${openPositions.map(t => `${t.pair} ${t.direction} P/L:$${t.profit_loss}`).join(", ") || "None"}

ICT/SMC EXECUTION RULES:
1. LIQUIDITY FIRST: Only enter AFTER price sweeps a liquidity pool.
2. ORDER BLOCK ENTRY: Enter at a validated Order Block.
3. FAIR VALUE GAP: Price must fill into an FVG for optimal entry.
4. BOS/CHoCH: Confirm Break of Structure on H1 before entering on M15.
5. MULTI-TIMEFRAME ALIGNMENT: H4 sets bias, H1 confirms, M15 gives entry.
6. UNIT CALCULATION: risk_amount = balance × 0.005. units = risk_amount / abs(entry_price - stop_loss_price). SL MUST be placed so that if hit, the loss equals EXACTLY 0.5% of the account balance ($${riskAmount.toFixed(2)}). For XAU this gives ounces, for forex it gives currency units. P/L MUST be in DOLLARS not points.
7. NEVER place a trade on a pair that already has an open position — not even in the opposite direction. PAIRS WITH OPEN TRADES listed above are BLOCKED.
8. If no ICT confluence exists: HOLD. Patience is the edge.
9. TRADE CLOSURE: The ONLY reasons to close a trade are: (a) it hits the stop loss (0.5% of balance), or (b) you determine with high certainty that the trade has ZERO chance of recovery and price has moved decisively against the position. If there is STILL a reasonable chance of the trade winning, KEEP IT OPEN — do not panic-close.
10. CONFIDENCE: Only recommend a trade if confidence is >= ${MIN_CONFIDENCE}. Below that, signal "hold".

Respond ONLY with JSON:
{"signals":[{"pair":"XAU_USD","signal":"buy|sell|hold","confidence":0-100,"reasoning":"ICT logic","entry_target":0,"stop_loss":0,"take_profit":0,"units":1}],"market_summary":"one line overview"}`;

    const aiContent = await cerebrasChat(CEREBRAS_API_KEY, [{ role: "user", content: brainPrompt }]);

    let brainDecision: any;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      brainDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { signals: [], market_summary: "Parse error" };
    } catch {
      brainDecision = { signals: [], market_summary: "Failed to parse AI response" };
    }

    // 10. Execute trades
    const results: any[] = [];
    for (const signal of (brainDecision.signals || [])) {

      // ── NEW: Block duplicate pair trades (any direction) ──
      if (pairsWithOpenTrades.has(signal.pair) || pairsWithOpenTrades.has(INSTRUMENTS[signal.pair] || "")) {
        console.warn(`BLOCKED: ${signal.pair} already has an open trade — skipping`);
        results.push({ pair: signal.pair, executed: false, reason: "duplicate_pair_blocked" });

        // Still save the signal for audit
        await supabase.from("trade_signals").insert({
          pair: INSTRUMENTS[signal.pair] || signal.pair,
          signal: signal.signal, confidence: signal.confidence,
          reasoning: `[BLOCKED — duplicate pair] ${signal.reasoning}`,
          oanda_data: prices, gemini_analysis: aiContent, executed: false,
        });
        continue;
      }

      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: INSTRUMENTS[signal.pair] || signal.pair,
        signal: signal.signal,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        oanda_data: prices,
        gemini_analysis: aiContent,
        executed: false,
      }).select().single();

      // ── UPDATED: confidence >= 80 (was > 75) ──
      if (signal.signal !== "hold" && signal.confidence >= MIN_CONFIDENCE) {

        // ── UPDATED: enforce exact 0.5% risk via unit calculation ──
        let units: number;
        if (signal.stop_loss && signal.entry_target && Math.abs(signal.entry_target - signal.stop_loss) > 0) {
          units = Math.round(riskAmount / Math.abs(signal.entry_target - signal.stop_loss));
        } else {
          // Fallback: use AI-suggested units but cap at risk amount
          units = Math.abs(signal.units || 1);
        }
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
            results.push({ pair: signal.pair, executed: true, direction: signal.signal, units: Math.abs(units), risk_amount: riskAmount });
          } else {
            results.push({ pair: signal.pair, executed: false, reason: orderResult.orderRejectTransaction?.rejectReason || "no fill" });
          }
        } catch (e) {
          console.error(`Execution failed ${signal.pair}:`, e);
          results.push({ pair: signal.pair, executed: false, error: String(e) });
        }
      } else {
        results.push({ pair: signal.pair, executed: false, reason: signal.confidence < MIN_CONFIDENCE ? `confidence_${signal.confidence}_below_${MIN_CONFIDENCE}` : "hold" });
      }
    }

    await supabase.from("bot_config").update({
      last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    console.log(`Scan complete: ${results.length} signals, ${results.filter(r => r.executed).length} executed (risk=${FIXED_RISK_PERCENT}%, min_conf=${MIN_CONFIDENCE})`);

    return new Response(JSON.stringify({
      status: "scan_complete", market_summary: brainDecision.market_summary,
      account: { balance: realBalance, open_trades: account.openTradeCount, unrealized_pl: unrealizedPL },
      risk_config: { fixed_risk_percent: FIXED_RISK_PERCENT, risk_amount: riskAmount, min_confidence: MIN_CONFIDENCE },
      results, engine: "cerebras", scanned_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("trade-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
