-- Add OANDA-specific columns to trades table
ALTER TABLE public.trades 
  ADD COLUMN IF NOT EXISTS broker text DEFAULT 'oanda',
  ADD COLUMN IF NOT EXISTS broker_order_id text,
  ADD COLUMN IF NOT EXISTS broker_trade_id text,
  ADD COLUMN IF NOT EXISTS instrument text,
  ADD COLUMN IF NOT EXISTS units numeric,
  ADD COLUMN IF NOT EXISTS stop_loss numeric,
  ADD COLUMN IF NOT EXISTS take_profit numeric,
  ADD COLUMN IF NOT EXISTS broker_payload jsonb;

-- Add oanda_data column to trade_signals
ALTER TABLE public.trade_signals 
  ADD COLUMN IF NOT EXISTS oanda_data jsonb;