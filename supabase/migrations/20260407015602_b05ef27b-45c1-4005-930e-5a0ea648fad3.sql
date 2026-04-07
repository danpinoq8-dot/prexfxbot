
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS consecutive_losses integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_loss_r numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_trade_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS weekly_loss_r numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS risk_percent numeric NOT NULL DEFAULT 0.1,
ADD COLUMN IF NOT EXISTS max_concurrent_trades integer NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'trend_pullback';
