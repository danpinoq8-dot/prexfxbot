export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const CW_KEY = "cwk-d01efd18ce040067ae99a41b78eecec8a76c88d21169430cad8d56f83c9eca77";
  const body = await req.json();
  const res = await fetch("https://runtime.codewords.ai/run/prexfx_chat_c365ae47", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codewords-Api-Key": CW_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
