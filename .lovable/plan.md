
Goal: make PREXI truly OANDA-backed, fully automatic, and stop showing placeholder/fake data.

What’s going on right now
- The app is not actually using OANDA for execution. OANDA only appears as symbol labels inside the signal engine; real price fetching and trade execution are still Deriv-based.
- The automation loop is already running every 2 minutes, so the main problem is not scheduling.
- No trades are being placed because the live quote feed is failing and the engine is only producing `hold` signals. Recent scans wrote signals, but `trades` is empty.
- The “real-time chart” is still a placeholder component with no live data source.
- The balance is fake because it comes from `bot_config.balance`, which is still the default `1000.00`, not a broker sync.
- Win rate/performance panels are also fake in multiple places because they still use hardcoded mock arrays.
- PREXI chat does not know the real app/broker state. It is just a generic AI stream, so it cannot reliably explain why a trade did or didn’t happen.

Plan
1. Switch the broker/data layer to OANDA
   - Remove Deriv-based execution and Deriv-based price scanning.
   - Add OANDA-backed account, pricing, candle, positions, order, and transaction sync flows.
   - Normalize symbols to OANDA instruments like `XAU_USD`, `EUR_USD`, `GBP_JPY`, while keeping friendly labels in the UI.

2. Make auto-trading actually automatic
   - Rebuild the trade engine to use OANDA pricing plus the existing AI decision layer and risk rules.
   - When the bot is active and a signal passes the threshold, place the order directly on OANDA practice/live instead of stopping at a signal.
   - Save exact broker responses and rejection reasons so failures are visible.

3. Fix real account balance and stats
   - Sync account summary from OANDA into the app so balance/equity/margin are real.
   - Compute win rate, open trades, total trades, and PnL from synced trade data instead of mock values.
   - Replace the misleading local key modal with a broker connection/status panel.

4. Fix the live chart
   - Replace the placeholder chart with a real candlestick chart driven by OANDA candles for the selected pair.
   - Add responsive refresh/polling so it works on the current mobile-sized layout too.

5. Give PREXI real awareness
   - Feed PREXI the current bot state, latest account snapshot, recent signals, open trades, last execution result, and scanner health.
   - Update its instructions so it explains the real reason no order was placed, instead of generic “advisor only” behavior.
   - Let PREXI describe what’s happening in the app using live backend data.

6. Remove fake UI everywhere
   - Replace mock data in Market Scout, Trade Vault, Intelligence Vault, audit history, and any sample trade cards with real backend data.
   - Keep any projection content only if it is clearly labeled as a projection, not live account performance.

7. Secure the trading backend
   - Remove the current public-write access on trading tables.
   - Move bot toggles and write actions behind protected backend calls so random visitors cannot change signals, balances, or trades.

Technical details
- Current evidence:
  - recent `trade_signals` exist, but all are `hold`
  - `trades` currently has no rows
  - `bot_config.balance` is still `1000.00`
  - chart component is still a placeholder
  - several UI panels still render hardcoded mock arrays
- Schema updates I would make:
  - replace `deriv_contract_id` with broker-agnostic fields such as `broker`, `broker_order_id`, `broker_trade_id`, `instrument`, `units`, `stop_loss`, `take_profit`, `broker_payload`
  - add execution/run metadata so the UI and PREXI can show why scans/orders succeeded or failed
- Target flow:
```text
OANDA account + pricing + candles
            ↓
      trade-engine
            ↓
 trade_signals / trades / account sync
            ↓
 Tactical Hub / Terminal / Vault / Chart
```
- Prerequisite:
  - there are currently no OANDA runtime secrets configured in the project, so the implementation will need your OANDA API token and account ID added before the switch can be completed
