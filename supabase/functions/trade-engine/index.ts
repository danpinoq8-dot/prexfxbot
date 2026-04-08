import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxpractice.oanda.com";
const INSTRUMENTS: Record<string, string> = {
  XAU_USD: "XAU/USD", EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", GBP_JPY: "GBP/JPY", USD_JPY: "USD/JPY",
  AUD_USD: "AUD/USD", NZD_USD: "NZD/USD", USD_CAD: "USD/CAD", USD_CHF: "USD/CHF",
  EUR_GBP: "EUR/GBP", EUR_JPY: "EUR/JPY", EUR_AUD: "EUR/AUD", GBP_AUD: "GBP/AUD",
  AUD_JPY: "AUD/JPY", CAD_JPY: "CAD/JPY", NZD_JPY: "NZD/JPY", GBP_CAD: "GBP/CAD",
};

// USD-correlated pairs for correlation filter
const USD_CORRELATED = new Set(["EUR_USD", "GBP_USD", "USD_JPY", "XAU_USD", "AUD_USD", "NZD_USD", "USD_CAD", "USD_CHF"]);

// ── STRATEGY CONSTANTS ──
const RISK_PERCENT = 0.1;       // 0.1% per trade
const MAX_TOTAL_RISK = 1.0;     // 1% total exposure
const MAX_CONCURRENT = 7;
const SMA_PERIOD = 200;
const EMA_PERIOD = 20;
const ATR_PERIOD = 14;
const ATR_SL_MULT = 1.5;
const RR_TARGET = 2;
const PULLBACK_MIN_ATR = 0.1;
const PULLBACK_MAX_ATR = 6.0;
const MOMENTUM_BODY_RATIO = 0.40;
const TRADE_SPACING_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DAILY_LOSS_R = 2;
const MAX_CONSECUTIVE_LOSSES = 3;
const MAX_WEEKLY_LOSS_R = 5;
const MAX_USD_CORRELATED = 3;
const MAX_SPREAD_STOP_RATIO = 0.20;  // Spread <= 20% of stop

const MIN_ATR_PRICE_RATIO = 0.0005; // ATR >= 0.05% of price

// ── OANDA helpers ──
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

async function getCandles(pair: string, granularity: string, count: number, token: string) {
  try {
    const data = await oandaFetch(`/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}&price=M`, token);
    return (data.candles || []).filter((c: any) => c.complete !== false).map((c: any) => ({
      o: parseFloat(c.mid.o), h: parseFloat(c.mid.h), l: parseFloat(c.mid.l), c: parseFloat(c.mid.c),
      time: c.time,
    }));
  } catch { return []; }
}

// ── Technical indicators ──
function calcSMA(candles: { c: number }[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return slice.reduce((s, c) => s + c.c, 0) / period;
}

function calcEMA(candles: { c: number }[], period: number): number | null {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles[0].c;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
  }
  return ema;
}

function calcATR(candles: { h: number; l: number; c: number }[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - candles[i - 1].c),
      Math.abs(candles[i].l - candles[i - 1].c)
    );
    trs.push(tr);
  }
  // Simple ATR = average of last `period` TRs
  const slice = trs.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

// ── Pip value helpers ──
function getPipSize(pair: string): number {
  if (pair === "XAU_USD") return 0.01;
  if (pair.includes("JPY")) return 0.01;
  return 0.0001;
}

function getStopDistanceInPips(stopDistance: number, pair: string): number {
  return stopDistance / getPipSize(pair);
}

// Approximate pip value in USD for standard lot
function getPipValueUSD(pair: string, price: number): number {
  const pipSize = getPipSize(pair);
  if (pair === "XAU_USD") {
    // 1 unit XAU = 1 oz. Pip = 0.01. Move of 0.01 on 1 oz = $0.01
    return 0.01; // per unit (oz)
  }
  if (pair.endsWith("_USD") || pair === "EUR_USD" || pair === "GBP_USD") {
    // Quote is USD: pip value = pipSize * units
    return pipSize; // per unit
  }
  if (pair.startsWith("USD_")) {
    // Base is USD: pip value = pipSize / price per unit
    return pipSize / price;
  }
  // Cross pairs (e.g. GBP_JPY): approximate via USD
  // pip value ≈ pipSize / price (rough)
  return pipSize / price;
}


// ── OANDA price precision ──
function getOandaPrecision(pair: string): number {
  if (pair === "XAU_USD") return 3;
  if (pair.includes("JPY")) return 3;
  return 5;
}

