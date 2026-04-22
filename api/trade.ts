// PREXFX v3 Trade Engine — Vercel Serverless Function
// Strategy: Trend Pullback ATR with D1 confirmation, scoring system, trailing SL

const OANDA_API = "https://api-fxpractice.oanda.com";

const INSTRUMENTS: Record<string, string> = {
  EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", USD_JPY: "USD/JPY",
  XAU_USD: "XAU/USD", AUD_USD: "AUD/USD", USD_CAD: "USD/CAD",
};
const USD_CORRELATED = new Set(Object.keys(INSTRUMENTS));

// ── STRATEGY CONSTANTS ──
const RISK_PERCENT = 0.5;          // 0.5% per trade (conservative start)
const MAX_TOTAL_RISK = 2.0;        // 2% total exposure
const MAX_CONCURRENT = 4;
const MAX_USD_CORRELATED = 2;
const SMA_PERIOD = 200;
const EMA_PERIOD = 20;
const ATR_PERIOD = 14;
const RSI_PERIOD = 14;
const D1_SMA_PERIOD = 50;
const ATR_SL_MULT = 1.5;
const RR_TARGET = 2;
const PULLBACK_MIN_ATR = 0.3;
const PULLBACK_MAX_ATR = 1.2;
const MOMENTUM_BODY_RATIO = 0.55;
const TRADE_SPACING_MS = 5 * 60 * 1000;
const ORPHAN_TRADE_GRACE_MS = 2 * 60 * 1000;
const MIN_ATR_PRICE_RATIO = 0.0005;
const MAX_SPREAD_STOP_RATIO = 0.20;
const MIN_SIGNAL_SCORE = 6;
const ENABLE_SELLS = true;

// Trailing SL thresholds (in ATR multiples of profit)
const TRAIL_LOCK_PROFIT_ATR = 1.5;   // When profit >= 1.5 ATR, lock SL at entry + 0.5 ATR
const TRAIL_LOCK_SL_ATR = 0.5;
const TRAIL_ACTIVE_PROFIT_ATR = 2.0; // When profit >= 2.0 ATR, trail SL at 1.0 ATR behind price
const TRAIL_DISTANCE_ATR = 1.0;

// Session filter (UTC hours)
const SESSION_START_HOUR = 7;
const SESSION_END_HOUR = 17;

