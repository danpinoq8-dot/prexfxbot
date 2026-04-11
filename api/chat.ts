export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" }
    });
  }

  const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
  if (!CEREBRAS_KEY) {
    return new Response(JSON.stringify({ error: "CEREBRAS_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const body = await req.json();
    const messages = body.messages || [];

    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CEREBRAS_KEY}` },
      body: JSON.stringify({ model: "llama-4-scout-17b-16e-instruct", messages, max_tokens: 2048, temperature: 0.7 }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: errText }), {
        status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "No response from PREXI Brain.";

    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
