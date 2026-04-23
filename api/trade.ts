// PREXFX v4 — Hard Filters, Structure SL, Commitment Entries
// No scoring. Every filter must pass. Quality over quantity.

const OANDA_API = "https://api-fxpractice.oanda.com";
const INSTRUMENTS: Record<string, string> = {
  EUR_USD: "EUR/USD", GBP_USD: "GBP/USD", USD_JPY: "USD/JPY",
  XAU_USD: "XAU/USD", AUD_USD: "AUD/USD", USD_CAD: "USD/CAD",
};
const USD_CORRELATED = new Set(Object.keys(INSTRUMENTS));

// ── CONSTANTS ──
const RISK_PERCENT = 0.5;
const MAX_CONCURRENT = 4;
const MAX_USD_CORRELATED = 2;
const MAX_DAILY_TRADES = 3;
const SMA_PERIOD = 200;
const EMA_PERIOD = 20;
const ATR_PERIOD = 14;
const RSI_PERIOD = 14;
const D1_SMA_PERIOD = 50;
const PULLBACK_MIN_ATR = 0.5;
const PULLBACK_MAX_ATR = 0.8;
const RR_TARGET = 2;
const SWING_LOOKBACK = 15;
const MAX_SL_ATR = 2.5;           // reject if structure SL > 2.5 ATR
const SL_ATR_BUFFER = 0.3;        // buffer beyond swing point
const MIN_ATR_PRICE_RATIO = 0.0005;
const MAX_SPREAD_STOP_RATIO = 0.20;
const TRADE_SPACING_MS = 5 * 60 * 1000;
const ORPHAN_GRACE_MS = 2 * 60 * 1000;
const ENABLE_SELLS = true;

// Trailing: no trail until +2R, then BE, then 1.5 ATR trail
const TRAIL_BE_THRESHOLD_R = 2.0;  // move to breakeven at +2R
const TRAIL_ACTIVE_R = 2.5;       // start trailing at +2.5R
const TRAIL_DISTANCE_ATR = 1.5;   // trail distance

const SESSION_START = 7;
const SESSION_END = 17;

// ── OANDA ──
async function oa(path: string, token: string, opts?: RequestInit) {
  const r = await fetch(`${OANDA_API}${path}`, {
    ...opts, redirect: "follow",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`OANDA ${path} [${r.status}]: ${t.slice(0, 200)}`); }
  return r.json();
}

async function getCandles(pair: string, gran: string, count: number, token: string) {
  try {
    const d = await oa(`/v3/instruments/${pair}/candles?granularity=${gran}&count=${count}&price=M`, token);
    return (d.candles || []).filter((c: any) => c.complete !== false).map((c: any) => ({
      o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c, time: c.time,
    }));
  } catch { return []; }
}

// ── INDICATORS ──
type Bar = { o: number; h: number; l: number; c: number };

function sma(bars: { c: number }[], p: number) {
  if (bars.length < p) return null;
  return bars.slice(-p).reduce((s, b) => s + b.c, 0) / p;
}
function ema(bars: { c: number }[], p: number) {
  if (bars.length < p) return null;
  const k = 2 / (p + 1); let e = bars[0].c;
  for (let i = 1; i < bars.length; i++) e = bars[i].c * k + e * (1 - k);
  return e;
}
function atr(bars: Bar[], p: number) {
  if (bars.length < p + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++)
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
  return trs.slice(-p).reduce((s, v) => s + v, 0) / p;
}
function rsi(bars: { c: number }[], p: number) {
  if (bars.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = bars.length - p; i < bars.length; i++) {
    const d = bars[i].c - bars[i - 1].c;
    if (d > 0) g += d; else l += Math.abs(d);
  }
  g /= p; l /= p;
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}

// ── SWING POINTS ──
function swingLow(bars: Bar[], lookback: number) {
  return Math.min(...bars.slice(-lookback).map(b => b.l));
}
function swingHigh(bars: Bar[], lookback: number) {
  return Math.max(...bars.slice(-lookback).map(b => b.h));
}

