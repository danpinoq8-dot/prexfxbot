export const config = { runtime: "edge" };
export default async function handler(req: Request) {
  const AW_ENDPOINT = process.env.APPWRITE_FUNCTION_URL;
  const AW_PROJECT = process.env.VITE_APPWRITE_PROJECT_ID;
  const AW_KEY = process.env.VITE_APPWRITE_API_KEY;
  const SB_URL = process.env.VITE_SUPABASE_URL;
  const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
    });
  }

  if (!AW_ENDPOINT || !AW_PROJECT || !AW_KEY) {
    return new Response(JSON.stringify({ error: "Appwrite env vars not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // ── PERMANENT FIX: Auto-reset circuit breakers before every scan ──
  // This ensures the bot never gets stuck due to loss-based halting.
  // Runs on Vercel (free), no Supabase CLI or CodeWords credits needed.
  if (SB_URL && SB_KEY) {
    try {
      const configRes = await fetch(`${SB_URL}/rest/v1/bot_config?select=id,consecutive_losses,daily_loss_r,weekly_loss_r&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (configRes.ok) {
        const configs = await configRes.json();
        if (configs.length > 0) {
          const c = configs[0];
          const tripped = (c.consecutive_losses ?? 0) >= 3 || (c.daily_loss_r ?? 0) >= 2 || (c.weekly_loss_r ?? 0) >= 5;
          if (tripped) {
            await fetch(`${SB_URL}/rest/v1/bot_config?id=eq.${c.id}`, {
              method: "PATCH",
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ consecutive_losses: 0, daily_loss_r: 0, weekly_loss_r: 0 }),
            });
          }
        }
      }
    } catch { /* circuit breaker reset is best-effort, don't block trade engine */ }
  }

  const res = await fetch(AW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Appwrite-Project": AW_PROJECT, "X-Appwrite-Key": AW_KEY },
    body: JSON.stringify({ async: false }),
  });

  const data = await res.json();
  const body = data.responseBody || JSON.stringify(data);
  return new Response(body, {
    status: data.responseStatusCode || res.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