function formatPrice(price: number, pair: string): string {
  return price.toFixed(getOandaPrecision(pair));
}

// ── Strategy evaluation for one pair ──
interface TradeSignal {
  pair: string;
  direction: "buy" | "sell" | "hold";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  units: number;
  atr: number;
  sma200: number;
  ema20: number;
  reasoning: string;
  confidence: number;
  stopDistancePips: number;
}

function evaluatePair(
  pair: string,
  candles: { o: number; h: number; l: number; c: number }[],
  bid: number, ask: number, spread: number,
  equity: number
): { signal: TradeSignal | null; reason: string } {
  if (candles.length < SMA_PERIOD + 1) return { signal: null, reason: "insufficient_candles" };

  const sma200 = calcSMA(candles, SMA_PERIOD);
  const ema20 = calcEMA(candles, EMA_PERIOD);
  const atr = calcATR(candles, ATR_PERIOD);
  if (!sma200 || !ema20 || !atr) return { signal: null, reason: "indicator_fail" };

  const last = candles[candles.length - 1];
  const price = last.c;
  const stopDistance = ATR_SL_MULT * atr;

  if (atr < price * MIN_ATR_PRICE_RATIO) return { signal: null, reason: `low_vol(ATR=${atr.toFixed(6)})` };
  if (spread > stopDistance * MAX_SPREAD_STOP_RATIO) return { signal: null, reason: `spread(${spread.toFixed(5)}>${(stopDistance*MAX_SPREAD_STOP_RATIO).toFixed(5)})` };

  const isBullish = price > sma200;
  const isBearish = price < sma200;
  if (!isBullish && !isBearish) return { signal: null, reason: "no_trend" };

  const distToEma = Math.abs(price - ema20);
  const pbATR = distToEma / atr;
  if (pbATR < PULLBACK_MIN_ATR || pbATR > PULLBACK_MAX_ATR) return { signal: null, reason: `pullback(${pbATR.toFixed(2)}ATR)` };

  if (isBullish && price < ema20 - atr * 0.5) return { signal: null, reason: "too_deep_bull" };
  if (isBearish && price > ema20 + atr * 0.5) return { signal: null, reason: "too_deep_bear" };

  const body = Math.abs(last.c - last.o);
  const range = last.h - last.l;
  if (range <= 0 || body / range < MOMENTUM_BODY_RATIO) return { signal: null, reason: `candle(${range>0?(body/range*100).toFixed(0):'0'}%)` };

  const candleBullish = last.c > last.o;
  const candleBearish = last.c < last.o;
  if (isBullish && !candleBullish) return { signal: null, reason: "candle_vs_trend" };
  if (isBearish && !candleBearish) return { signal: null, reason: "candle_vs_trend" };

  const direction: "buy" | "sell" = isBullish ? "buy" : "sell";
  const entry = direction === "buy" ? ask : bid;
  const sl = direction === "buy" ? entry - stopDistance : entry + stopDistance;
  const tp = direction === "buy" ? entry + stopDistance * RR_TARGET : entry - stopDistance * RR_TARGET;

  const slippageBuffer = spread * 0.5;
  const effectiveStop = stopDistance + spread + slippageBuffer;
  const riskAmount = equity * RISK_PERCENT / 100;
  const pipValue = getPipValueUSD(pair, entry);
  const effectiveStopPips = effectiveStop / getPipSize(pair);
  const units = Math.floor(riskAmount / (effectiveStopPips * pipValue));

  if (units <= 0) return { signal: null, reason: "zero_units" };

  const reasoning = `Trend Pullback | ${direction.toUpperCase()} | SMA200=${sma200.toFixed(5)} EMA20=${ema20.toFixed(5)} ATR=${atr.toFixed(5)} | Price ${price.toFixed(5)} | Pullback ${pbATR.toFixed(2)} ATR | Body ${(body/range*100).toFixed(0)}%`;

  return {
    signal: {
      pair, direction, entry, stopLoss: sl, takeProfit: tp, units,
      atr, sma200, ema20, reasoning, confidence: 85,
      stopDistancePips: getStopDistanceInPips(stopDistance, pair),
    },
    reason: "valid",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OANDA_API_TOKEN = Deno.env.get("OANDA_API_TOKEN")!;
    const OANDA_ACCOUNT_ID = Deno.env.get("OANDA_ACCOUNT_ID")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!OANDA_API_TOKEN || !OANDA_ACCOUNT_ID) throw new Error("Missing OANDA secrets");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Bot config
    const { data: config } = await supabase.from("bot_config").select("*").limit(1).single();
    if (!config?.is_active) {
      return new Response(JSON.stringify({ status: "bot_inactive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // 3. Daily / weekly circuit breakers
    const dailyLossR = Number(config.daily_loss_r || 0);
    const weeklyLossR = Number(config.weekly_loss_r || 0);
    const consecutiveLosses = Number(config.consecutive_losses || 0);

    if (dailyLossR >= MAX_DAILY_LOSS_R || consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
      return new Response(JSON.stringify({ status: "daily_circuit_breaker", daily_loss_r: dailyLossR, consecutive_losses: consecutiveLosses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (weeklyLossR >= MAX_WEEKLY_LOSS_R) {
      return new Response(JSON.stringify({ status: "weekly_halt", weekly_loss_r: weeklyLossR }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Trade spacing: 5 min since last trade
    if (config.last_trade_at) {
      const elapsed = Date.now() - new Date(config.last_trade_at).getTime();
      if (elapsed < TRADE_SPACING_MS) {
        return new Response(JSON.stringify({ status: "trade_spacing", seconds_remaining: Math.ceil((TRADE_SPACING_MS - elapsed) / 1000) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5. Sync OANDA account
    const accountData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/summary`, OANDA_API_TOKEN);
    const account = accountData.account;
    const realBalance = parseFloat(account.balance);
    const equity = parseFloat(account.NAV || account.balance);
    const unrealizedPL = parseFloat(account.unrealizedPL || "0");

    await supabase.from("bot_config").update({
      balance: realBalance, daily_pnl: unrealizedPL, updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    // 6. Sync open trades from OANDA
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

            // Update circuit breaker counters
            const riskAmount = realBalance * RISK_PERCENT / 100;
            const rLost = riskAmount > 0 ? -finalPL / riskAmount : 0;
            if (finalPL < 0) {
              await supabase.from("bot_config").update({
                consecutive_losses: (consecutiveLosses + 1),
                daily_loss_r: dailyLossR + rLost,
                weekly_loss_r: weeklyLossR + rLost,
              }).eq("id", config.id);
            } else if (finalPL > 0) {
              await supabase.from("bot_config").update({
                consecutive_losses: 0, // reset on win
              }).eq("id", config.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("Trade sync error:", e);
    }

    // 7. Get prices
    const instruments = Object.keys(INSTRUMENTS).join(",");
    const pricingData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/pricing?instruments=${instruments}`, OANDA_API_TOKEN);
    const prices: Record<string, { bid: number; ask: number; spread: number }> = {};
    for (const p of (pricingData.prices || [])) {
      const bid = parseFloat(p.bids?.[0]?.price || "0");
      const ask = parseFloat(p.asks?.[0]?.price || "0");
      prices[p.instrument] = { bid, ask, spread: ask - bid };
    }

    // 8. Check open positions
    const { data: openTrades } = await supabase.from("trades")
      .select("pair, direction, status, profit_loss, instrument")
      .eq("status", "open");

    const openPositions = openTrades || [];
    const pairsWithOpenTrades = new Set<string>();
    for (const t of openPositions) {
      if (t.instrument) pairsWithOpenTrades.add(t.instrument);
      if (t.pair) pairsWithOpenTrades.add(t.pair);
    }

    // Max concurrent check
    if (openPositions.length >= MAX_CONCURRENT) {
      await supabase.from("bot_config").update({
        last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", config.id);
      return new Response(JSON.stringify({ status: "max_concurrent_reached", open: openPositions.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Correlation filter: count USD-correlated open trades
    const usdCorrelatedOpen = openPositions.filter(t => USD_CORRELATED.has(t.instrument || "")).length;

    // 9. Fetch candles (H1 with 210 bars for SMA200 + buffer) and evaluate each pair
    const results: any[] = [];
    const signals: TradeSignal[] = [];

    for (const pair of Object.keys(INSTRUMENTS)) {
      // Skip if already has open trade
      if (pairsWithOpenTrades.has(pair) || pairsWithOpenTrades.has(INSTRUMENTS[pair])) {
        results.push({ pair, executed: false, reason: "duplicate_pair" });
        continue;
      }

      // Correlation cap
      if (USD_CORRELATED.has(pair) && usdCorrelatedOpen >= MAX_USD_CORRELATED) {
        results.push({ pair, executed: false, reason: "usd_correlation_cap" });
        continue;
      }

      const p = prices[pair];
      if (!p) { results.push({ pair, executed: false, reason: "no_price" }); continue; }

      // Get H1 candles for SMA200 + ATR + EMA
      const candles = await getCandles(pair, "H1", SMA_PERIOD + ATR_PERIOD + 5, OANDA_API_TOKEN);
      if (candles.length < SMA_PERIOD) {
        results.push({ pair, executed: false, reason: "insufficient_candles" });
        continue;
      }

      const result = evaluatePair(pair, candles, p.bid, p.ask, p.spread, equity);
      if (!result.signal) {
        results.push({ pair, executed: false, reason: result.reason });
        continue;
      }

      // Total risk check
      const currentRisk = openPositions.length * RISK_PERCENT;
      if (currentRisk + RISK_PERCENT > MAX_TOTAL_RISK) {
        results.push({ pair, executed: false, reason: "total_risk_cap" });
        continue;
      }

      signals.push(result.signal);
    }

    // 10. Execute signals
    for (const signal of signals) {
      // Save signal for audit
      const { data: savedSignal } = await supabase.from("trade_signals").insert({
        pair: INSTRUMENTS[signal.pair] || signal.pair,
        signal: signal.direction,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        oanda_data: prices,
        executed: false,
      }).select().single();

      const signedUnits = signal.direction === "sell" ? -signal.units : signal.units;

      const orderBody: any = {
        order: {
          type: "MARKET", instrument: signal.pair, units: signedUnits.toString(),
          timeInForce: "FOK", positionFill: "DEFAULT",
          stopLossOnFill: { price: formatPrice(signal.stopLoss, signal.pair), timeInForce: "GTC" },
          takeProfitOnFill: { price: formatPrice(signal.takeProfit, signal.pair) },
        },
      };

      try {
        const orderResult = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT_ID}/orders`, OANDA_API_TOKEN, {
          method: "POST", body: JSON.stringify(orderBody),
        });

        const fill = orderResult.orderFillTransaction;
        if (fill) {
          const riskAmount = equity * RISK_PERCENT / 100;
          const { data: trade } = await supabase.from("trades").insert({
            pair: INSTRUMENTS[signal.pair] || signal.pair,
            direction: signal.direction,
            entry_price: parseFloat(fill.price || "0"),
            stake: Math.abs(signal.units) * parseFloat(fill.price || "0"),
            status: "open", broker: "oanda",
            broker_order_id: fill.orderID,
            broker_trade_id: fill.tradeOpened?.tradeID || null,
            instrument: signal.pair, units: signedUnits,
            stop_loss: signal.stopLoss, take_profit: signal.takeProfit,
            broker_payload: orderResult,
            signal_reason: signal.reasoning,
          }).select().single();

          if (savedSignal && trade) {
            await supabase.from("trade_signals").update({ executed: true, trade_id: trade.id }).eq("id", savedSignal.id);
          }

          // Update last_trade_at
          await supabase.from("bot_config").update({ last_trade_at: new Date().toISOString() }).eq("id", config.id);

          results.push({
            pair: signal.pair, executed: true, direction: signal.direction,
            units: signal.units, risk_amount: riskAmount,
            sl: signal.stopLoss, tp: signal.takeProfit, atr: signal.atr,
          });
        } else {
          results.push({ pair: signal.pair, executed: false, reason: orderResult.orderRejectTransaction?.rejectReason || "no_fill" });
        }
      } catch (e) {
        console.error(`Execution failed ${signal.pair}:`, e);
        results.push({ pair: signal.pair, executed: false, error: String(e) });
      }
    }

    await supabase.from("bot_config").update({
      last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", config.id);

    const executed = results.filter(r => r.executed).length;
    console.log(`Scan complete: ${results.length} pairs checked, ${executed} executed | Strategy: Trend Pullback ATR`);

    return new Response(JSON.stringify({
      status: "scan_complete",
      strategy: "trend_pullback_atr",
      account: { balance: realBalance, equity, open_trades: openPositions.length, unrealized_pl: unrealizedPL },
      risk_config: { risk_percent: RISK_PERCENT, max_total: MAX_TOTAL_RISK, max_concurrent: MAX_CONCURRENT },
      circuit_breakers: { daily_loss_r: dailyLossR, weekly_loss_r: weeklyLossR, consecutive_losses: consecutiveLosses },
      results,
      scanned_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("trade-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
