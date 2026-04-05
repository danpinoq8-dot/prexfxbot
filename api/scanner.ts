export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const body = req.method === "POST" ? await req.json() : { mode: "prices" };
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const instrument = url.searchParams.get("instrument");
  const granularity = url.searchParams.get("granularity");
  const count = url.searchParams.get("count");

  const payload = mode ? { mode, instrument: instrument || "XAU_USD", granularity: granularity || "H1", count: parseInt(count || "48") } : body;

  const res = await fetch("https://runtime.codewords.ai/run/prexfx_market_scanner_7898f5c1", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codewords-Api-Key": process.env.CODEWORDS_API_KEY! },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