// ── OANDA helpers ──
async function oandaFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${OANDA_API}${path}`, {
    ...options,
    redirect: "follow",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OANDA ${path} [${res.status}]: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getCandles(pair: string, granularity: string, count: number, token: string) {
  try {
    const data = await oandaFetch(`/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}&price=M`, token);
    return (data.candles || []).filter((c: any) => c.complete !== false).map((c: any) => ({
      o: parseFloat(c.mid.o), h: parseFloat(c.mid.h), l: parseFloat(c.mid.l), c: parseFloat(c.mid.c), time: c.time,
    }));
  } catch { return []; }
}

// ── Technical Indicators ──
function calcSMA(candles: { c: number }[], period: number): number | null {
  if (candles.length < period) return null;
  return candles.slice(-period).reduce((s, c) => s + c.c, 0) / period;
}

function calcEMA(candles: { c: number }[], period: number): number | null {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles[0].c;
  for (let i = 1; i < candles.length; i++) ema = candles[i].c * k + ema * (1 - k);
  return ema;
}

function calcEMASlope(candles: { c: number }[], period: number): "rising" | "falling" | "flat" {
  if (candles.length < period + 3) return "flat";
  const k = 2 / (period + 1);
  let ema = candles[0].c;
  const emaVals: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
    if (i >= candles.length - 4) emaVals.push(ema);
  }
  if (emaVals.length < 3) return "flat";
  const diff = emaVals[emaVals.length - 1] - emaVals[0];
  if (diff > 0) return "rising";
  if (diff < 0) return "falling";
  return "flat";
}

function calcATR(candles: { h: number; l: number; c: number }[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c)));
  }
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calcRSI(candles: { c: number }[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[candles.length - period - 1 + i].c - candles[candles.length - period - 1 + i - 1].c;
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period; avgLoss /= period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ── Pip helpers ──
function getPipSize(pair: string): number {
  if (pair === "XAU_USD") return 0.01;
  if (pair.includes("JPY")) return 0.01;
  return 0.0001;
}
function getPipValueUSD(pair: string, price: number): number {
  const ps = getPipSize(pair);
  if (pair === "XAU_USD") return 0.01;
  if (pair.endsWith("_USD")) return ps;
  if (pair.startsWith("USD_")) return ps / price;
  return ps / price;
}
function getOandaPrecision(pair: string): number {
  if (pair === "XAU_USD") return 3;
  if (pair.includes("JPY")) return 3;
  return 5;
}
function formatPrice(price: number, pair: string): string {
  return price.toFixed(getOandaPrecision(pair));
}

// ── Session filter ──
function isValidSession(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= SESSION_START_HOUR && hour < SESSION_END_HOUR;
}

// ── Signal scoring ──
interface ScoreResult {
  score: number;
  details: string[];
  direction: "buy" | "sell";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  units: number;
  atr: number;
}

function scoreSignal(
  pair: string, h1: any[], d1: any[],
  bid: number, ask: number, spread: number,
  equity: number
): { result: ScoreResult | null; reason: string } {
  if (h1.length < SMA_PERIOD + 1) return { result: null, reason: "insufficient_h1" };
  if (d1.length < D1_SMA_PERIOD) return { result: null, reason: "insufficient_d1" };

  const sma200 = calcSMA(h1, SMA_PERIOD)!;
  const ema20 = calcEMA(h1, EMA_PERIOD)!;
  const atr = calcATR(h1, ATR_PERIOD)!;
  const rsi = calcRSI(h1, RSI_PERIOD);
  const sma50d1 = calcSMA(d1, D1_SMA_PERIOD)!;
  const emaSlope = calcEMASlope(h1, EMA_PERIOD);

  if (!sma200 || !ema20 || !atr) return { result: null, reason: "indicator_fail" };

  const last = h1[h1.length - 1];
  const price = last.c;
  const stopDistance = ATR_SL_MULT * atr;

  // Hard filters
  if (atr < price * MIN_ATR_PRICE_RATIO) return { result: null, reason: `low_vol` };
  if (spread > stopDistance * MAX_SPREAD_STOP_RATIO) return { result: null, reason: `spread_too_wide` };

  const isBullish = price > sma200;
  const isBearish = price < sma200;
  if (!isBullish && !isBearish) return { result: null, reason: "no_h1_trend" };

  const direction: "buy" | "sell" = isBullish ? "buy" : "sell";
  if (direction === "sell" && !ENABLE_SELLS) return { result: null, reason: "sells_disabled" };

  // ── Scoring ──
  let score = 0;
  const details: string[] = [];

  // 1. D1 trend alignment (+2)
  const d1Bullish = price > sma50d1;
  if ((direction === "buy" && d1Bullish) || (direction === "sell" && !d1Bullish)) {
    score += 2; details.push("D1_aligned+2");
  }

  // 2. Pullback quality (+2)
  const distToEma = Math.abs(price - ema20);
  const pbATR = distToEma / atr;
  if (pbATR >= PULLBACK_MIN_ATR && pbATR <= PULLBACK_MAX_ATR) {
    score += 2; details.push(`pullback_${pbATR.toFixed(2)}ATR+2`);
  }

  // 3. Candle body strength (+2)
  const body = Math.abs(last.c - last.o);
  const range = last.h - last.l;
  const bodyRatio = range > 0 ? body / range : 0;
  const candleMatchesTrend = (direction === "buy" && last.c > last.o) || (direction === "sell" && last.c < last.o);
  if (bodyRatio >= MOMENTUM_BODY_RATIO && candleMatchesTrend) {
    score += 2; details.push(`candle_${(bodyRatio*100).toFixed(0)}%+2`);
  }

  // 4. EMA slope (+1)
  if ((direction === "buy" && emaSlope === "rising") || (direction === "sell" && emaSlope === "falling")) {
    score += 1; details.push("ema_slope+1");
  }

  // 5. RSI filter (+1)
  if (rsi !== null) {
    const rsiOk = direction === "buy" ? (rsi >= 35 && rsi <= 55) : (rsi >= 45 && rsi <= 65);
    if (rsiOk) { score += 1; details.push(`rsi_${rsi.toFixed(0)}+1`); }
  }

  // 6. Spread quality (+1)
  if (spread < stopDistance * 0.10) {
    score += 1; details.push("tight_spread+1");
  }

  if (score < MIN_SIGNAL_SCORE) return { result: null, reason: `score_${score}_below_${MIN_SIGNAL_SCORE}` };

  // ── Position sizing ──
  const entry = direction === "buy" ? ask : bid;
  const sl = direction === "buy" ? entry - stopDistance : entry + stopDistance;
  const tp = direction === "buy" ? entry + stopDistance * RR_TARGET : entry - stopDistance * RR_TARGET;

  const slippageBuffer = spread * 0.5;
  const effectiveStop = stopDistance + spread + slippageBuffer;
  const riskAmount = equity * RISK_PERCENT / 100;
  const pipValue = getPipValueUSD(pair, entry);
  const effectiveStopPips = effectiveStop / getPipSize(pair);
  const units = Math.floor(riskAmount / (effectiveStopPips * pipValue));
  if (units <= 0) return { result: null, reason: "zero_units" };

  return {
    result: { score, details, direction, entry, stopLoss: sl, takeProfit: tp, units, atr },
    reason: "valid",
  };
}

// ── Trailing Stop Management ──
async function manageTrailingStops(token: string, accountId: string, supabaseUrl: string, supabaseKey: string) {
  const log: string[] = [];
  try {
    const openTradesData = await oandaFetch(`/v3/accounts/${accountId}/openTrades`, token);
    const oandaTrades = openTradesData.trades || [];
    if (oandaTrades.length === 0) return { modified: 0, log };

    for (const ot of oandaTrades) {
      const pair = ot.instrument;
      const entryPrice = parseFloat(ot.price);
      const currentUnits = parseInt(ot.currentUnits);
      const isLong = currentUnits > 0;
      const unrealizedPL = parseFloat(ot.unrealizedPL || "0");
      const currentSL = ot.stopLossOrder ? parseFloat(ot.stopLossOrder.price) : null;

      // Get current ATR for this pair
      const candles = await getCandles(pair, "H1", ATR_PERIOD + 5, token);
      const atr = calcATR(candles, ATR_PERIOD);
      if (!atr || atr <= 0) continue;

      // Get current price
      const pricingData = await oandaFetch(`/v3/accounts/${accountId}/pricing?instruments=${pair}`, token);
      const priceInfo = pricingData.prices?.[0];
      if (!priceInfo) continue;
      const currentPrice = isLong ? parseFloat(priceInfo.bids[0].price) : parseFloat(priceInfo.asks[0].price);

      // Calculate profit in ATR multiples
      const profitDistance = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
      const profitATR = profitDistance / atr;

      let newSL: number | null = null;

      if (profitATR >= TRAIL_ACTIVE_PROFIT_ATR) {
        // Full trailing: SL at 1.0 ATR behind current price
        const trailSL = isLong ? currentPrice - TRAIL_DISTANCE_ATR * atr : currentPrice + TRAIL_DISTANCE_ATR * atr;
        // Only move SL if it's BETTER than current
        if (currentSL === null || (isLong && trailSL > currentSL) || (!isLong && trailSL < currentSL)) {
          newSL = trailSL;
          log.push(`${pair}: Trail SL to ${formatPrice(trailSL, pair)} (profit ${profitATR.toFixed(1)} ATR)`);
        }
      } else if (profitATR >= TRAIL_LOCK_PROFIT_ATR) {
        // Lock profit: SL at entry + 0.5 ATR
        const lockSL = isLong ? entryPrice + TRAIL_LOCK_SL_ATR * atr : entryPrice - TRAIL_LOCK_SL_ATR * atr;
        if (currentSL === null || (isLong && lockSL > currentSL) || (!isLong && lockSL < currentSL)) {
          newSL = lockSL;
          log.push(`${pair}: Lock SL to ${formatPrice(lockSL, pair)} (profit ${profitATR.toFixed(1)} ATR)`);
        }
      }

      if (newSL !== null) {
        try {
          await oandaFetch(`/v3/accounts/${accountId}/trades/${ot.id}/orders`, token, {
            method: "PUT",
            body: JSON.stringify({ stopLoss: { price: formatPrice(newSL, pair), timeInForce: "GTC" } }),
          });
        } catch (e) {
          log.push(`${pair}: SL modify failed: ${e}`);
        }
      }

      // Sync to Supabase
      try {
        await fetch(`${supabaseUrl}/rest/v1/trades?broker_trade_id=eq.${ot.id}&status=eq.open`, {
          method: "PATCH",
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ profit_loss: unrealizedPL, exit_price: currentPrice, stop_loss: newSL || currentSL, updated_at: new Date().toISOString() }),
        });
      } catch {}
    }
    return { modified: log.length, log };
  } catch (e) {
    log.push(`Trail error: ${e}`);
    return { modified: 0, log };
  }
}

// ── MAIN HANDLER ──
export default async function handler(req: Request) {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OANDA_TOKEN = process.env.OANDA_API_TOKEN;
  const OANDA_ACCOUNT = process.env.OANDA_ACCOUNT_ID;
  const SB_URL = process.env.VITE_SUPABASE_URL;
  const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!OANDA_TOKEN || !OANDA_ACCOUNT) {
    return new Response(JSON.stringify({ error: "OANDA env vars missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Session check
    if (!isValidSession()) {
      return new Response(JSON.stringify({ status: "outside_session", hours: `${SESSION_START_HOUR}-${SESSION_END_HOUR} UTC` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get account info
    const accountData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT}/summary`, OANDA_TOKEN);
    const account = accountData.account;
    const balance = parseFloat(account.balance);
    const equity = parseFloat(account.NAV || account.balance);
    const unrealizedPL = parseFloat(account.unrealizedPL || "0");

    // 3. Manage trailing stops on open trades FIRST
    const trailResult = await manageTrailingStops(OANDA_TOKEN, OANDA_ACCOUNT, SB_URL || "", SB_KEY || "");

    // 4. Get open trades
    const openTradesData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT}/openTrades`, OANDA_TOKEN);
    const openTrades = openTradesData.trades || [];

    // Sync to Supabase: update bot_config
    if (SB_URL && SB_KEY) {
      await fetch(`${SB_URL}/rest/v1/bot_config?id=not.is.null`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ balance, daily_pnl: unrealizedPL, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    // Check trade spacing
    if (SB_URL && SB_KEY) {
      const configRes = await fetch(`${SB_URL}/rest/v1/bot_config?select=last_trade_at&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (configRes.ok) {
        const configs = await configRes.json();
        if (configs[0]?.last_trade_at) {
          const elapsed = Date.now() - new Date(configs[0].last_trade_at).getTime();
          if (elapsed < TRADE_SPACING_MS) {
            return new Response(JSON.stringify({
              status: "trade_spacing", seconds_remaining: Math.ceil((TRADE_SPACING_MS - elapsed) / 1000),
              account: { balance, equity, open_trades: openTrades.length },
              trailing: trailResult,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
    }

    // Max concurrent check
    if (openTrades.length >= MAX_CONCURRENT) {
      return new Response(JSON.stringify({
        status: "max_concurrent", open: openTrades.length, max: MAX_CONCURRENT,
        account: { balance, equity }, trailing: trailResult,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. Get pricing
    const instruments = Object.keys(INSTRUMENTS).join(",");
    const pricingData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT}/pricing?instruments=${instruments}`, OANDA_TOKEN);
    const prices: Record<string, { bid: number; ask: number; spread: number }> = {};
    for (const p of (pricingData.prices || [])) {
      const bid = parseFloat(p.bids?.[0]?.price || "0");
      const ask = parseFloat(p.asks?.[0]?.price || "0");
      prices[p.instrument] = { bid, ask, spread: ask - bid };
    }

    // Correlation check
    const openPairs = new Set(openTrades.map((t: any) => t.instrument));
    const usdCorrelatedOpen = openTrades.filter((t: any) => USD_CORRELATED.has(t.instrument)).length;

    // 6. Evaluate each pair
    const results: any[] = [];
    const signals: any[] = [];

    for (const pair of Object.keys(INSTRUMENTS)) {
      if (openPairs.has(pair)) { results.push({ pair, executed: false, reason: "already_open" }); continue; }
      if (usdCorrelatedOpen + signals.length >= MAX_USD_CORRELATED) { results.push({ pair, executed: false, reason: "usd_correlation_cap" }); continue; }
      if (openTrades.length + signals.length >= MAX_CONCURRENT) { results.push({ pair, executed: false, reason: "max_concurrent" }); continue; }

      const p = prices[pair];
      if (!p) { results.push({ pair, executed: false, reason: "no_price" }); continue; }

      // Get candles
      const [h1Candles, d1Candles] = await Promise.all([
        getCandles(pair, "H1", SMA_PERIOD + ATR_PERIOD + 5, OANDA_TOKEN),
        getCandles(pair, "D", D1_SMA_PERIOD + 5, OANDA_TOKEN),
      ]);

      const evaluation = scoreSignal(pair, h1Candles, d1Candles, p.bid, p.ask, p.spread, equity);
      if (!evaluation.result) {
        results.push({ pair, executed: false, reason: evaluation.reason });
        continue;
      }

      // Total risk check
      const currentRisk = (openTrades.length + signals.length) * RISK_PERCENT;
      if (currentRisk + RISK_PERCENT > MAX_TOTAL_RISK) {
        results.push({ pair, executed: false, reason: "total_risk_cap" });
        continue;
      }

      signals.push({ pair, ...evaluation.result });
    }

    // 7. Execute signals
    for (const sig of signals) {
      const signedUnits = sig.direction === "sell" ? -sig.units : sig.units;
      const orderBody = {
        order: {
          type: "MARKET", instrument: sig.pair, units: signedUnits.toString(),
          timeInForce: "FOK", positionFill: "DEFAULT",
          stopLossOnFill: { price: formatPrice(sig.stopLoss, sig.pair), timeInForce: "GTC" },
          takeProfitOnFill: { price: formatPrice(sig.takeProfit, sig.pair) },
        },
      };

      try {
        const orderResult = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT}/orders`, OANDA_TOKEN, {
          method: "POST", body: JSON.stringify(orderBody),
        });

        const fill = orderResult.orderFillTransaction;
        if (fill) {
          const fillPrice = parseFloat(fill.price || "0");
          const openedTradeId = fill.tradeOpened?.tradeID || null;

          // Save to Supabase
          if (SB_URL && SB_KEY) {
            const reasoning = `v3 Score ${sig.score}/9 | ${sig.direction.toUpperCase()} | ${sig.details.join(", ")}`;
            await fetch(`${SB_URL}/rest/v1/trades`, {
              method: "POST",
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                pair: INSTRUMENTS[sig.pair] || sig.pair, direction: sig.direction,
                entry_price: fillPrice, status: openedTradeId ? "open" : "closed",
                broker: "oanda", broker_order_id: fill.orderID, broker_trade_id: openedTradeId,
                instrument: sig.pair, units: signedUnits,
                stop_loss: sig.stopLoss, take_profit: sig.takeProfit,
                signal_reason: reasoning, profit_loss: 0,
                closed_at: openedTradeId ? null : new Date().toISOString(),
              }),
            }).catch(() => {});

            await fetch(`${SB_URL}/rest/v1/trade_signals`, {
              method: "POST",
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                pair: INSTRUMENTS[sig.pair] || sig.pair, signal: sig.direction,
                confidence: sig.score * 11, reasoning: `v3 | ${sig.details.join(", ")}`,
                executed: true, oanda_data: prices,
              }),
            }).catch(() => {});

            await fetch(`${SB_URL}/rest/v1/bot_config?id=not.is.null`, {
              method: "PATCH",
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ last_trade_at: new Date().toISOString() }),
            }).catch(() => {});
          }

          results.push({
            pair: sig.pair, executed: true, direction: sig.direction,
            score: sig.score, details: sig.details, units: sig.units,
            sl: sig.stopLoss, tp: sig.takeProfit, atr: sig.atr,
          });
        } else {
          results.push({ pair: sig.pair, executed: false, reason: orderResult.orderRejectTransaction?.rejectReason || "no_fill" });
        }
      } catch (e) {
        results.push({ pair: sig.pair, executed: false, error: String(e) });
      }
    }

    // 8. Close sync: mark DB trades as closed if OANDA no longer has them
    if (SB_URL && SB_KEY) {
      try {
        const dbTradesRes = await fetch(`${SB_URL}/rest/v1/trades?status=eq.open&select=id,broker_trade_id,created_at`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        });
        if (dbTradesRes.ok) {
          const dbTrades = await dbTradesRes.json();
          const oandaIds = new Set(openTrades.map((t: any) => t.id));
          for (const dbt of dbTrades) {
            if (dbt.broker_trade_id && !oandaIds.has(dbt.broker_trade_id)) {
              let finalPL = 0;
              try {
                const txData = await oandaFetch(`/v3/accounts/${OANDA_ACCOUNT}/trades/${dbt.broker_trade_id}`, OANDA_TOKEN);
                finalPL = parseFloat(txData.trade?.realizedPL || "0");
              } catch {}
              await fetch(`${SB_URL}/rest/v1/trades?id=eq.${dbt.id}`, {
                method: "PATCH",
                headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ status: "closed", profit_loss: finalPL, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
              });
            } else if (!dbt.broker_trade_id && Date.now() - new Date(dbt.created_at).getTime() >= ORPHAN_TRADE_GRACE_MS) {
              await fetch(`${SB_URL}/rest/v1/trades?id=eq.${dbt.id}`, {
                method: "PATCH",
                headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
              });
            }
          }
        }
      } catch {}
    }

    const executed = results.filter((r: any) => r.executed).length;
    return new Response(JSON.stringify({
      status: "scan_complete", strategy: "v3_trend_pullback_scored",
      account: { balance, equity, open_trades: openTrades.length, unrealized_pl: unrealizedPL },
      risk_config: { risk_percent: RISK_PERCENT, max_total: MAX_TOTAL_RISK, max_concurrent: MAX_CONCURRENT },
      trailing: trailResult,
      results, executed,
      scanned_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
