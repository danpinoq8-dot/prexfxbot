export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const SB_URL = process.env.VITE_SUPABASE_URL;
  const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, apikey",
      },
    });
  }

  if (!SB_URL || !SB_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase env vars not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  try {
    const body = await req.text();

    // Forward to Supabase prexi-chat function
    // Handles: SSE streaming, Cerebras llama3.1-8b, live context enrichment
    const res = await fetch(`${SB_URL}/functions/v1/prexi-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SB_KEY}`,
      },
      body,
    });

    // Pipe the SSE stream straight through to the frontend
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") || "text/event-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message || "Chat proxy error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}