// ── ENTRY TRIGGERS ──
function candleBreak(bars: Bar[], dir: "buy" | "sell") {
  const curr = bars[bars.length - 1], prev = bars[bars.length - 2];
  if (dir === "buy") return curr["c"] > prev["h"];  // closed above prev high
  return curr["c"] < prev["l"];                      // closed below prev low
}
function engulfing(bars: Bar[], dir: "buy" | "sell") {
  const curr = bars[bars.length - 1], prev = bars[bars.length - 2];
  if (dir === "buy") return curr.o <= prev.c && curr.c >= prev.o && curr.c > curr.o;
  return curr.o >= prev.c && curr.c <= prev.o && curr.c < curr.o;
}

// ── PIP HELPERS ──
function pipSize(pair: string) { return pair === "XAU_USD" ? 0.01 : pair.includes("JPY") ? 0.01 : 0.0001; }
function pipVal(pair: string, price: number) {
  const ps = pipSize(pair);
  if (pair === "XAU_USD") return 0.01;
  if (pair.endsWith("_USD")) return ps;
  if (pair.startsWith("USD_")) return ps / price;
  return ps / price;
}
function prec(pair: string) { return pair === "XAU_USD" || pair.includes("JPY") ? 3 : 5; }
function fmt(price: number, pair: string) { return price.toFixed(prec(pair)); }

