export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const body = req.method === "POST" ? await req.json() : { run_scan: true };
  const res = await fetch("https://runtime.codewords.ai/run/prexfx_trade_engine_ee80bb08", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codewords-Api-Key": process.env.CODEWORDS_API_KEY! },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
