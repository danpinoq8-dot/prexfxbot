export const config = { runtime: "edge" };
export default async function handler(req: Request) {
  const body = req.method === "POST" ? await req.json() : { run_scan: true };
  const res = await fetch("https://runtime.codewords.ai/run/prexfx_exit_engine_0e1de2be", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer cwk-cffb2da4746913670632b627b01d497bba3b46d9f4953e1fb55f796b87ff739e" },
    body: JSON.stringify(body),
  });
  const data = await res.text();
  return new Response(data, { status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
