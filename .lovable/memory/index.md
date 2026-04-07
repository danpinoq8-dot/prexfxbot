# Memory: index.md
PrexFx (PREXFX) - AI Risk Architect trading dashboard

## Design System
- Background: Matte Black #0B0B0B (hsl 0 0% 4.3%)
- Text: Brushed Silver #C0C0C0 (hsl 0 0% 75%)
- Font: JetBrains Mono (monospace)
- Glassmorphism panels with backdrop-blur-24px
- Architectural grid overlay (40px grid, 2% white opacity)
- Profit: white glow text-shadow | Loss: dim charcoal

## Architecture
- Broker: OANDA (practice account via REST API)
- Strategy: Trend Pullback (ATR-Structured Momentum) — fully mechanical, no AI brain
- OANDA instruments: XAU_USD, EUR_USD, GBP_USD, GBP_JPY, USD_JPY, AUD_USD, NZD_USD, USD_CAD, USD_CHF, EUR_GBP, EUR_JPY, EUR_AUD, GBP_AUD, AUD_JPY, CAD_JPY, NZD_JPY, GBP_CAD (17 pairs)
- Secrets: OANDA_API_TOKEN, OANDA_ACCOUNT_ID, FINNHUB_API_KEY, CEREBRAS_API_KEY (chat only)

## Strategy Rules (Mechanical)
- Entry: SMA200 trend + EMA20 pullback (0.5-1.5 ATR) + momentum candle (body ≥ 70%)
- Stop Loss: 1.5 × ATR(14)
- Take Profit: 2R fixed
- Risk: 0.1% per trade, 1% max total exposure
- Max 7 concurrent trades, 1 per pair
- Trade spacing: 5 min between entries
- Session: London + NY only (07-21 UTC)
- Circuit breakers: -2R/day OR 3 consecutive losses → halt; -5R/week → halt
- Correlation filter: max 2 USD-correlated trades simultaneously
- Market filters: ATR ≥ 0.05% of price, spread ≤ 20% of stop

## Components
- src/components/prexfx/ — all dashboard components
- All panels use real DB data (no mock arrays)
- PREXI chat uses Cerebras for conversational AI (separate from trade logic)
- market-scanner supports ?mode=candles&instrument=X&granularity=H1&count=48 for chart data
