
-- Trades table: stores all executed trades
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  entry_price NUMERIC,
  exit_price NUMERIC,
  stake NUMERIC NOT NULL DEFAULT 0.50,
  profit_loss NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled')),
  deriv_contract_id TEXT,
  signal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bot config table: stores bot settings and state
CREATE TABLE public.bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_risk_percent NUMERIC NOT NULL DEFAULT 0.5,
  balance NUMERIC NOT NULL DEFAULT 1000.00,
  daily_pnl NUMERIC NOT NULL DEFAULT 0,
  pairs_watched TEXT[] NOT NULL DEFAULT ARRAY['frxXAUUSD', 'frxEURUSD', 'frxGBPUSD', 'frxGBPJPY', 'frxUSDJPY'],
  news_blackout_active BOOLEAN NOT NULL DEFAULT false,
  last_scan_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trade signals: AI reasoning log
CREATE TABLE public.trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('buy', 'sell', 'hold')),
  confidence NUMERIC,
  reasoning TEXT,
  finnhub_data JSONB,
  gemini_analysis TEXT,
  executed BOOLEAN NOT NULL DEFAULT false,
  trade_id UUID REFERENCES public.trades(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages for Prexi AI terminal
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default bot config
INSERT INTO public.bot_config (is_active, balance) VALUES (false, 1000.00);

-- Enable realtime for trades and bot_config
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_config;

-- RLS: public access for now (no auth yet)
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on trades" ON public.trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bot_config" ON public.bot_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on trade_signals" ON public.trade_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_messages" ON public.chat_messages FOR ALL USING (true) WITH CHECK (true);