// ── SUPABASE HELPERS ──
async function sbPatch(url: string, key: string, path: string, body: any) {
  return fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
async function sbPost(url: string, key: string, path: string, body: any) {
  return fetch(`${url}/rest/v1/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
async function sbGet(url: string, key: string, path: string) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok ? r.json() : [];
}

// ── EVALUATE PAIR (hard filters only) ──
interface Signal {
  pair: string; direction: "buy" | "sell"; entry: number;
  stopLoss: number; takeProfit: number; units: number;
  atrVal: number; slDistance: number; reasoning: string;
}

function evaluate(
  pair: string, h1: Bar[], d1: { c: number }[],
  bid: number, ask: number, spread: number, equity: number
): { signal: Signal | null; reason: string } {

  // Indicators
  const sma200 = sma(h1, SMA_PERIOD);
  const ema20 = ema(h1, EMA_PERIOD);
  const atrVal = atr(h1, ATR_PERIOD);
  const rsiVal = rsi(h1, RSI_PERIOD);
  const sma50d1 = sma(d1, D1_SMA_PERIOD);
  if (!sma200 || !ema20 || !atrVal || !sma50d1) return { signal: null, reason: "indicators_missing" };

  const price = h1[h1.length - 1].c;

  // FILTER 1: Volatility
  if (atrVal < price * MIN_ATR_PRICE_RATIO) return { signal: null, reason: "low_vol" };

  // FILTER 2: H1 trend direction
  const dir: "buy" | "sell" = price > sma200 ? "buy" : "sell";
  if (dir === "sell" && !ENABLE_SELLS) return { signal: null, reason: "sells_off" };

  // FILTER 3: D1 alignment (MUST match)
  const d1ok = (dir === "buy" && price > sma50d1) || (dir === "sell" && price < sma50d1);
  if (!d1ok) return { signal: null, reason: "d1_conflict" };

  // FILTER 4: Pullback zone 0.5-0.8 ATR from EMA20
  const pbATR = Math.abs(price - ema20) / atrVal;
  if (pbATR < PULLBACK_MIN_ATR || pbATR > PULLBACK_MAX_ATR) return { signal: null, reason: `pb_${pbATR.toFixed(2)}` };

  // FILTER 5: Entry trigger — candle break OR engulfing (commitment)
  const triggered = candleBreak(h1, dir) || engulfing(h1, dir);
  if (!triggered) return { signal: null, reason: "no_trigger" };

  // FILTER 6: RSI zone
  if (rsiVal !== null) {
    const rsiOk = dir === "buy" ? (rsiVal >= 35 && rsiVal <= 55) : (rsiVal >= 45 && rsiVal <= 65);
    if (!rsiOk) return { signal: null, reason: `rsi_${rsiVal.toFixed(0)}` };
  }

  // FILTER 7: Spread
  const stopDist = 1.5 * atrVal; // preliminary for spread check
  if (spread > stopDist * MAX_SPREAD_STOP_RATIO) return { signal: null, reason: "spread" };

  // ── STRUCTURE-BASED STOP LOSS ──
  let sl: number;
  if (dir === "buy") {
    const swLow = swingLow(h1, SWING_LOOKBACK);
    sl = swLow - SL_ATR_BUFFER * atrVal;
  } else {
    const swHigh = swingHigh(h1, SWING_LOOKBACK);
    sl = swHigh + SL_ATR_BUFFER * atrVal;
  }

  const entry = dir === "buy" ? ask : bid;
  const slDistance = Math.abs(entry - sl);

  // Reject if SL too wide
  if (slDistance > MAX_SL_ATR * atrVal) return { signal: null, reason: `sl_too_wide_${(slDistance/atrVal).toFixed(1)}ATR` };
  // Reject if SL too tight (< 0.5 ATR = will get stopped by noise)
  if (slDistance < 0.5 * atrVal) return { signal: null, reason: "sl_too_tight" };

  // TP at 2:1 R:R
  const tp = dir === "buy" ? entry + slDistance * RR_TARGET : entry - slDistance * RR_TARGET;

  // Position sizing
  const slippage = spread * 0.5;
  const effectiveStop = slDistance + spread + slippage;
  const riskAmount = equity * RISK_PERCENT / 100;
  const effStopPips = effectiveStop / pipSize(pair);
  const units = Math.floor(riskAmount / (effStopPips * pipVal(pair, entry)));
  if (units <= 0) return { signal: null, reason: "zero_units" };

  const reasoning = `v4 | ${dir.toUpperCase()} | PB ${pbATR.toFixed(2)}ATR | SL@swing ${fmt(sl, pair)} (${(slDistance/atrVal).toFixed(1)}ATR) | ${candleBreak(h1, dir) ? "break" : "engulf"}`;

  return { signal: { pair, direction: dir, entry, stopLoss: sl, takeProfit: tp, units, atrVal, slDistance, reasoning }, reason: "valid" };
}

// ── TRAILING STOP ──
async function manageTrails(token: string, acctId: string, sbUrl: string, sbKey: string) {
  const log: string[] = [];
  try {
    const data = await oa(`/v3/accounts/${acctId}/openTrades`, token);
    for (const ot of (data.trades || [])) {
      const pair = ot.instrument;
      const entryPrice = +ot.price;
      const isLong = +ot.currentUnits > 0;
      const currentSL = ot.stopLossOrder ? +ot.stopLossOrder.price : null;
      const uPL = +(ot.unrealizedPL || 0);

      const candles = await getCandles(pair, "H1", ATR_PERIOD + 5, token);
      const a = atr(candles, ATR_PERIOD);
      if (!a) continue;

      const pricing = await oa(`/v3/accounts/${acctId}/pricing?instruments=${pair}`, token);
      const p = pricing.prices?.[0];
      if (!p) continue;
      const curPrice = isLong ? +p.bids[0].price : +p.asks[0].price;

      const slDist = currentSL ? Math.abs(entryPrice - currentSL) : 1.5 * a;
      const profitDist = isLong ? curPrice - entryPrice : entryPrice - curPrice;
      const profitR = slDist > 0 ? profitDist / slDist : 0;

      let newSL: number | null = null;

      if (profitR >= TRAIL_ACTIVE_R) {
        // Active trail at 1.5 ATR behind
        const trailSL = isLong ? curPrice - TRAIL_DISTANCE_ATR * a : curPrice + TRAIL_DISTANCE_ATR * a;
        if (!currentSL || (isLong && trailSL > currentSL) || (!isLong && trailSL < currentSL)) {
          newSL = trailSL;
          log.push(`${pair}: trail SL→${fmt(trailSL, pair)} (+${profitR.toFixed(1)}R)`);
        }
      } else if (profitR >= TRAIL_BE_THRESHOLD_R) {
        // Move to breakeven + tiny buffer
        const beSL = isLong ? entryPrice + 0.1 * a : entryPrice - 0.1 * a;
        if (!currentSL || (isLong && beSL > currentSL) || (!isLong && beSL < currentSL)) {
          newSL = beSL;
          log.push(`${pair}: BE SL→${fmt(beSL, pair)} (+${profitR.toFixed(1)}R)`);
        }
      }

      if (newSL !== null) {
        try {
          await oa(`/v3/accounts/${acctId}/trades/${ot.id}/orders`, token, {
            method: "PUT", body: JSON.stringify({ stopLoss: { price: fmt(newSL, pair), timeInForce: "GTC" } }),
          });
        } catch (e) { log.push(`${pair}: modify fail`); }
      }

      // Sync PL to Supabase
      if (sbUrl && sbKey) {
        await sbPatch(sbUrl, sbKey, `trades?broker_trade_id=eq.${ot.id}&status=eq.open`, {
          profit_loss: uPL, exit_price: curPrice, stop_loss: newSL || currentSL, updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (e) { log.push(`trail_err: ${e}`); }
  return log;
}

// ── MAIN ──
export default async function handler(req: Request) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const TOKEN = process.env.OANDA_API_TOKEN!;
  const ACCT = process.env.OANDA_ACCOUNT_ID!;
  const SB = process.env.VITE_SUPABASE_URL || "";
  const SK = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  if (!TOKEN || !ACCT) return new Response(JSON.stringify({ error: "OANDA env missing" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const hour = new Date().getUTCHours();
    const inSession = hour >= SESSION_START && hour < SESSION_END;

    // Always manage trailing stops (even outside session)
    const trailLog = await manageTrails(TOKEN, ACCT, SB, SK);

    // Sync account
    const acctData = await oa(`/v3/accounts/${ACCT}/summary`, TOKEN);
    const balance = +acctData.account.balance;
    const equity = +acctData.account.NAV;
    const uPL = +(acctData.account.unrealizedPL || 0);
    const openTrades = (await oa(`/v3/accounts/${ACCT}/openTrades`, TOKEN)).trades || [];

    if (SB && SK) {
      await sbPatch(SB, SK, "bot_config?id=not.is.null", {
        balance, daily_pnl: uPL, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }

    // Close sync: DB trades no longer on OANDA
    if (SB && SK) {
      const dbOpen = await sbGet(SB, SK, "trades?status=eq.open&select=id,broker_trade_id,created_at");
      const oaIds = new Set(openTrades.map((t: any) => t.id));
      for (const dbt of dbOpen) {
        if (dbt.broker_trade_id && !oaIds.has(dbt.broker_trade_id)) {
          let pl = 0;
          try { pl = +(await oa(`/v3/accounts/${ACCT}/trades/${dbt.broker_trade_id}`, TOKEN)).trade?.realizedPL || 0; } catch {}
          await sbPatch(SB, SK, `trades?id=eq.${dbt.id}`, { status: "closed", profit_loss: pl, closed_at: new Date().toISOString() });
        } else if (!dbt.broker_trade_id && Date.now() - new Date(dbt.created_at).getTime() >= ORPHAN_GRACE_MS) {
          await sbPatch(SB, SK, `trades?id=eq.${dbt.id}`, { status: "closed", closed_at: new Date().toISOString() });
        }
      }
    }

    if (!inSession) {
      return new Response(JSON.stringify({
        status: "outside_session", session: `${SESSION_START}-${SESSION_END} UTC`,
        account: { balance, equity, open: openTrades.length, uPL }, trailing: trailLog,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Daily trade count
    let dailyCount = 0;
    if (SB && SK) {
      const today = new Date().toISOString().slice(0, 10);
      const todayTrades = await sbGet(SB, SK, `trades?created_at=gte.${today}T00:00:00Z&select=id`);
      dailyCount = todayTrades.length;
    }
    if (dailyCount >= MAX_DAILY_TRADES) {
      return new Response(JSON.stringify({
        status: "daily_limit", count: dailyCount, max: MAX_DAILY_TRADES,
        account: { balance, equity, open: openTrades.length }, trailing: trailLog,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Trade spacing
    if (SB && SK) {
      const cfg = await sbGet(SB, SK, "bot_config?select=last_trade_at&limit=1");
      if (cfg[0]?.last_trade_at && Date.now() - new Date(cfg[0].last_trade_at).getTime() < TRADE_SPACING_MS) {
        return new Response(JSON.stringify({
          status: "spacing", account: { balance, equity, open: openTrades.length }, trailing: trailLog,
        }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    if (openTrades.length >= MAX_CONCURRENT) {
      return new Response(JSON.stringify({
        status: "max_open", open: openTrades.length, trailing: trailLog,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Get pricing
    const pData = await oa(`/v3/accounts/${ACCT}/pricing?instruments=${Object.keys(INSTRUMENTS).join(",")}`, TOKEN);
    const prices: Record<string, { bid: number; ask: number; spread: number }> = {};
    for (const p of (pData.prices || [])) {
      const b = +p.bids?.[0]?.price, a = +p.asks?.[0]?.price;
      prices[p.instrument] = { bid: b, ask: a, spread: a - b };
    }

    const openPairs = new Set(openTrades.map((t: any) => t.instrument));
    const usdOpen = openTrades.filter((t: any) => USD_CORRELATED.has(t.instrument)).length;
    const results: any[] = [];
    let executed = 0;

    for (const pair of Object.keys(INSTRUMENTS)) {
      if (openPairs.has(pair)) { results.push({ pair, reason: "open" }); continue; }
      if (usdOpen + executed >= MAX_USD_CORRELATED) { results.push({ pair, reason: "usd_cap" }); continue; }
      if (openTrades.length + executed >= MAX_CONCURRENT) { results.push({ pair, reason: "max" }); continue; }
      if (dailyCount + executed >= MAX_DAILY_TRADES) { results.push({ pair, reason: "daily_max" }); continue; }

      const p = prices[pair];
      if (!p) { results.push({ pair, reason: "no_price" }); continue; }

      const [h1, d1] = await Promise.all([
        getCandles(pair, "H1", SMA_PERIOD + ATR_PERIOD + 5, TOKEN),
        getCandles(pair, "D", D1_SMA_PERIOD + 5, TOKEN),
      ]);

      const ev = evaluate(pair, h1, d1, p.bid, p.ask, p.spread, equity);
      if (!ev.signal) { results.push({ pair, reason: ev.reason }); continue; }

      // Execute
      const sig = ev.signal;
      const signedUnits = sig.direction === "sell" ? -sig.units : sig.units;
      try {
        const or = await oa(`/v3/accounts/${ACCT}/orders`, TOKEN, {
          method: "POST",
          body: JSON.stringify({ order: {
            type: "MARKET", instrument: pair, units: signedUnits.toString(),
            timeInForce: "FOK", positionFill: "DEFAULT",
            stopLossOnFill: { price: fmt(sig.stopLoss, pair), timeInForce: "GTC" },
            takeProfitOnFill: { price: fmt(sig.takeProfit, pair) },
          }}),
        });
        const fill = or.orderFillTransaction;
        if (fill) {
          const tid = fill.tradeOpened?.tradeID || null;
          if (SB && SK) {
            await sbPost(SB, SK, "trades", {
              pair: INSTRUMENTS[pair], direction: sig.direction, entry_price: +fill.price,
              status: tid ? "open" : "closed", broker: "oanda", broker_order_id: fill.orderID,
              broker_trade_id: tid, instrument: pair, units: signedUnits,
              stop_loss: sig.stopLoss, take_profit: sig.takeProfit, signal_reason: sig.reasoning,
              profit_loss: 0, closed_at: tid ? null : new Date().toISOString(),
            });
            await sbPost(SB, SK, "trade_signals", {
              pair: INSTRUMENTS[pair], signal: sig.direction, confidence: 90,
              reasoning: sig.reasoning, executed: true, oanda_data: prices,
            });
            await sbPatch(SB, SK, "bot_config?id=not.is.null", { last_trade_at: new Date().toISOString() });
          }
          results.push({ pair, executed: true, dir: sig.direction, units: sig.units, sl: sig.stopLoss, tp: sig.takeProfit });
          executed++;
        } else {
          results.push({ pair, reason: or.orderRejectTransaction?.rejectReason || "no_fill" });
        }
      } catch (e) { results.push({ pair, reason: `err: ${e}` }); }
    }

    return new Response(JSON.stringify({
      status: "scan_complete", strategy: "v4_hard_filters",
      account: { balance, equity, open: openTrades.length, uPL },
      daily_trades: dailyCount + executed, max_daily: MAX_DAILY_TRADES,
      trailing: trailLog, results, executed,
      scanned_at: new Date().toISOString(),
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
