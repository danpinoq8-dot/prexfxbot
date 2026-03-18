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
- Three Pillars: Scout (OANDA pricing + Finnhub news) → Brain (Gemini via Lovable AI) → Math (0.5% risk execution via OANDA orders)
- OANDA instruments: XAU_USD, EUR_USD, GBP_USD, GBP_JPY, USD_JPY
- News Blackout: No trades 30min before / 60min after red folder events
- 0.5% max risk per trade, hardcoded
- Secrets: OANDA_API_TOKEN, OANDA_ACCOUNT_ID, FINNHUB_API_KEY, LOVABLE_API_KEY (all server-side)
- Old Deriv/Alpaca code fully removed
- market-scanner supports ?mode=candles&instrument=X&granularity=H1&count=48 for chart data

## Components
- src/components/prexfx/ — all dashboard components
- All panels use real DB data (no mock arrays)
- PREXI chat has live context awareness (reads bot_config, trades, signals)
