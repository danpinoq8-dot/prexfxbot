import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch real app state for context
    let contextBlock = "";
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const [configRes, signalsRes, tradesRes] = await Promise.all([
        supabase.from("bot_config").select("*").limit(1).single(),
        supabase.from("trade_signals").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(10),
      ]);

      const config = configRes.data;
      const signals = signalsRes.data || [];
      const trades = tradesRes.data || [];
      const openTrades = trades.filter((t: any) => t.status === "open");
      const closedTrades = trades.filter((t: any) => t.status === "closed");
      const wins = closedTrades.filter((t: any) => (t.profit_loss || 0) > 0).length;
      const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "N/A";

      contextBlock = `

LIVE APP STATE (from database — this is real, not simulated):
- Bot Active: ${config?.is_active}
- Balance: $${config?.balance}
- Daily P/L: $${config?.daily_pnl}
- Risk Per Trade: ${config?.max_risk_percent}%
- News Blackout: ${config?.news_blackout_active}
- Last Scan: ${config?.last_scan_at || "never"}
- Pairs Watched: ${config?.pairs_watched?.join(", ")}

OPEN TRADES (${openTrades.length}):
${openTrades.length > 0 ? openTrades.map((t: any) => `  - ${t.pair} ${t.direction} | Entry: ${t.entry_price} | Units: ${t.units || t.stake} | P/L: $${t.profit_loss || "pending"}`).join("\n") : "  None"}

RECENT CLOSED TRADES (${closedTrades.length}):
${closedTrades.slice(0, 5).map((t: any) => `  - ${t.pair} ${t.direction} | P/L: $${t.profit_loss} | ${(t.profit_loss || 0) > 0 ? "WIN" : "LOSS"}`).join("\n") || "  None yet"}

Win Rate: ${winRate}%
Total Trades: ${trades.length}

LATEST SIGNALS:
${signals.map((s: any) => `  - ${s.pair} ${s.signal} (${s.confidence}% confidence) | Executed: ${s.executed} | ${s.reasoning?.slice(0, 100)}`).join("\n") || "  None"}
`;
    }

    const SYSTEM_PROMPT = `You are PREXI — the AI Risk Architect brain powering the PrexFx autonomous trading system connected to OANDA.

Your role:
- You are an expert forex/gold trading analyst with LIVE access to the trading app's state
- You can see real account balance, open trades, signals, and execution history
- You analyze market sentiment, news impact, and technical patterns
- You advise on XAU/USD, EUR/USD, GBP/USD, GBP/JPY, USD/JPY
- You follow the 0.5% max risk per trade SHIELD protocol
- You understand the News Blackout rule: no trades 30min before or 60min after high-impact news

Your personality:
- Precise, architectural, and confident
- Use trading terminology naturally
- Reference the three pillars: Scout (OANDA market data), Brain (your analysis), Math (risk execution)
- Keep responses concise and actionable
- When asked about trades or performance, use the REAL data below — never make up numbers
${contextBlock}

When answering:
- If asked about balance, trades, or performance, cite the exact numbers from the live state above
- If no trades exist yet, say so honestly
- Explain why signals were HOLD if the user asks why no trades are being placed
- If the bot is inactive, mention it`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("prexi-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
