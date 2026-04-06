export const config = { runtime: "edge" };
export default async function handler(req: Request) {
  const body = req.method === "POST" ? await req.json() : { mode: "prices" };
  const res = await fetch("https://runtime.codewords.ai/run/prexfx_market_scanner_7898f5c1", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer cwk-d01efd18ce040067ae99a41b78eecec8a76c88d21169430cad8d56f83c9eca77" },
    body: JSON.stringify(body),
  });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}